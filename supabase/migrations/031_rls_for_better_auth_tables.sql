-- Migration 031: lock the Better Auth credential tables down for the API roles.
--
-- Migration 027 created the four canonical Better Auth tables ("user",
-- "session", "account", "verification") but — unlike every Healthfolio table it
-- also created (app_roles, role_policy_events, doctor_applications,
-- facility_assignments, patient_share_grants, ownership_transfer_events) — it
-- did not enable Row Level Security on them.
--
-- In a hosted Supabase project the `anon` and `authenticated` roles hold table
-- privileges on the public schema by default (Supabase ships
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated, service_role`) and PostgREST exposes that schema. With RLS
-- disabled, anyone holding the public anon key could read:
--   - `session.token` — a bearer-equivalent session credential (account takeover)
--   - `account.password` — bcrypt credential hashes (offline cracking)
--   - `user` — email, name, dob, gender, region (PII disclosure)
--
-- This regression was reproduced by Phase 6's integration harness against real
-- PostgreSQL with real migrations and Supabase's default privileges; see
-- tests/integration/rls-policies.test.ts ("Better Auth credential tables").
--
-- RLS is enabled here with NO policies, the same posture every other
-- server-only table in this schema uses: rows are unreachable from the API
-- roles, while Better Auth keeps working because it connects over DATABASE_URL
-- as the table OWNER, and a table owner bypasses its own RLS unless FORCE ROW
-- LEVEL SECURITY is set (it deliberately is not set, and must not be).
--
-- The REVOKE is belt-and-braces: it removes the privileges as well, so the
-- tables stay closed even if RLS were ever disabled by a later change.
-- The service-role server client (used by the app's own API routes) is
-- unaffected, and no application query changes.
--
-- Forward-only and additive: no table, column, row, index or policy belonging
-- to another system is modified.

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "user", "session", "account", "verification" FROM anon, authenticated;
