-- Healthfolio Database Schema
-- Version: 001
-- Description: Initial schema with all MVP tables

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  locale TEXT DEFAULT 'en-IN',
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- PORTFOLIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'My Healthfolio',
  subject_relationship TEXT DEFAULT 'self',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own portfolios"
  ON portfolios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own portfolios"
  ON portfolios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolios"
  ON portfolios FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolios"
  ON portfolios FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT,
  document_type TEXT DEFAULT 'other',
  status TEXT DEFAULT 'uploaded',
  page_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_portfolio_id ON documents(portfolio_id);
CREATE INDEX idx_documents_sha256 ON documents(sha256);
CREATE INDEX idx_documents_status ON documents(status);

-- ============================================================
-- EXTRACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  field_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value JSONB,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  verification_status TEXT DEFAULT 'pending',
  evidence_locator JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own extractions"
  ON extractions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own extractions"
  ON extractions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own extractions"
  ON extractions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own extractions"
  ON extractions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_extractions_user_id ON extractions(user_id);
CREATE INDEX idx_extractions_document_id ON extractions(document_id);
CREATE INDEX idx_extractions_verification_status ON extractions(verification_status);
CREATE INDEX idx_extractions_confidence ON extractions(confidence);

-- ============================================================
-- MEDICAL EVENTS (Timeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS medical_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  event_date DATE,
  event_type TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  description TEXT,
  source_extraction_ids UUID[] DEFAULT '{}',
  verification_status TEXT DEFAULT 'verified',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medical_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON medical_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own events"
  ON medical_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON medical_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON medical_events FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_medical_events_user_id ON medical_events(user_id);
CREATE INDEX idx_medical_events_portfolio_id ON medical_events(portfolio_id);
CREATE INDEX idx_medical_events_event_date ON medical_events(event_date);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  specialty TEXT,
  clinician_name TEXT,
  location TEXT,
  status TEXT DEFAULT 'planned'
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own appointments"
  ON appointments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own appointments"
  ON appointments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own appointments"
  ON appointments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own appointments"
  ON appointments FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_portfolio_id ON appointments(portfolio_id);

-- ============================================================
-- AGENT RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  state JSONB DEFAULT '{}',
  status TEXT DEFAULT 'queued',
  current_step INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own runs"
  ON agent_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own runs"
  ON agent_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own runs"
  ON agent_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own runs"
  ON agent_runs FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_agent_runs_user_id ON agent_runs(user_id);
CREATE INDEX idx_agent_runs_portfolio_id ON agent_runs(portfolio_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);

-- ============================================================
-- AGENT STEPS
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  phase TEXT NOT NULL,
  public_summary TEXT NOT NULL,
  tool_name TEXT,
  tool_status TEXT DEFAULT 'pending',
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own steps"
  ON agent_steps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own steps"
  ON agent_steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_steps_run_id ON agent_steps(run_id);
CREATE INDEX idx_agent_steps_user_id ON agent_steps(user_id);

-- ============================================================
-- BRIEFS
-- ============================================================
CREATE TABLE IF NOT EXISTS briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  content JSONB NOT NULL,
  status TEXT DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own briefs"
  ON briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own briefs"
  ON briefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own briefs"
  ON briefs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own briefs"
  ON briefs FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_briefs_user_id ON briefs(user_id);
CREATE INDEX idx_briefs_portfolio_id ON briefs(portfolio_id);

-- ============================================================
-- REMINDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  channel TEXT DEFAULT 'in_app',
  status TEXT DEFAULT 'scheduled',
  message TEXT NOT NULL
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminders"
  ON reminders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own reminders"
  ON reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON reminders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders"
  ON reminders FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_appointment_id ON reminders(appointment_id);
CREATE INDEX idx_reminders_status ON reminders(status);

-- ============================================================
-- CONSENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, consent_type)
);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consents"
  ON consents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own consents"
  ON consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own consents"
  ON consents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_consents_user_id ON consents(user_id);

-- ============================================================
-- AUDIT EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit events"
  ON audit_events FOR SELECT
  USING (auth.uid() = user_id);

-- Audit events are created server-side only, no INSERT policy for users
-- Service role bypasses RLS

CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_events_action ON audit_events(action);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
