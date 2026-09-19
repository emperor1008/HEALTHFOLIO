-- Migration 020: Pharmacy Medicine Availability and Verified Stock Confirmation (Part 4)
-- Forward-only, additive. Stock truth lives in append-only events; the latest
-- valid event per (pharmacy, medicine) is authoritative. Patient-facing
-- surfaces expose status + timestamps only (never internal notes or exact
-- quantities unless the pharmacy explicitly enabled public display).

-- ============================================================
-- 1. PHARMACIES
-- ============================================================
CREATE TABLE IF NOT EXISTS pharmacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  service_area_text TEXT,
  languages TEXT[] NOT NULL DEFAULT '{en}',
  is_open BOOLEAN NOT NULL DEFAULT false,
  verification_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_state IN ('pending', 'verified', 'suspended')),
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;

-- Only verified, non-suspended pharmacies are publicly visible to patients.
CREATE POLICY "Anyone authenticated can view verified pharmacies"
  ON pharmacies FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND verification_state = 'verified'
  );

-- (Staff-visibility policy is created at the end of this migration, after
--  pharmacy_memberships exists — policy creation is a parse-time check of
--  referenced relations, so forward references fail on a fresh schema.)

CREATE INDEX idx_pharmacies_verified ON pharmacies (verification_state);

-- ============================================================
-- 2. PHARMACY MEMBERSHIPS (server-assigned only)
-- ============================================================
CREATE TABLE IF NOT EXISTS pharmacy_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('operator', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_memberships_unique UNIQUE (user_id, pharmacy_id)
);

ALTER TABLE pharmacy_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own memberships"
  ON pharmacy_memberships FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies: membership changes go exclusively through
-- the admin-key-guarded API (server-side).

CREATE INDEX idx_pharmacy_memberships_pharmacy
  ON pharmacy_memberships (pharmacy_id, role);

-- Staff visibility for pharmacies (deferred from the pharmacies section:
-- pharmacy_memberships must exist first).
CREATE POLICY "Pharmacy staff can view own pharmacy"
  ON pharmacies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_memberships pm
      WHERE pm.pharmacy_id = pharmacies.id AND pm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. PHARMACY STOCK EVENTS (append-only truth)
-- ============================================================
CREATE TABLE IF NOT EXISTS pharmacy_stock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  medicine_id TEXT NOT NULL, -- identity id from the verified medicine layer
  medicine_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'low_stock', 'unavailable', 'not_stocked')),
  -- Optional; NEVER rendered to patients unless show_quantity_to_patients.
  quantity_hint INTEGER CHECK (quantity_hint IS NULL OR quantity_hint >= 0),
  show_quantity_to_patients BOOLEAN NOT NULL DEFAULT false,
  -- Internal staff note; never exposed on patient surfaces.
  internal_note TEXT,
  source TEXT NOT NULL DEFAULT 'manual_operator'
    CHECK (source IN ('manual_operator', 'approved_integration')),
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_events_unique_idem UNIQUE (pharmacy_id, medicine_id, idempotency_key)
);

ALTER TABLE pharmacy_stock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pharmacy staff can view own pharmacy stock"
  ON pharmacy_stock_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_memberships pm
      WHERE pm.pharmacy_id = pharmacy_stock_events.pharmacy_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Patients can view stock events for verified pharmacies"
  ON pharmacy_stock_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pharmacies p
      WHERE p.id = pharmacy_stock_events.pharmacy_id
        AND p.verification_state = 'verified'
    )
  );

-- No client INSERT/UPDATE: writes go through the server route only.

CREATE INDEX idx_stock_events_lookup
  ON pharmacy_stock_events (medicine_id, pharmacy_id, server_recorded_at DESC);
CREATE INDEX idx_stock_events_pharmacy
  ON pharmacy_stock_events (pharmacy_id, server_recorded_at DESC);

-- ============================================================
-- 4. AVAILABILITY REQUESTS (patient → pharmacy, non-binding)
-- ============================================================
CREATE TABLE IF NOT EXISTS pharmacy_availability_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  medicine_id TEXT NOT NULL,
  medicine_label TEXT NOT NULL,
  strength TEXT,
  form TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'responded', 'cancelled')),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT availability_requests_unique_idem UNIQUE (patient_id, idempotency_key)
);

ALTER TABLE pharmacy_availability_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient can view own availability requests"
  ON pharmacy_availability_requests FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Pharmacy staff can view requests for own pharmacy"
  ON pharmacy_availability_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_memberships pm
      WHERE pm.pharmacy_id = pharmacy_availability_requests.pharmacy_id
        AND pm.user_id = auth.uid()
    )
  );

-- No client INSERT: created via server route with idempotency.

CREATE INDEX idx_avail_requests_patient
  ON pharmacy_availability_requests (patient_id, created_at DESC);
CREATE INDEX idx_avail_requests_pharmacy
  ON pharmacy_availability_requests (pharmacy_id, status, created_at DESC);

-- ============================================================
-- 5. AVAILABILITY RESPONSES (operator → patient)
-- ============================================================
CREATE TABLE IF NOT EXISTS pharmacy_availability_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES pharmacy_availability_requests(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN (
    'confirmed_available', 'limited', 'unavailable', 'cannot_confirm_now'
  )),
  note_for_patient TEXT CHECK (note_for_patient IS NULL OR char_length(note_for_patient) <= 300),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT availability_responses_unique_idem UNIQUE (request_id, idempotency_key)
);

ALTER TABLE pharmacy_availability_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesting patient can view responses to own requests"
  ON pharmacy_availability_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_availability_requests r
      WHERE r.id = pharmacy_availability_responses.request_id
        AND r.patient_id = auth.uid()
    )
  );

CREATE POLICY "Pharmacy staff can view responses for own pharmacy"
  ON pharmacy_availability_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_memberships pm
      WHERE pm.pharmacy_id = pharmacy_availability_responses.pharmacy_id
        AND pm.user_id = auth.uid()
    )
  );

-- Responses are written by the server route only (attributable + timestamped).

CREATE INDEX idx_avail_responses_request
  ON pharmacy_availability_responses (request_id, created_at DESC);
CREATE INDEX idx_avail_responses_responder
  ON pharmacy_availability_responses (responder_id);

-- ============================================================
-- 6. AUDIT EVENTS (append-only; never patient health data)
-- ============================================================
CREATE TABLE IF NOT EXISTS pharmacy_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pharmacy_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pharmacy staff can view own pharmacy audit"
  ON pharmacy_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_memberships pm
      WHERE pm.pharmacy_id = pharmacy_audit_events.pharmacy_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can append own pharmacy audit"
  ON pharmacy_audit_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pharmacy_memberships pm
      WHERE pm.pharmacy_id = pharmacy_audit_events.pharmacy_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE INDEX idx_pharmacy_audit_recent
  ON pharmacy_audit_events (pharmacy_id, created_at DESC);
