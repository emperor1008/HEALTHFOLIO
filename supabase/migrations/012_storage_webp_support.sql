-- Migration 012: Add WebP support to storage bucket
-- Also adds the increment function for upload session page counting

-- Update storage bucket to allow WebP
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
WHERE id = 'documents';

-- Helper function to safely increment upload session completed page count
CREATE OR REPLACE FUNCTION increment_upload_session_page_count(session_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE upload_sessions
  SET completed_page_count = completed_page_count + 1,
      updated_at = now()
  WHERE id = session_id;
END;
$$;
