-- Migration 016: Offline-First Foundation — care requests and server-side idempotency
-- Part 1 scope: care request drafts only. No triage, classification, or clinical logic.
-- This migration does not modify any existing table, policy, or index.
-- Assumes update_updated_at_column() exists (created in an earlier migration).

-- ============================================================
-- CARE REQUESTS (draft foundation; no clinical behavior)
-- ============================================================
CREATE TABLE IF NOT EXISTS care_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en'
    CHECK (preferred_language IN ('en', 'hi', 'or')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  preferred_contact_method TEXT NOT NULL DEFAULT 'in_app'
    CHECK (preferred_contact_method IN ('in_app', 'phone', 'email')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'processing', 'completed')),
  idempotency_key TEXT NOT NULL,
  client_created_at TIMESTAMPTZ,
  -- Part 2 structured-packet columns (added here for fresh installs after
  -- 024 fixed the live DB; see migration 024 for the forward-only version).
  linked_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  packet_id UUID,
  symptom_text_original TEXT,
  symptom_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_area TEXT,
  symptom_category TEXT,
  follow_up_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  age_group TEXT,
  triage_category TEXT CHECK (triage_category IS NULL OR triage_category IN ('emergency', 'urgent', 'routine')),
  triage_rules_version TEXT,
  triage_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_emergency_guidance BOOLEAN NOT NULL DEFAULT FALSE,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT care_requests_idempotency UNIQUE (user_id, idempotency_key)
);

ALTER TABLE care_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own care requests"
  ON care_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own care requests"
  ON care_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own care requests"
  ON care_requests FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own care requests"
  ON care_requests FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_care_requests_user_status_created
  ON care_requests (user_id, status, created_at DESC);
CREATE INDEX idx_care_requests_portfolio
  ON care_requests (portfolio_id) WHERE portfolio_id IS NOT NULL;

CREATE TRIGGER set_care_requests_updated_at
  BEFORE UPDATE ON care_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PROFILES: language + contact preference columns (additive only)
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en'
    CHECK (preferred_language IN ('en', 'hi', 'or'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT DEFAULT 'in_app'
    CHECK (preferred_contact_method IN ('in_app', 'phone', 'email'));

-- ============================================================
-- SERVER-SIDE IDEMPOTENCY STORE for queued writes
-- Generic (user_id, endpoint, key) -> response snapshot table. The API
-- layer consults it before executing any queued mutation, so replayed
-- requests return the original response instead of creating duplicates.
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint, idempotency_key)
);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own idempotency records"
  ON idempotency_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Writes happen exclusively through API routes (service role).
-- Deliberately no INSERT/UPDATE/DELETE policies for anon/authenticated.

CREATE INDEX idx_idempotency_keys_created
  ON idempotency_keys (user_id, endpoint, created_at);
