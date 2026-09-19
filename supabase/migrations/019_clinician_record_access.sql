-- Migration 019: Time-limited, consent-gated clinician record access (Part 3)
-- Forward-only, additive. A clinician may access ONLY documents covered by an
-- active (non-revoked) share consent for that specific care request, within
-- the access window. Every access attempt is audited.

-- ============================================================
-- 1. CLINICIAN DOCUMENT ACCESS GRANTS (derived from consent)
-- ============================================================
CREATE TABLE IF NOT EXISTS clinician_document_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_request_id UUID NOT NULL
    REFERENCES care_requests(id) ON DELETE CASCADE,
  clinician_profile_id UUID NOT NULL
    REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  -- Copy of the consented document list at grant time (immutable snapshot).
  document_ids UUID[] NOT NULL DEFAULT '{}',
  -- Time-limited window; expires_at is enforced in the access route.
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT clinician_document_access_unique UNIQUE (care_request_id, clinician_profile_id)
);

ALTER TABLE clinician_document_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient can view access grants for own requests"
  ON clinician_document_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM care_requests cr
      WHERE cr.id = clinician_document_access.care_request_id
        AND cr.user_id = auth.uid()
    )
  );

CREATE POLICY "Clinician can view own access grants"
  ON clinician_document_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clinician_profiles cp
      WHERE cp.id = clinician_document_access.clinician_profile_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE INDEX idx_cda_request
  ON clinician_document_access (care_request_id, revoked_at);
CREATE INDEX idx_cda_clinician
  ON clinician_document_access (clinician_profile_id, expires_at DESC);

-- ============================================================
-- 2. DOCUMENT ACCESS AUDIT (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS clinician_document_access_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_request_id UUID NOT NULL REFERENCES care_requests(id) ON DELETE CASCADE,
  clinician_profile_id UUID NOT NULL REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('access_granted', 'document_opened', 'access_revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clinician_document_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient can view access audit for own requests"
  ON clinician_document_access_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM care_requests cr
      WHERE cr.id = clinician_document_access_audit.care_request_id
        AND cr.user_id = auth.uid()
    )
  );

CREATE INDEX idx_cda_audit_request
  ON clinician_document_access_audit (care_request_id, created_at DESC);
