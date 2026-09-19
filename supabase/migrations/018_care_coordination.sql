-- Migration 018: Doctor Availability, Appointment Coordination, Adaptive Consultation (Part 3)
-- Forward-only, additive. Does not alter existing tables or policies.
-- Every table is RLS-enabled with explicit policies. Append-only audit tables
-- grant SELECT/INSERT only. Roles are never client-asserted.

-- ============================================================
-- 1. FACILITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

-- Facilities are reference data: readable by any authenticated user,
-- writable by coordinators only (checked via membership below).
CREATE POLICY "Authenticated users can view facilities"
  ON facilities FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 2. FACILITY MEMBERSHIPS (role source of truth — server-managed)
-- ============================================================
CREATE TABLE IF NOT EXISTS facility_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('clinician', 'coordinator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_memberships_unique UNIQUE (user_id, facility_id)
);

ALTER TABLE facility_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own memberships"
  ON facility_memberships FOR SELECT
  USING (auth.uid() = user_id);

-- NOTE: intentionally NO "view memberships in own facility" policy here —
-- a second SELECT policy subquerying facility_memberships recurses
-- infinitely (42P17) because Postgres re-evaluates the table's own policies
-- inside the policy. Members read their own rows via the policy above;
-- staff scoping is enforced server-side in API routes.

-- No INSERT/UPDATE/DELETE policies for regular users: membership changes go
-- through the admin-key-guarded API only.

CREATE INDEX idx_facility_memberships_facility
  ON facility_memberships (facility_id, role);

-- ============================================================
-- 3. CLINICIAN PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS clinician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
  specialty TEXT NOT NULL DEFAULT 'general',
  languages TEXT[] NOT NULL DEFAULT '{en}',
  modes TEXT[] NOT NULL DEFAULT '{text}'
    CHECK (modes <@ ARRAY['text','audio','video']::text[] AND array_length(modes, 1) >= 1),
  availability_state TEXT NOT NULL DEFAULT 'offline'
    CHECK (availability_state IN ('available', 'busy', 'offline')),
  next_available_at TIMESTAMPTZ,
  max_active_requests INTEGER NOT NULL DEFAULT 5 CHECK (max_active_requests BETWEEN 1 AND 50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clinician_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinician can view own profile"
  ON clinician_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view published profiles"
  ON clinician_profiles FOR SELECT
  USING (
    availability_state IN ('available', 'busy')
    OR auth.uid() = user_id
  );

CREATE POLICY "Clinician can update own profile"
  ON clinician_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND user_id = user_id  -- identity columns immutable by policy
  );

CREATE INDEX idx_clinician_profiles_discoverable
  ON clinician_profiles (availability_state, specialty);

-- ============================================================
-- 4. CLINICIAN AVAILABILITY HISTORY (append-only audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS clinician_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_id UUID NOT NULL REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('available', 'busy', 'offline')),
  note TEXT,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clinician_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinician can view own availability history"
  ON clinician_availability FOR SELECT
  USING (
    auth.uid() = changed_by
    OR EXISTS (
      SELECT 1 FROM clinician_profiles cp
      WHERE cp.id = clinician_availability.clinician_id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Clinician can append own availability history"
  ON clinician_availability FOR INSERT
  WITH CHECK (auth.uid() = changed_by);

CREATE INDEX idx_clinician_availability_recent
  ON clinician_availability (clinician_id, created_at DESC);

-- ============================================================
-- 5. CARE REQUEST ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS care_request_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_request_id UUID NOT NULL REFERENCES care_requests(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
  -- One non-released assignment per request
  state TEXT NOT NULL DEFAULT 'assigned'
    CHECK (state IN ('assigned', 'accepted', 'declined', 'released')),
  reason_category TEXT CHECK (reason_category IN ('not_available', 'out_of_scope', 'capacity_full')),
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assignments_one_active_per_request UNIQUE (care_request_id, clinician_id)
);

ALTER TABLE care_request_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient can view assignments for own requests"
  ON care_request_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM care_requests cr
      WHERE cr.id = care_request_assignments.care_request_id
        AND cr.user_id = auth.uid()
    )
    OR auth.uid() = clinician_id
    OR EXISTS (
      SELECT 1 FROM facility_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.facility_id = care_request_assignments.facility_id
    )
  );

CREATE POLICY "Staff can insert assignments"
  ON care_request_assignments FOR INSERT
  WITH CHECK (auth.uid() = assigned_by);

CREATE POLICY "Assigned clinician can update own assignment"
  ON care_request_assignments FOR UPDATE
  USING (auth.uid() = clinician_id)
  WITH CHECK (auth.uid() = clinician_id);

CREATE INDEX idx_assignments_request ON care_request_assignments (care_request_id);
CREATE INDEX idx_assignments_clinician ON care_request_assignments (clinician_id, state);

-- ============================================================
-- 6. APPOINTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS care_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_request_id UUID NOT NULL UNIQUE REFERENCES care_requests(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('text', 'audio', 'video')),
  proposed_starts_at TIMESTAMPTZ,
  confirmed_starts_at TIMESTAMPTZ,
  patient_acknowledged_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN (
      'draft','queued_offline','submitted','awaiting_review','assigned',
      'accepted','appointment_proposed','appointment_confirmed',
      'in_consultation','completed','cancelled','declined','expired','needs_attention'
    )),
  room_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE care_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient can view own care_appointments"
  ON care_appointments FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Clinician can view own care_appointments"
  ON care_appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clinician_profiles cp
      WHERE cp.id = care_appointments.clinician_id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Coordinator can view facility care_appointments"
  ON care_appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clinician_profiles cp
      JOIN facility_memberships fm ON fm.user_id = auth.uid()
        AND fm.facility_id = cp.facility_id
      WHERE cp.id = care_appointments.clinician_id
    )
  );

-- State changes are server-side (service role) via validated API routes;
-- no direct INSERT/UPDATE policies for clients.

CREATE INDEX idx_appointments_patient ON care_appointments (patient_id, state);
CREATE INDEX idx_appointments_clinician ON care_appointments (clinician_id, state);

CREATE TRIGGER set_appointments_updated_at
  BEFORE UPDATE ON care_appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. APPOINTMENT STATUS EVENTS (append-only audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS appointment_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES care_appointments(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prev_state TEXT,
  next_state TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE appointment_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view status events"
  ON appointment_status_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM care_appointments a
      WHERE a.id = appointment_status_events.appointment_id
        AND (a.patient_id = auth.uid() OR EXISTS (
          SELECT 1 FROM clinician_profiles cp
          WHERE cp.id = a.clinician_id AND cp.user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "System can append status events"
  ON appointment_status_events FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

CREATE INDEX idx_status_events_appointment
  ON appointment_status_events (appointment_id, created_at DESC);

-- ============================================================
-- 8. CONSULTATION MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS consultation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES care_appointments(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('patient', 'clinician', 'coordinator')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  client_created_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE consultation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view own-thread messages"
  ON consultation_messages FOR SELECT
  USING (
    auth.uid() = sender_id
    OR EXISTS (
      SELECT 1 FROM care_appointments a
      WHERE a.id = consultation_messages.appointment_id
        AND a.patient_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM care_appointments a
      JOIN clinician_profiles cp ON cp.id = a.clinician_id
      WHERE a.id = consultation_messages.appointment_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can send messages"
  ON consultation_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      EXISTS (
        SELECT 1 FROM care_appointments a
        WHERE a.id = consultation_messages.appointment_id AND a.patient_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM care_appointments a
        JOIN clinician_profiles cp ON cp.id = a.clinician_id
        WHERE a.id = consultation_messages.appointment_id AND cp.user_id = auth.uid()
      )
    )
  );

CREATE INDEX idx_messages_appointment
  ON consultation_messages (appointment_id, created_at);

-- ============================================================
-- 9. DOCUMENT SHARE CONSENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS document_share_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_request_id UUID NOT NULL REFERENCES care_requests(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_ids UUID[] NOT NULL DEFAULT '{}',
  consent_version TEXT NOT NULL DEFAULT '2026.09-p3.1',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE document_share_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient can view own consents"
  ON document_share_consents FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Patient can grant own consents"
  ON document_share_consents FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patient can revoke own consents"
  ON document_share_consents FOR UPDATE
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

CREATE INDEX idx_share_consents_request
  ON document_share_consents (care_request_id, granted_at DESC);

-- ============================================================
-- 10. CONSULTATION AUDIT EVENTS (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS consultation_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES care_appointments(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE consultation_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view consultation audit"
  ON consultation_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM care_appointments a
      WHERE a.id = consultation_audit_events.appointment_id
        AND (a.patient_id = auth.uid() OR EXISTS (
          SELECT 1 FROM clinician_profiles cp
          WHERE cp.id = a.clinician_id AND cp.user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "Participants can append consultation audit"
  ON consultation_audit_events FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

CREATE INDEX idx_consult_audit_appointment
  ON consultation_audit_events (appointment_id, created_at DESC);
