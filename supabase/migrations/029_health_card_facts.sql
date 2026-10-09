-- Phase 2: Offline Health Card — explicitly recorded patient facts.
--
-- Scope (deliberately minimal — no medical-record duplication):
--   health_card_facts: ONE row per patient holding the allergies and
--   important conditions the patient EXPLICITLY recorded for offline care.
--   Everything else shown on the Offline Health Card (profile, active
--   medicines, recent care) is read from existing tables by the API.
--
-- Authorization model (matches migrations 026/027 — Better Auth owns
-- sessions, no Supabase auth.uid()):
--   - RLS is ENABLED with NO client policies → default deny for the anon
--     and authenticated keys.
--   - All reads/writes go through the service-role API layer, which
--     verifies the Better Auth session and scopes every query to the
--     session user (see src/app/api/health-card/route.ts).
--
-- Additive only. Rollback:
--   DROP TABLE IF EXISTS health_card_facts;

CREATE TABLE IF NOT EXISTS health_card_facts (
  user_id UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  allergies TEXT[] NOT NULL DEFAULT '{}',
  conditions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE health_card_facts ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: client keys are denied by default.

COMMENT ON TABLE health_card_facts IS
  'Patient-explicit allergies/conditions for the Offline Health Card. Not a diagnosis list; edited only by the patient via the health-card API.';
