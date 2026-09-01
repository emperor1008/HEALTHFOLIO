-- Migration 008: AI-Powered Document Organization
-- Extends documents table, adds classification_history, document_relationships, prescription_items

-- ============================================================
-- EXTEND DOCUMENTS TABLE
-- ============================================================
-- Add new columns to the existing documents table for AI organization

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS category_confidence NUMERIC(3,2) CHECK (category_confidence IS NULL OR (category_confidence >= 0 AND category_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS classification_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS document_date DATE,
  ADD COLUMN IF NOT EXISTS document_date_precision TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS document_date_source TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS issuer_name TEXT,
  ADD COLUMN IF NOT EXISTS patient_name TEXT,
  ADD COLUMN IF NOT EXISTS doctor_name TEXT,
  ADD COLUMN IF NOT EXISTS facility_name TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_message TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_document_id UUID REFERENCES documents(id),
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Migrate data from existing columns where applicable
UPDATE documents SET
  original_filename = original_name,
  file_hash = sha256
WHERE original_filename IS NULL;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_document_date ON documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_processing_status ON documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_requires_review ON documents(requires_review);
CREATE INDEX IF NOT EXISTS idx_documents_classification_status ON documents(classification_status);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);

-- ============================================================
-- DOCUMENT CLASSIFICATION HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS document_classification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  proposed_category TEXT NOT NULL,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL DEFAULT 'ai',
  model_name TEXT,
  prompt_version TEXT,
  evidence JSONB DEFAULT '[]'::jsonb,
  decision TEXT NOT NULL DEFAULT 'proposed',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE document_classification_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own classification history"
  ON document_classification_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own classification history"
  ON document_classification_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own classification history"
  ON document_classification_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_classification_history_user ON document_classification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_classification_history_document ON document_classification_history(document_id);
CREATE INDEX IF NOT EXISTS idx_classification_history_created ON document_classification_history(created_at);

-- ============================================================
-- DOCUMENT RELATIONSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS document_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Prevent self-relationships
  CONSTRAINT no_self_relationship CHECK (source_document_id != target_document_id),
  -- Prevent duplicate relationships of the same type
  CONSTRAINT unique_relationship UNIQUE (source_document_id, target_document_id, relationship_type)
);

ALTER TABLE document_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own relationships"
  ON document_relationships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own relationships"
  ON document_relationships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own relationships"
  ON document_relationships FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own relationships"
  ON document_relationships FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_relationships_user ON document_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON document_relationships(source_document_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON document_relationships(target_document_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON document_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_status ON document_relationships(status);

-- ============================================================
-- PRESCRIPTION ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  raw_medicine_text TEXT NOT NULL,
  medicine_name TEXT,
  strength TEXT,
  dose_text TEXT,
  route TEXT,
  frequency_text TEXT,
  duration_text TEXT,
  instruction_text TEXT,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  verification_status TEXT NOT NULL DEFAULT 'pending',
  evidence_locator JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prescription items"
  ON prescription_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own prescription items"
  ON prescription_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prescription items"
  ON prescription_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prescription items"
  ON prescription_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_prescription_items_user ON prescription_items(user_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_document ON prescription_items(document_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_medicine ON prescription_items(medicine_name);
CREATE INDEX IF NOT EXISTS idx_prescription_items_status ON prescription_items(verification_status);

-- ============================================================
-- HELPER FUNCTION: update updated_at on changes
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to documents table
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to document_relationships
CREATE TRIGGER set_relationships_updated_at
  BEFORE UPDATE ON document_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to prescription_items
CREATE TRIGGER set_prescription_items_updated_at
  BEFORE UPDATE ON prescription_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
