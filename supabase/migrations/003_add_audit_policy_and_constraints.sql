-- Migration 003: Add audit_events INSERT policy and improve schema
-- This allows authenticated users to insert their own audit events

-- Add INSERT policy for audit_events (was missing, requiring admin for all inserts)
CREATE POLICY "Users can insert own audit events"
  ON audit_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add a CHECK constraint for verification_status values
ALTER TABLE extractions
  ADD CONSTRAINT extractions_verification_status_check
  CHECK (verification_status IN (
    'pending_review',
    'system_verified',
    'user_confirmed',
    'user_corrected',
    'rejected',
    'pending',
    'verified'
  ));

-- Add CHECK constraint for document status
ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN (
    'uploaded',
    'processing',
    'processed',
    'review_required',
    'failed',
    'replaced',
    'excluded',
    'verified'
  ));

-- Add deleted_at to profiles for soft-delete support (already in schema, ensure it exists)
-- This is a no-op if the column already exists
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
