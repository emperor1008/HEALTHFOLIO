-- Migration 026: Platform role store (Phase 3 — secure staff identity).
--
-- Replaces the browser-supplied `x-staff-admin-key` bootstrap path with a
-- server-only role registry:
--   * `user_roles` is RLS-enabled with NO policies — anonymous/authenticated
--     clients can read or write NOTHING; only the server (service-role key in
--     API routes / the local staff:bootstrap script) can access it.
--   * Roles: patient | clinician | pharmacy_operator | facility_coordinator |
--     pharmacy_manager | platform_admin.
--   * status: active | suspended | revoked. Suspension/revocation takes
--     effect immediately because staff identity is re-resolved per request.
--   * scope_id links a role to its facility or pharmacy when applicable.
--
-- Forward-only, additive. Existing facility_memberships / pharmacy_memberships
-- tables are unchanged; scoped roles are mirrored into them by the server.

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'patient',
    'clinician',
    'pharmacy_operator',
    'facility_coordinator',
    'pharmacy_manager',
    'platform_admin'
  )),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  -- facility_id for clinician/facility_coordinator; pharmacy_id for
  -- pharmacy_operator/pharmacy_manager; NULL for platform_admin/patient.
  scope_id UUID,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_unique UNIQUE (user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies: every client-side access is denied.
-- The browser never reads or writes roles; APIs resolve them server-side.

CREATE INDEX idx_user_roles_user ON user_roles (user_id, status);
CREATE INDEX idx_user_roles_role ON user_roles (role, status);

-- Append-only audit trail for staff administration. Also service-role only:
-- the admin console exposes a filtered, safe view through its own API.
CREATE TABLE IF NOT EXISTS staff_admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID, -- NULL for the local bootstrap script
  action TEXT NOT NULL
    CHECK (action IN ('assign_role', 'suspend_role', 'reinstate_role', 'revoke_role')),
  target_user_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE staff_admin_audit_events ENABLE ROW LEVEL SECURITY;

-- No policies: append-only via service role; no client reads.
