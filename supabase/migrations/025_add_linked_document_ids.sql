-- Migration 025: Add linked_document_ids to care_requests (live-DB repair).
--
-- Follow-up to 024: the audit traced a persistent PGRST204 on POST
-- /api/care-requests because care_requests also lacked the
-- linked_document_ids column the Part 2 packet flow writes. 024 had already
-- been recorded as applied, so per forward-only discipline this column is
-- added in its own migration. Fresh installs get it from 016/024 (idempotent).

ALTER TABLE care_requests
  ADD COLUMN IF NOT EXISTS linked_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
