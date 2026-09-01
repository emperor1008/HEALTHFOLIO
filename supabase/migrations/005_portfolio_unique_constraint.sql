-- Healthfolio Database Schema
-- Version: 005
-- Description: Ensure one portfolio per user

-- Add unique constraint to prevent duplicate portfolios per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_user_id_unique
  ON portfolios(user_id);

-- Ensure RLS policies also cover anonymous users properly
-- (Policies already use auth.uid() which works for anonymous users)
-- This migration only adds the unique constraint.
