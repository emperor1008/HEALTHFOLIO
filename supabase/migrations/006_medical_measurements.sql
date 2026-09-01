-- Healthfolio Medical Measurements Migration
-- Version: 006
-- Description: Health tracking measurements extracted from medical reports

-- ============================================================
-- MEDICAL MEASUREMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS medical_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extraction_id UUID REFERENCES extractions(id) ON DELETE SET NULL,
  original_test_name TEXT NOT NULL,
  normalized_test_name TEXT NOT NULL,
  coding_system TEXT,
  coding_code TEXT,
  value_numeric NUMERIC,
  value_text TEXT,
  original_unit TEXT,
  normalized_unit TEXT,
  reference_low NUMERIC,
  reference_high NUMERIC,
  reference_text TEXT,
  report_flag TEXT,
  calculated_status TEXT NOT NULL DEFAULT 'cannot_determine',
  specimen_collected_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ,
  report_issued_at TIMESTAMPTZ,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  evidence_text TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'corrected', 'rejected')),
  source_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ,

  -- At least one of value_numeric or value_text must exist
  CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

-- RLS
ALTER TABLE medical_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own measurements"
  ON medical_measurements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own measurements"
  ON medical_measurements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own measurements"
  ON medical_measurements FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own measurements"
  ON medical_measurements FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_medical_measurements_user_id ON medical_measurements(user_id);
CREATE INDEX idx_medical_measurements_portfolio_id ON medical_measurements(portfolio_id);
CREATE INDEX idx_medical_measurements_document_id ON medical_measurements(document_id);
CREATE INDEX idx_medical_measurements_normalized_test_name ON medical_measurements(normalized_test_name);
CREATE INDEX idx_medical_measurements_observed_at ON medical_measurements(observed_at);
CREATE INDEX idx_medical_measurements_report_issued_at ON medical_measurements(report_issued_at);
CREATE INDEX idx_medical_measurements_verification_status ON medical_measurements(verification_status);
CREATE INDEX idx_medical_measurements_source_fingerprint ON medical_measurements(source_fingerprint);
