-- Migration 022: multi-region configuration (Part 5)
-- Region-specific behavior (languages, emergency guidance, freshness
-- thresholds, feature flags) lives here — never hard-coded in the app.

CREATE TABLE IF NOT EXISTS region_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL UNIQUE,
  config JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE region_config ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may READ the configuration of their region
-- (it contains no personal data). Writes happen only via the server route,
-- which resolves the coordinator role from facility_memberships — no client
-- INSERT/UPDATE policy exists.
CREATE POLICY "Authenticated users can read region config"
  ON region_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_region_config_region ON region_config (region);
