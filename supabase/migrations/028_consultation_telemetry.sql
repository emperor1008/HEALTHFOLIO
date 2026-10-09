-- Migration 028: consultation telemetry vocabulary (Phase 1).
--
-- WHAT THIS DOES
--   Extends the closed `reliability_metrics.event` allow-list (migration 021)
--   with privacy-safe, technical consultation events. Aggregate counters
--   only: no identifiers, no SDP, no symptom text, no free-form metadata.
--
-- BACKWARD COMPATIBILITY
--   - Purely additive: existing event names stay valid; existing rows are
--     untouched.
--   - The CHECK constraint is dropped and re-created with the enlarged list
--     (Postgres cannot alter a CHECK in place).
--   - RLS is unchanged: no client INSERT/SELECT policy exists, and none is
--     added. Metrics remain server-written only.
--
-- NEW EVENTS + METADATA (validated first by Zod in src/lib/metrics/events.ts)
--   consultation_started        {}
--   consultation_connected      { mode: video | audio }
--   connection_mode             { mode: video | audio | text }
--   consultation_degradation    {}
--   consultation_audio_fallback {}
--   consultation_reconnection   { outcome: started | success | failed }
--   consultation_offline_fallback {}
--   consultation_completed      { role: patient | clinician }
--
-- ROLLBACK
--   ALTER TABLE reliability_metrics DROP CONSTRAINT metrics_event_allowed;
--   ALTER TABLE reliability_metrics ADD CONSTRAINT metrics_event_allowed
--     CHECK (event IN ( ...original migration 021 list... ));

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
  'consultation_completed'
));

-- Query pattern: dashboard reads per-consultation-event counts over time.
CREATE INDEX IF NOT EXISTS idx_metrics_consultation_event_time
  ON reliability_metrics (event, created_at DESC)
  WHERE event LIKE 'consultation_%' OR event = 'connection_mode';
