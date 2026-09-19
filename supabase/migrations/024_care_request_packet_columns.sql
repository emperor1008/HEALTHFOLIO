-- Migration 024: Add the Part 2 care-request packet columns to care_requests.
--
-- 016 created care_requests without the structured-packet columns that the
-- Part 2 API writes (packet_id, normalized symptom concepts, triage outcome,
-- acknowledgement state). Every POST /api/care-requests carrying a packet
-- therefore failed with PGRST204 (column not found) → HTTP 500 SAVE_FAILED,
-- and queued offline packets retried into requires_attention.
--
-- Additive and forward-only. No existing column is altered or dropped.

ALTER TABLE care_requests
  ADD COLUMN IF NOT EXISTS linked_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS packet_id UUID,
  ADD COLUMN IF NOT EXISTS symptom_text_original TEXT,
  ADD COLUMN IF NOT EXISTS symptom_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS body_area TEXT,
  ADD COLUMN IF NOT EXISTS symptom_category TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS age_group TEXT,
  ADD COLUMN IF NOT EXISTS triage_category TEXT
    CHECK (triage_category IS NULL OR triage_category IN ('emergency', 'urgent', 'routine')),
  ADD COLUMN IF NOT EXISTS triage_rules_version TEXT,
  ADD COLUMN IF NOT EXISTS triage_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS acknowledged_emergency_guidance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS summary TEXT;

CREATE INDEX IF NOT EXISTS idx_care_requests_triage
  ON care_requests (user_id, triage_category, created_at DESC);
