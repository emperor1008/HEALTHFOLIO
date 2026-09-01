-- Migration 010: Evidence-Based Test Report Intelligence
-- Extends medical_measurements with lab-report-specific fields
-- Creates laboratory_reports, test_identity_candidates, test_information_cache,
-- report_analysis_runs, measurement_revision_history

-- ============================================================
-- EXTEND MEDICAL MEASUREMENTS
-- ============================================================
ALTER TABLE medical_measurements
  ADD COLUMN IF NOT EXISTS test_key TEXT,
  ADD COLUMN IF NOT EXISTS loinc_code TEXT,
  ADD COLUMN IF NOT EXISTS panel_name TEXT,
  ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS comparator TEXT,
  ADD COLUMN IF NOT EXISTS specimen TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS fasting_status TEXT,
  ADD COLUMN IF NOT EXISTS date_precision TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS laboratory_name TEXT,
  ADD COLUMN IF NOT EXISTS unit_ucum TEXT,
  ADD COLUMN IF NOT EXISTS evidence_locator JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_version TEXT;

-- Populate test_key from normalized_test_name for existing rows
UPDATE medical_measurements SET test_key = normalized_test_name WHERE test_key IS NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_measurements_test_key ON medical_measurements(test_key);
CREATE INDEX IF NOT EXISTS idx_measurements_loinc_code ON medical_measurements(loinc_code) WHERE loinc_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_measurements_result_type ON medical_measurements(result_type);
CREATE INDEX IF NOT EXISTS idx_measurements_specimen ON medical_measurements(specimen) WHERE specimen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_measurements_collection_date ON medical_measurements(specimen_collected_at);

-- ============================================================
-- LABORATORY REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS laboratory_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  report_number TEXT,
  laboratory_name TEXT,
  patient_name TEXT,
  ordering_clinician TEXT,
  collection_date TIMESTAMPTZ,
  report_date TIMESTAMPTZ,
  specimen TEXT,
  fasting_status TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  review_status TEXT NOT NULL DEFAULT 'pending',
  overall_confidence NUMERIC(3,2) DEFAULT 0 CHECK (overall_confidence >= 0 AND overall_confidence <= 1),
  measurement_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  public_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

ALTER TABLE laboratory_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lab reports"
  ON laboratory_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own lab reports"
  ON laboratory_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lab reports"
  ON laboratory_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own lab reports"
  ON laboratory_reports FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_lab_reports_user ON laboratory_reports(user_id);
CREATE INDEX idx_lab_reports_portfolio ON laboratory_reports(portfolio_id);
CREATE INDEX idx_lab_reports_document ON laboratory_reports(document_id);
CREATE INDEX idx_lab_reports_extraction_status ON laboratory_reports(extraction_status);
CREATE INDEX idx_lab_reports_review_status ON laboratory_reports(review_status);
CREATE INDEX idx_lab_reports_report_date ON laboratory_reports(report_date);
CREATE TRIGGER set_lab_reports_updated_at
  BEFORE UPDATE ON laboratory_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TEST IDENTITY CANDIDATES
-- ============================================================
CREATE TABLE IF NOT EXISTS test_identity_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES medical_measurements(id) ON DELETE CASCADE,
  proposed_test_key TEXT NOT NULL,
  proposed_loinc_code TEXT,
  proposed_name TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  matching_evidence JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE test_identity_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own test identity candidates"
  ON test_identity_candidates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own test identity candidates"
  ON test_identity_candidates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own test identity candidates"
  ON test_identity_candidates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_test_identity_user ON test_identity_candidates(user_id);
CREATE INDEX idx_test_identity_measurement ON test_identity_candidates(measurement_id);
CREATE INDEX idx_test_identity_test_key ON test_identity_candidates(proposed_test_key);
CREATE INDEX idx_test_identity_status ON test_identity_candidates(status);

-- ============================================================
-- TEST INFORMATION CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS test_information_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_key TEXT NOT NULL,
  loinc_code TEXT,
  source_name TEXT NOT NULL,
  source_identifier TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  official_text TEXT NOT NULL,
  plain_language_text TEXT,
  source_version TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  payload_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE test_information_cache ENABLE ROW LEVEL SECURITY;

-- Test info is non-PII reference data, readable by all authenticated users
CREATE POLICY "Authenticated users can view test info cache"
  ON test_information_cache FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert test info cache"
  ON test_information_cache FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "System can update test info cache"
  ON test_information_cache FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE UNIQUE INDEX idx_test_info_cache_unique ON test_information_cache(test_key, source_name, source_identifier);
CREATE INDEX idx_test_info_cache_test_key ON test_information_cache(test_key);
CREATE INDEX idx_test_info_cache_loinc ON test_information_cache(loinc_code) WHERE loinc_code IS NOT NULL;
CREATE INDEX idx_test_info_cache_expires ON test_information_cache(expires_at);
CREATE TRIGGER set_test_info_cache_updated_at
  BEFORE UPDATE ON test_information_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- REPORT ANALYSIS RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS report_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  prompt_version TEXT,
  model_name TEXT,
  measurements_found INTEGER DEFAULT 0,
  measurements_verified INTEGER DEFAULT 0,
  measurements_review_required INTEGER DEFAULT 0,
  public_summary TEXT,
  failure_code TEXT,
  failure_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE report_analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analysis runs"
  ON report_analysis_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own analysis runs"
  ON report_analysis_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analysis runs"
  ON report_analysis_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_analysis_runs_user ON report_analysis_runs(user_id);
CREATE INDEX idx_analysis_runs_document ON report_analysis_runs(document_id);
CREATE INDEX idx_analysis_runs_status ON report_analysis_runs(status);

-- ============================================================
-- MEASUREMENT REVISION HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_revision_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES medical_measurements(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  previous_value JSONB,
  corrected_value JSONB,
  reason TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE measurement_revision_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own measurement revisions"
  ON measurement_revision_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own measurement revisions"
  ON measurement_revision_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_measurement_revisions_user ON measurement_revision_history(user_id);
CREATE INDEX idx_measurement_revisions_measurement ON measurement_revision_history(measurement_id);
CREATE INDEX idx_measurement_revisions_number ON measurement_revision_history(measurement_id, revision_number);
