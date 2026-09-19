-- Migration 021: privacy-safe operational metrics (Part 5)
-- Aggregate counts and durations ONLY. No symptom text, document contents,
-- contact details, or personal identifiers. Event names are a closed set.

CREATE TABLE IF NOT EXISTS reliability_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reliability_metrics ENABLE ROW LEVEL SECURITY;

-- Event allow-list enforced at the database level (defense in depth with the
-- Zod schema in the API). Free-form metadata is blocked at the API layer;
-- here we only guard the event vocabulary.
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
  'consent_revoked'
));

-- Written exclusively by server routes (RLS: no client INSERT policy).
-- Staff/admin reads go through the protected dashboard API which resolves
-- facility/pharmacy membership server-side; there is deliberately no broad
-- public SELECT policy.
CREATE POLICY "No direct client access to metrics"
  ON reliability_metrics FOR SELECT
  USING (false);

CREATE INDEX idx_metrics_event_time ON reliability_metrics (event, created_at DESC);
CREATE INDEX idx_metrics_created ON reliability_metrics (created_at DESC);
