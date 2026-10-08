-- Migration 027: Better Auth identity layer (replaces Supabase Auth sessions).
--
-- Better Auth owns authentication: users, sessions, credential accounts and
-- verification tokens live in its own canonical tables, connected to the same
-- PostgreSQL database through a server-only DATABASE_URL. Supabase Storage and
-- all existing medical tables are unchanged.
--
-- Schema below is the exact canonical Better Auth v1.7 schema for postgres,
-- generated from better-auth's own migration builder (getMigrations) with
-- advanced.database.generateId = "uuid":
--   - singular table names (user, session, account, verification)
--   - camelCase column names, quoted where mixed-case
--   - id columns: uuid DEFAULT pg_catalog.gen_random_uuid()
--   - timestamps: timestamptz DEFAULT CURRENT_TIMESTAMP
--
-- This matches column-for-column what Better Auth's kysely adapter queries at
-- runtime (fields: accountId, providerId, userId, emailVerified, expiresAt,
-- createdAt, updatedAt, ipAddress, userAgent, accessToken, refreshToken,
-- idToken, accessTokenExpiresAt, refreshTokenExpiresAt).
--
-- IMPORTANT (fresh databases): `users` here is a NEW Better Auth table. On a
-- database that already ran migrations 001–026 there is no legacy `users`
-- table, so this simply does not exist yet. We deliberately do NOT use
-- CREATE TABLE IF NOT EXISTS for the four auth tables: if this file is ever
-- run twice, or if a fresh database already has a `users` table from another
-- system, we want a loud failure instead of silently shipping a wrong shape.
-- (Supabase projects ship their own auth.* schema in a separate schema, so
-- there is no name clash with auth.users.)
--
-- Roles, applications, facility assignments and audit events are Healthfolio
-- tables (RLS enabled with no policies => reachable only from server code,
-- mirroring the migration-026 pattern). role_policy_events record every role
-- transition with redacted audit metadata.
--
-- Forward-only and additive: no existing table or row is touched.

-- ---------------------------------------------------------------------------
-- Better Auth core tables (canonical v1.7 schema, generateId="uuid")
-- ---------------------------------------------------------------------------

CREATE TABLE "user" (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dob TEXT,
  gender TEXT,
  region TEXT
);

CREATE TABLE "session" (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE "account" (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "verification" (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes exactly as Better Auth generates them
-- (getDatabaseIndexName: {table}_{fields}_{idx|uidx}).
CREATE UNIQUE INDEX "user_email_uidx" ON "user" (email);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "session_expiresAt_idx" ON "session" ("expiresAt");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "account_accountId_providerId_idx" ON "account" ("accountId", "providerId");
CREATE INDEX "verification_identifier_idx" ON "verification" (identifier);

-- ---------------------------------------------------------------------------
-- auth.users shadow mirror (identity-space bridge)
-- ---------------------------------------------------------------------------
-- Every medical table (migrations 001–026) keys on user_id UUID REFERENCES
-- auth.users(id). Better Auth now owns identity, but those foreign keys must
-- stay valid, so each new Better Auth user is mirrored into auth.users with
-- the SAME UUID. The mirror row:
--   - carries no usable credential (empty encrypted_password, no tokens),
--     so it can never be used to sign in through the retired Supabase Auth;
--   - keeps every existing FK constraint and legacy row intact;
--   - is idempotent (ON CONFLICT DO NOTHING) and additive-only.
-- Supabase RLS policies using auth.uid() no longer match anyone (Better Auth
-- sessions are not Supabase JWTs); ownership/consent checks are enforced by
-- server code with the service-role client instead, which is a strictly
-- narrower path than before (browser never touches the database directly).

CREATE OR REPLACE FUNCTION mirror_better_auth_user_to_auth_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change_token_current
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', NEW.id, 'authenticated', 'authenticated',
    NEW.email,
    '', now(),
    '{"provider":"better_auth","providers":["better_auth"]}'::jsonb,
    '{}'::jsonb,
    COALESCE(NEW."createdAt", now()), now(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mirror_better_auth_user
AFTER INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION mirror_better_auth_user_to_auth_users();

-- ---------------------------------------------------------------------------
-- Auth-era role registry
-- ---------------------------------------------------------------------------

-- One row per (user, role). status transitions (active/suspended/revoked) are
-- what gates staff access — suspension takes effect on the next request.
CREATE TABLE app_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('patient', 'doctor_pending', 'doctor', 'facility_admin', 'platform_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  scope_id UUID, -- facility id for facility_admin, pharmacy/region scope reserved for future roles
  assigned_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_roles_unique UNIQUE (user_id, role)
);

ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_app_roles_user_id ON app_roles(user_id);
CREATE INDEX idx_app_roles_role_status ON app_roles(role, status);
CREATE INDEX idx_app_roles_scope ON app_roles(scope_id) WHERE scope_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Role-policy audit trail (redacted)
-- ---------------------------------------------------------------------------

CREATE TABLE role_policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL CHECK (event IN (
    'role_assigned', 'role_suspended', 'role_revoked', 'role_status_changed',
    'doctor_application_submitted', 'doctor_application_reviewed',
    'platform_admin_bootstrapped'
  )),
  -- Subject of the event. Never contains credentials, licence numbers, or
  -- medical data.
  target_user_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
  role TEXT,
  -- Acting admin, when applicable.
  actor_user_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
  -- Redacted metadata: codes and ids only, never free-form private text.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE role_policy_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_role_policy_events_target ON role_policy_events(target_user_id, created_at DESC);
CREATE INDEX idx_role_policy_events_event ON role_policy_events(event, created_at DESC);

-- ---------------------------------------------------------------------------
-- Doctor applications (patient → doctor_pending → doctor after approval)
-- ---------------------------------------------------------------------------

CREATE TABLE doctor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- Stored but never exposed outside authorized admin surfaces; audit rows
  -- store only a truncated verification reference, never the full number.
  licence_number TEXT NOT NULL,
  specialty TEXT NOT NULL,
  facility_name TEXT,
  facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'under_review', 'approved', 'declined')),
  reviewed_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  -- Redacted reason code (e.g. 'INCOMPLETE_DETAILS'), never free-form private text.
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One application per user (forward-only status transitions).
  CONSTRAINT doctor_applications_one_active UNIQUE (user_id)
);

ALTER TABLE doctor_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_doctor_applications_status ON doctor_applications(status, created_at DESC);
CREATE INDEX idx_doctor_applications_user ON doctor_applications(user_id);

-- ---------------------------------------------------------------------------
-- Facility assignments for doctors and facility admins
-- ---------------------------------------------------------------------------

CREATE TABLE facility_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  assignment TEXT NOT NULL CHECK (assignment IN ('doctor', 'facility_admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  assigned_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_assignments_unique UNIQUE (user_id, facility_id, assignment)
);

ALTER TABLE facility_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_facility_assignments_user ON facility_assignments(user_id, status);
CREATE INDEX idx_facility_assignments_facility ON facility_assignments(facility_id, assignment, status);

-- ---------------------------------------------------------------------------
-- Patient sharing/consent state (explicit, per-doctor grant)
-- ---------------------------------------------------------------------------
-- consent_grants (migration 021) already records document-share consent; this
-- table adds the doctor-scoped record access state the auth era needs: a
-- patient explicitly names a doctor, and consent can be revoked at any time.
-- Access checks require status='active' at request time.

CREATE TABLE patient_share_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  doctor_user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- Scope of the grant: all records, or a specific document.
  scope TEXT NOT NULL DEFAULT 'all_records' CHECK (scope IN ('all_records', 'document')),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT patient_share_grants_unique UNIQUE (patient_user_id, doctor_user_id, scope, document_id)
);

ALTER TABLE patient_share_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_patient_share_grants_doctor ON patient_share_grants(doctor_user_id, status);
CREATE INDEX idx_patient_share_grants_patient ON patient_share_grants(patient_user_id, status);

-- ---------------------------------------------------------------------------
-- Ownership-transfer audit trail for legacy anonymous-session records.
-- NOT executed automatically: scripts/transfer-legacy-ownership.mjs performs
-- the transfer per confirmed record group and writes rows here.
-- ---------------------------------------------------------------------------

CREATE TABLE ownership_transfer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Redacted legacy reference (e.g. first 8 chars of an anon session id).
  legacy_marker TEXT NOT NULL,
  -- New Better Auth owner after explicit confirmation.
  to_user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  -- Confirmed by a platform admin (user id) — the transfer is never silent.
  confirmed_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ownership_transfer_events ENABLE ROW LEVEL SECURITY;
