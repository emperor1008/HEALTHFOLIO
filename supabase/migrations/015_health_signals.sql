-- Migration 015: Health Signal Monitor
-- Detects notable facts about a user's own verified measurements.
-- Deterministic, evidence-linked, reviewable. Never diagnostic.

-- ============================================================
-- HEALTH SIGNALS
-- ============================================================
CREATE TABLE IF NOT EXISTS health_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,

  latest_measurement_id UUID NOT NULL REFERENCES medical_measurements(id) ON DELETE CASCADE,
  baseline_measurement_id UUID REFERENCES medical_measurements(id) ON DELETE SET NULL,

  -- Normalized test identity for comparability (matches medical_measurements.test_key)
  normalized_test_key TEXT NOT NULL,
  display_name TEXT NOT NULL,

  signal_type TEXT NOT NULL
    CHECK (signal_type IN (
      'first_verified_result',
      'numeric_change_observed',
      'report_marked_outside_range',
      'report_marked_within_range',
      'comparison_unavailable_unit_mismatch',
      'source_needs_review',
      'measurement_invalidated'
    )),

  lifecycle_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'acknowledged', 'saved_for_later', 'dismissed', 'archived')),

  -- Deterministic comparison payload (numbers/dates/units only — no raw report text)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Source evidence references (measurement ids, document ids, page numbers)
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

  reason_code TEXT,

  rule_version TEXT NOT NULL DEFAULT 'signals.v1',

  -- Stable dedup identity for idempotent re-runs: user + latest measurement + type
  dedup_key TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

ALTER TABLE health_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health signals"
  ON health_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health signals"
  ON health_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health signals"
  ON health_signals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health signals"
  ON health_signals FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for the access patterns used by the monitor and UI
CREATE INDEX idx_health_signals_user_status
  ON health_signals(user_id, lifecycle_status, created_at DESC);
CREATE INDEX idx_health_signals_latest_measurement
  ON health_signals(latest_measurement_id);
CREATE INDEX idx_health_signals_test_key
  ON health_signals(normalized_test_key);
CREATE INDEX idx_health_signals_dedup_key
  ON health_signals(user_id, dedup_key);
CREATE INDEX idx_health_signals_user_updated
  ON health_signals(user_id, updated_at DESC);

-- Keep updated_at fresh on every update
CREATE TRIGGER set_health_signals_updated_at
  BEFORE UPDATE ON health_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- One open signal per (user, latest measurement, type).
-- A dismissed/archived signal is treated as a user decision, so the partial
-- unique index lets a NEW signal be created later if the same measurement
-- genuinely becomes newly verified again (e.g. after invalidation of another).
CREATE UNIQUE INDEX idx_health_signals_dedup_open
  ON health_signals(user_id, dedup_key)
  WHERE lifecycle_status IN ('draft', 'saved_for_later');

-- ============================================================
-- ATOMIC SIGNAL REVIEW FUNCTION
-- Applies a lifecycle transition with ownership check + audit, atomically.
-- ============================================================
CREATE OR REPLACE FUNCTION review_health_signal(
  p_signal_id uuid,
  p_action text,
  p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_signal record;
  v_next_status text;
  v_audit_action text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'errorCode', 'SESSION_REQUIRED');
  END IF;

  -- Fetch and verify ownership
  SELECT id, lifecycle_status, user_id
  INTO v_signal
  FROM health_signals
  WHERE id = p_signal_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'errorCode', 'NOT_FOUND');
  END IF;

  -- Allowed lifecycle transitions (anything else is rejected)
  v_next_status := CASE
    WHEN p_action = 'acknowledge' AND v_signal.lifecycle_status IN ('draft', 'saved_for_later') THEN 'acknowledged'
    WHEN p_action = 'save_for_later' AND v_signal.lifecycle_status IN ('draft', 'acknowledged') THEN 'saved_for_later'
    WHEN p_action = 'dismiss' AND v_signal.lifecycle_status IN ('draft', 'saved_for_later', 'acknowledged') THEN 'dismissed'
    WHEN p_action = 'archive' AND v_signal.lifecycle_status = 'dismissed' THEN 'archived'
    ELSE NULL
  END;

  IF v_next_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'errorCode', 'TRANSITION_INVALID');
  END IF;

  UPDATE health_signals
  SET lifecycle_status = v_next_status,
      acknowledged_at = CASE WHEN v_next_status = 'acknowledged' THEN now() ELSE acknowledged_at END,
      dismissed_at = CASE WHEN v_next_status = 'dismissed' THEN now() ELSE dismissed_at END,
      archived_at = CASE WHEN v_next_status = 'archived' THEN now() ELSE archived_at END,
      updated_at = now()
  WHERE id = p_signal_id AND user_id = v_user_id;

  -- Audit: safe metadata only (no measurement values, no report text)
  v_audit_action := 'health_signal_' || v_next_status;

  INSERT INTO audit_events (user_id, action, resource_type, resource_id, metadata, created_at)
  VALUES (
    v_user_id,
    v_audit_action,
    'health_signal',
    p_signal_id,
    jsonb_build_object(
      'previous_status', v_signal.lifecycle_status,
      'new_status', v_next_status,
      'request_id', p_request_id
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'signalId', p_signal_id,
    'lifecycleStatus', v_next_status,
    'requestId', p_request_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION review_health_signal TO authenticated;
