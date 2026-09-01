-- Migration 011: Smart Document Capture and Upload
-- Creates upload_sessions, document_pages, capture_events tables

-- ============================================================
-- UPLOAD SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'uploading', 'finalizing', 'completed', 'failed', 'cancelled')),
  source_type TEXT NOT NULL DEFAULT 'file'
    CHECK (source_type IN ('camera', 'gallery', 'file')),
  expected_page_count INTEGER NOT NULL DEFAULT 1,
  completed_page_count INTEGER NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own upload sessions"
  ON upload_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own upload sessions"
  ON upload_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own upload sessions"
  ON upload_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own upload sessions"
  ON upload_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_upload_sessions_user ON upload_sessions(user_id);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX idx_upload_sessions_document ON upload_sessions(document_id) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX idx_upload_sessions_idempotency ON upload_sessions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TRIGGER set_upload_sessions_updated_at
  BEFORE UPDATE ON upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DOCUMENT PAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  upload_session_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  file_hash TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  rotation INTEGER NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
  quality_status TEXT NOT NULL DEFAULT 'acceptable'
    CHECK (quality_status IN ('acceptable', 'warning', 'retake_recommended', 'unusable')),
  quality_metrics JSONB DEFAULT '{}'::jsonb,
  transformation_metadata JSONB DEFAULT '{}'::jsonb,
  upload_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'uploading', 'uploaded', 'verified', 'failed')),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_document_page UNIQUE (document_id, page_number)
);

ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own document pages"
  ON document_pages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own document pages"
  ON document_pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own document pages"
  ON document_pages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own document pages"
  ON document_pages FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_document_pages_user ON document_pages(user_id);
CREATE INDEX idx_document_pages_document ON document_pages(document_id);
CREATE INDEX idx_document_pages_session ON document_pages(upload_session_id) WHERE upload_session_id IS NOT NULL;
CREATE INDEX idx_document_pages_hash ON document_pages(file_hash);
CREATE INDEX idx_document_pages_status ON document_pages(upload_status);
CREATE UNIQUE INDEX idx_document_pages_idempotency ON document_pages(document_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TRIGGER set_document_pages_updated_at
  BEFORE UPDATE ON document_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CAPTURE EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS capture_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_session_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  safe_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE capture_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own capture events"
  ON capture_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert capture events"
  ON capture_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_capture_events_user ON capture_events(user_id);
CREATE INDEX idx_capture_events_session ON capture_events(upload_session_id) WHERE upload_session_id IS NOT NULL;
CREATE INDEX idx_capture_events_type ON capture_events(event_type);
