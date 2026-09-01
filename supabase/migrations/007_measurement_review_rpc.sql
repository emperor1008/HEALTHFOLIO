-- Migration 007: Atomic measurement review RPC + correction tracking
-- Provides transactional measurement review with audit event insertion

-- Add correction tracking columns
ALTER TABLE medical_measurements
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS original_value_numeric numeric,
  ADD COLUMN IF NOT EXISTS original_value_text text;

-- Atomic measurement review function
-- Uses auth.uid() inside the function for security
-- Both the measurement update and audit event insert happen in one transaction
CREATE OR REPLACE FUNCTION review_measurement(
  p_measurement_id uuid,
  p_decision text,
  p_correction_reason text DEFAULT NULL,
  p_corrected_value_numeric numeric DEFAULT NULL,
  p_corrected_value_text text DEFAULT NULL,
  p_corrected_reference_low numeric DEFAULT NULL,
  p_corrected_reference_high numeric DEFAULT NULL,
  p_corrected_reference_text text DEFAULT NULL,
  p_corrected_report_flag text DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_measurement record;
  v_update_data jsonb := '{}'::jsonb;
  v_metadata jsonb;
  v_audit_action text;
BEGIN
  -- Validate decision
  IF p_decision NOT IN ('verified', 'corrected', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_DECISION');
  END IF;

  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'errorCode', 'SESSION_REQUIRED');
  END IF;

  -- Fetch and verify ownership
  SELECT id, user_id, verification_status, value_numeric, value_text
  INTO v_measurement
  FROM medical_measurements
  WHERE id = p_measurement_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'errorCode', 'NOT_FOUND');
  END IF;

  -- Build update data
  v_update_data := jsonb_build_object(
    'verification_status', p_decision,
    'updated_at', now()
  );

  -- Handle correction
  IF p_decision = 'corrected' THEN
    IF p_corrected_value_numeric IS NULL AND p_corrected_value_text IS NULL THEN
      RETURN jsonb_build_object('success', false, 'errorCode', 'CORRECTION_REQUIRED');
    END IF;

    v_update_data := v_update_data || jsonb_build_object(
      'corrected_at', now(),
      'correction_reason', p_correction_reason,
      'original_value_numeric', v_measurement.value_numeric,
      'original_value_text', v_measurement.value_text
    );

    IF p_corrected_value_numeric IS NOT NULL THEN
      v_update_data := v_update_data || jsonb_build_object(
        'value_numeric', p_corrected_value_numeric
      );
    END IF;

    IF p_corrected_value_text IS NOT NULL THEN
      v_update_data := v_update_data || jsonb_build_object(
        'value_text', p_corrected_value_text
      );
    END IF;

    IF p_corrected_reference_low IS NOT NULL THEN
      v_update_data := v_update_data || jsonb_build_object(
        'reference_low', p_corrected_reference_low
      );
    END IF;

    IF p_corrected_reference_high IS NOT NULL THEN
      v_update_data := v_update_data || jsonb_build_object(
        'reference_high', p_corrected_reference_high
      );
    END IF;

    IF p_corrected_reference_text IS NOT NULL THEN
      v_update_data := v_update_data || jsonb_build_object(
        'reference_text', p_corrected_reference_text
      );
    END IF;

    IF p_corrected_report_flag IS NOT NULL THEN
      v_update_data := v_update_data || jsonb_build_object(
        'report_flag', p_corrected_report_flag
      );
    END IF;

    v_audit_action := 'measurement_corrected';
  ELSIF p_decision = 'rejected' THEN
    v_update_data := v_update_data || jsonb_build_object(
      'invalidated_at', now()
    );
    v_audit_action := 'measurement_rejected';
  ELSE
    v_audit_action := 'measurement_verified';
  END IF;

  -- Update measurement
  UPDATE medical_measurements
  SET verification_status = (v_update_data->>'verification_status')::text,
      updated_at = (v_update_data->>'updated_at')::timestamptz,
      invalidated_at = CASE WHEN v_update_data ? 'invalidated_at'
                            THEN (v_update_data->>'invalidated_at')::timestamptz
                            ELSE invalidated_at END,
      corrected_at = CASE WHEN v_update_data ? 'corrected_at'
                          THEN (v_update_data->>'corrected_at')::timestamptz
                          ELSE corrected_at END,
      correction_reason = CASE WHEN v_update_data ? 'correction_reason'
                               THEN v_update_data->>'correction_reason'
                               ELSE correction_reason END,
      original_value_numeric = CASE WHEN v_update_data ? 'original_value_numeric'
                                    THEN (v_update_data->>'original_value_numeric')::numeric
                                    ELSE original_value_numeric END,
      original_value_text = CASE WHEN v_update_data ? 'original_value_text'
                                 THEN v_update_data->>'original_value_text'
                                 ELSE original_value_text END,
      value_numeric = CASE WHEN v_update_data ? 'value_numeric'
                           THEN (v_update_data->>'value_numeric')::numeric
                           ELSE value_numeric END,
      value_text = CASE WHEN v_update_data ? 'value_text'
                        THEN v_update_data->>'value_text'
                        ELSE value_text END,
      reference_low = CASE WHEN v_update_data ? 'reference_low'
                           THEN (v_update_data->>'reference_low')::numeric
                           ELSE reference_low END,
      reference_high = CASE WHEN v_update_data ? 'reference_high'
                            THEN (v_update_data->>'reference_high')::numeric
                            ELSE reference_high END,
      reference_text = CASE WHEN v_update_data ? 'reference_text'
                            THEN v_update_data->>'reference_text'
                            ELSE reference_text END,
      report_flag = CASE WHEN v_update_data ? 'report_flag'
                         THEN v_update_data->>'report_flag'
                         ELSE report_flag END
  WHERE id = p_measurement_id AND user_id = v_user_id;

  -- Build audit metadata (safe — no medical values)
  v_metadata := jsonb_build_object(
    'measurement_id', p_measurement_id,
    'previous_status', v_measurement.verification_status,
    'new_status', p_decision,
    'correction_fields', CASE
      WHEN p_decision = 'corrected' THEN jsonb_build_array(
        CASE WHEN p_corrected_value_numeric IS NOT NULL THEN 'value_numeric' END,
        CASE WHEN p_corrected_value_text IS NOT NULL THEN 'value_text' END,
        CASE WHEN p_corrected_reference_low IS NOT NULL THEN 'reference_low' END,
        CASE WHEN p_corrected_reference_high IS NOT NULL THEN 'reference_high' END,
        CASE WHEN p_corrected_reference_text IS NOT NULL THEN 'reference_text' END,
        CASE WHEN p_corrected_report_flag IS NOT NULL THEN 'report_flag' END
      ) FILTER (WHERE p_corrected_value_numeric IS NOT NULL
                    OR p_corrected_value_text IS NOT NULL
                    OR p_corrected_reference_low IS NOT NULL
                    OR p_corrected_reference_high IS NOT NULL
                    OR p_corrected_reference_text IS NOT NULL
                    OR p_corrected_report_flag IS NOT NULL)
      ELSE NULL
    END
  );

  -- Insert audit event
  INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata, created_at)
  VALUES (v_user_id, v_audit_action, 'medical_measurement', p_measurement_id, v_metadata, now());

  RETURN jsonb_build_object(
    'success', true,
    'measurementId', p_measurement_id,
    'verificationStatus', p_decision,
    'requestId', p_request_id
  );
END;
$$;

-- Allow authenticated users to call the function
GRANT EXECUTE ON FUNCTION review_measurement TO authenticated;

-- Add indexes for correction tracking
CREATE INDEX IF NOT EXISTS idx_measurements_corrected_at ON medical_measurements(corrected_at);
CREATE INDEX IF NOT EXISTS idx_measurements_user_test ON medical_measurements(user_id, normalized_test_name);
