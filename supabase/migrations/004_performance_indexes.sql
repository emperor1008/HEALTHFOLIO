-- Healthfolio Performance Indexes
-- Version: 004
-- Description: Composite and covering indexes for common query patterns

-- Dashboard: documents by user + created_at (most recent first)
CREATE INDEX IF NOT EXISTS idx_documents_user_created
  ON documents(user_id, created_at DESC);

-- Documents page: documents by user + status
CREATE INDEX IF NOT EXISTS idx_documents_user_status
  ON documents(user_id, status);

-- Extractions: by user + verification_status (review page)
CREATE INDEX IF NOT EXISTS idx_extractions_user_verification
  ON extractions(user_id, verification_status);

-- Extractions: by document + page number
CREATE INDEX IF NOT EXISTS idx_extractions_doc_page
  ON extractions(document_id, page_number);

-- Medical events: by user + event_date (timeline ordering)
CREATE INDEX IF NOT EXISTS idx_medical_events_user_date
  ON medical_events(user_id, event_date DESC);

-- Medical events: by user + verification_status
CREATE INDEX IF NOT EXISTS idx_medical_events_user_verification
  ON medical_events(user_id, verification_status);

-- Agent runs: by user + created_at (recent first)
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created
  ON agent_runs(user_id, created_at DESC);

-- Agent runs: by user + status (active runs check)
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_status
  ON agent_runs(user_id, status);

-- Appointments: by user + starts_at (upcoming first)
CREATE INDEX IF NOT EXISTS idx_appointments_user_starts
  ON appointments(user_id, starts_at DESC);

-- Briefs: by user + created_at
CREATE INDEX IF NOT EXISTS idx_briefs_user_created
  ON briefs(user_id, created_at DESC);

-- Briefs: by user + stale flag
CREATE INDEX IF NOT EXISTS idx_briefs_user_stale
  ON briefs(user_id, is_stale);

-- Reminders: by user + reminder_at
CREATE INDEX IF NOT EXISTS idx_reminders_user_at
  ON reminders(user_id, reminder_at);

-- Documents: covering index for list page
CREATE INDEX IF NOT EXISTS idx_documents_list_cover
  ON documents(user_id, created_at DESC)
  INCLUDE (original_name, mime_type, size_bytes, document_type, status, page_count);
