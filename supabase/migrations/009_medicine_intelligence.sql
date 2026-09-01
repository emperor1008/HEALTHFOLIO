-- Migration 009: Verified Medicine Intelligence
-- Creates medicine reference tables and user medicine links

-- ============================================================
-- MEDICINE ENTITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS medicine_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui TEXT,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'ingredient',
  generic_name TEXT,
  brand_name TEXT,
  strength TEXT,
  dose_form TEXT,
  route TEXT,
  active_ingredients JSONB DEFAULT '[]'::jsonb,
  source_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medicine_entities ENABLE ROW LEVEL SECURITY;

-- Medicine reference data is readable by authenticated users (non-PII)
CREATE POLICY "Authenticated users can view medicine entities"
  ON medicine_entities FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert medicine entities"
  ON medicine_entities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "System can update medicine entities"
  ON medicine_entities FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE UNIQUE INDEX IF NOT EXISTS idx_medicine_entities_rxcui ON medicine_entities(rxcui) WHERE rxcui IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_medicine_entities_normalized_name ON medicine_entities(normalized_name);
CREATE INDEX IF NOT EXISTS idx_medicine_entities_generic ON medicine_entities(generic_name);
CREATE INDEX IF NOT EXISTS idx_medicine_entities_brand ON medicine_entities(brand_name);

-- ============================================================
-- MEDICINE SOURCE RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS medicine_source_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_entity_id UUID NOT NULL REFERENCES medicine_entities(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_version TEXT,
  effective_date DATE,
  retrieved_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  raw_response_hash TEXT,
  validated_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medicine_source_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view source records"
  ON medicine_source_records FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert source records"
  ON medicine_source_records FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "System can update source records"
  ON medicine_source_records FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_records_unique ON medicine_source_records(source_name, source_record_id, source_version);
CREATE INDEX IF NOT EXISTS idx_source_records_entity ON medicine_source_records(medicine_entity_id);

-- ============================================================
-- MEDICINE LABEL SECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS medicine_label_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id UUID NOT NULL REFERENCES medicine_source_records(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_title TEXT NOT NULL,
  original_text TEXT NOT NULL,
  plain_language_text TEXT,
  ai_generated BOOLEAN DEFAULT false,
  source_locator JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medicine_label_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view label sections"
  ON medicine_label_sections FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert label sections"
  ON medicine_label_sections FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "System can update label sections"
  ON medicine_label_sections FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_label_sections_record ON medicine_label_sections(source_record_id);
CREATE INDEX IF NOT EXISTS idx_label_sections_key ON medicine_label_sections(section_key);

-- ============================================================
-- USER MEDICINE LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_medicine_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_entity_id UUID NOT NULL REFERENCES medicine_entities(id) ON DELETE CASCADE,
  prescription_item_id UUID REFERENCES prescription_items(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  relationship_type TEXT NOT NULL DEFAULT 'user_saved',
  verification_status TEXT NOT NULL DEFAULT 'pending',
  evidence_locator JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_medicine_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own medicine links"
  ON user_medicine_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own medicine links"
  ON user_medicine_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own medicine links"
  ON user_medicine_links FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own medicine links"
  ON user_medicine_links FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_medicine_links_user ON user_medicine_links(user_id);
CREATE INDEX IF NOT EXISTS idx_medicine_links_entity ON user_medicine_links(medicine_entity_id);
CREATE INDEX IF NOT EXISTS idx_medicine_links_prescription ON user_medicine_links(prescription_item_id);
CREATE INDEX IF NOT EXISTS idx_medicine_links_document ON user_medicine_links(document_id);

-- ============================================================
-- MEDICINE LOOKUP EVENTS (Analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS medicine_lookup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_hash TEXT NOT NULL,
  matched_medicine_entity_id UUID REFERENCES medicine_entities(id) ON DELETE SET NULL,
  source_names JSONB DEFAULT '[]'::jsonb,
  result_status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medicine_lookup_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lookup events"
  ON medicine_lookup_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert lookup events"
  ON medicine_lookup_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_lookup_events_user ON medicine_lookup_events(user_id);
CREATE INDEX IF NOT EXISTS idx_lookup_events_query ON medicine_lookup_events(query_hash);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE TRIGGER set_medicine_entities_updated_at
  BEFORE UPDATE ON medicine_entities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_source_records_updated_at
  BEFORE UPDATE ON medicine_source_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_label_sections_updated_at
  BEFORE UPDATE ON medicine_label_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_medicine_links_updated_at
  BEFORE UPDATE ON user_medicine_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
