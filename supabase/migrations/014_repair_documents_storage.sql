-- Healthfolio Storage Repair Migration
-- Version: 014
-- Description: Idempotent repair for the documents storage bucket and policies.
--              Migration 002 may have failed to create the bucket if the
--              service-role key was not available. This migration safely
--              creates or updates the bucket and ensures all policies exist.

-- 1. Create or update the documents bucket (private, 10 MB, correct MIME types)
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Drop existing Healthfolio storage policies if they exist (safe to re-create)
DO $$
BEGIN
  -- Drop INSERT policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'hf_storage_insert'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "hf_storage_insert" ON storage.objects;
  END IF;

  -- Drop SELECT policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'hf_storage_select'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "hf_storage_select" ON storage.objects;
  END IF;

  -- Drop UPDATE policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'hf_storage_update'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "hf_storage_update" ON storage.objects;
  END IF;

  -- Drop DELETE policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'hf_storage_delete'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "hf_storage_delete" ON storage.objects;
  END IF;
END $$;

-- Also drop old-named policies from migration 002 if they still exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can upload to own path'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "Users can upload to own path" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can read own files'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "Users can read own files" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can delete own files'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "Users can delete own files" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can update own files'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    DROP POLICY "Users can update own files" ON storage.objects;
  END IF;
END $$;

-- 3. Create storage policies with deterministic names
-- INSERT: Users can upload to their own path
CREATE POLICY "hf_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: Users can read their own files
CREATE POLICY "hf_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: Users can update their own files
CREATE POLICY "hf_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: Users can delete their own files
CREATE POLICY "hf_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
