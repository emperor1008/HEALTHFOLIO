-- Migration 030: voice assistant telemetry vocabulary.
--
-- WHAT THIS DOES
--   Extends the closed `reliability_metrics.event` allow-list
--   (migration 021, enlarged by 028) with privacy-safe,
--   technical voice-assistant events. Aggregate counters only:
--   no identifiers, no transcript text, no symptom content,
--   no conversation content, no free-form metadata.
--
-- BACKWARD COMPATIBILITY
--   - Purely additive: existing event names stay valid; existing
--     rows are untouched.
--   - The CHECK constraint is dropped and re-created with the
--     enlarged list (Postgres cannot alter a CHECK in place).
--   - RLS is unchanged: no client INSERT/SELECT policy exists,
--     and none is added. Metrics remain server-written only.
--
-- NEW EVENTS + METADATA (validated first by Zod in
-- src/lib/metrics/events.ts, then by the API route)
--   voice_session_started        {}
--   voice_session_completed      {}
--   speech_recognition_success   { language: en | hi | or }
--   speech_recognition_failure   {}
--   tts_success                  { language: en | hi | or }
--   tts_failure                  {}
--   ai_interpretation_success    {}
--   ai_fallback                  {}
--   intent_clarification         {}
--   voice_action_completed       { action: <closed plan-kind enum> }
--   voice_action_failed          { action: <closed plan-kind enum> }
--
-- ROLLBACK
--   ALTER TABLE reliability_metrics DROP CONSTRAINT metrics_event_allowed;
--   ALTER TABLE reliability_metrics ADD CONSTRAINT metrics_event_allowed
--     CHECK (event IN ( ...migration 028 list... ));

ALTER TABLE reliability_metrics DROP CONSTRAINT IF EXISTS metrics_event_allowed;

ALTER TABLE reliability_metrics ADD CONSTRAINT metrics_event_allowed CHECK (event IN (
  'queue_item_created',
  'queue_item_synced',
  'queue_item_failed',
  'care_request_submitted',
  'triage_completed',
  'clinician_action_recorded',
  'appointment_proposed',
  'appointment_confirmed',
  'appointment_completed',
  'consultation_fallback_used',
  'pharmacy_status_updated',
  'pharmacy_response_recorded',
  'consent_granted',
  'consent_revoked',
  'consultation_started',
  'consultation_connected',
  'connection_mode',
  'consultation_degradation',
  'consultation_audio_fallback',
  'consultation_reconnection',
  'consultation_offline_fallback',
  'consultation_completed',
  'voice_session_started',
  'voice_session_completed',
  'speech_recognition_success',
  'speech_recognition_failure',
  'tts_success',
  'tts_failure',
  'ai_interpretation_success',
  'ai_fallback',
  'intent_clarification',
  'voice_action_completed',
  'voice_action_failed'
));

-- Query pattern: dashboard reads per-voice-event counts over time.
CREATE INDEX IF NOT EXISTS idx_metrics_voice_event_time
  ON reliability_metrics (event, created_at DESC)
  WHERE event LIKE 'voice_%' OR event IN (
    'speech_recognition_success',
    'speech_recognition_failure',
    'tts_success',
    'tts_failure',
    'ai_interpretation_success',
    'ai_fallback',
    'intent_clarification'
  );
