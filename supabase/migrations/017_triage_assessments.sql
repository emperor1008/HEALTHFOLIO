-- Migration 017: Safe Symptom Triage + Care-Request Packets (Part 2)
-- Additive only: creates triage_assessments and extends care_requests with
-- packet columns. Does NOT alter existing tables' policies or existing
-- care_requests RLS. Rule metadata is stored per request for auditability.
--
-- SAFETY NOTES
-- - triage_category is a routing category, not a diagnosis.
-- - rule_ids store stable engine IDs (EM-xx / UR-xx) only.
-- - symptom_text_original preserves the user's own words verbatim.
-- - No raw audio or transcription audio is ever stored.

-- ============================================================
-- 1. care_requests: packet columns (additive)
-- ============================================================
ALTER TABLE care_requests
  ADD COLUMN IF NOT EXISTS packet_id UUID,
  ADD COLUMN IF NOT EXISTS symptom_text_original TEXT,
  ADD COLUMN IF NOT EXISTS symptom_concepts TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS body_area TEXT,
  ADD COLUMN IF NOT EXISTS symptom_category TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS age_group TEXT,
  ADD COLUMN IF NOT EXISTS triage_category TEXT
    CHECK (triage_category IN ('emergency', 'urgent', 'routine')),
  ADD COLUMN IF NOT EXISTS triage_rules_version TEXT,
  ADD COLUMN IF NOT EXISTS triage_rule_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS acknowledged_emergency_guidance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS summary TEXT;

COMMENT ON COLUMN care_requests.triage_category IS
  'Routing category (emergency|urgent|routine) from deterministic rules — NOT a diagnosis';

CREATE UNIQUE INDEX IF NOT EXISTS idx_care_requests_packet_id
  ON care_requests (packet_id) WHERE packet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_care_requests_triage_category
  ON care_requests (user_id, triage_category, created_at DESC);

-- ============================================================
-- 2. triage_assessments: append-only audit of engine outcomes
-- ============================================================
CREATE TABLE IF NOT EXISTS triage_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  care_request_id UUID REFERENCES care_requests(id) ON DELETE SET NULL,
  rules_version TEXT NOT NULL,
  triage_category TEXT NOT NULL
    CHECK (triage_category IN ('emergency', 'urgent', 'routine')),
  rule_ids TEXT[] NOT NULL DEFAULT '{}',
  concepts TEXT[] NOT NULL DEFAULT '{}',
  follow_up_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  age_group TEXT,
  -- Redacted audit fields: NO symptom text, NO contact details here.
  ack_state BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE triage_assessments IS
  'Append-only audit of deterministic triage outcomes. Contains no symptom text.';

ALTER TABLE triage_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own triage assessments"
  ON triage_assessments FOR SELECT
  USING (auth.uid() = user_id);

-- Users may append their own assessments only. No UPDATE/DELETE: it is an
-- audit log; cleanup happens only via cascade of user deletion.
CREATE POLICY "Users can insert own triage assessments"
  ON triage_assessments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_triage_assessments_user_created
  ON triage_assessments (user_id, created_at DESC);
CREATE INDEX idx_triage_assessments_request
  ON triage_assessments (care_request_id) WHERE care_request_id IS NOT NULL;
