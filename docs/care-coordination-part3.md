# Healthfolio — Part 3: Doctor Availability, Appointment Coordination, and Adaptive Consultation

Implementation plan **and as-built record**. Builds on Part 1 (offline queue /
PWA / i18n) and Part 2 (triage packets). Reuses `getUser()` anonymous-session
auth, `createAdminClient()`, `idempotency_keys`, the IndexedDB queue + state
machine, and the Zod-per-route conventions.

## As-built summary

- Migration `018_care_coordination.sql`: facilities, facility_memberships,
  clinician_profiles, clinician_availability (append-only),
  care_request_assignments, appointments (14 lifecycle states),
  appointment_status_events, consultation_messages, document_share_consents,
  consultation_audit_events — all RLS-enabled, explicit policies, no
  client-side INSERT/UPDATE on appointments (server-side via validated APIs).
- Core libs: `src/lib/staff/roles.ts` (server-side role resolution +
  admin-key guard), `src/lib/appointments/state-machine.ts` (pure transition
  table with actor rules, idempotent no-ops),
  `src/lib/appointments/care-options.ts` (deterministic, explainable matcher
  with freshness expiry and capacity).
- APIs under `src/app/api/`: `staff/admin/roles`, `facilities`,
  `clinicians/me/availability`, `care-options`,
  `care-requests/[id]/assign`, `care-requests/[id]/accept`, `appointments`,
  `appointments/[id]/status`, `appointments/[id]/messages`,
  `appointments/[id]/share-consent`, `consultations/[id]/signal`.
- Queue: new `appointment.message` action rides the Part 1 engine; the
  provider now also subscribes to live queue changes (bug fix — enqueue-time
  updates previously never reached React state).
- UI: patient status detail (`/care-requests/[id]`) with honest care-team
  list + freshness labels, consultation page (`/consultations/[id]`) with
  offline-queued secure text and a truthful lobby, staff console (`/staff`)
  with the not-configured state.
- Tests: 70 new (774 total). All lint/typecheck/build/secrets:scan pass.

## Honest-scope statement (read first)

The deployment uses **Supabase anonymous sign-in** — there is no staff identity
provider, no verified clinician directory, and no TURN/STUN infrastructure
configured. Therefore Part 3 is built as follows, honestly:

1. **Data model + protected APIs ship for real** (facilities, clinician
   profiles, availability, assignments, appointments, messages, consents,
   audit) with strict RLS and server-side role checks. Roles live in the
   server-only `user_roles` registry (migration 026) and are provisioned via
   `npm run staff:bootstrap` or the platform-admin console at `/staff/admin`
   — never from client input. No clinician accounts are auto-created.
2. **Patient UI ships for real**: request status detail, available-options
   view driven only by genuine `clinician_profiles` rows, appointment
   confirmation, consent screen, secure text (offline-queued).
3. **Clinician/coordinator consoles** render a truthful
   "Staff access is not configured" state until a staff account exists — no
   fabricated doctors, no demo slots, no fake queues.
4. **WebRTC lobby**: permission is requested only on Join; audio-first;
   honest connection states; text/audio fallbacks. Signalling is designed for
   a Supabase Realtime channel authorized by appointment participation; the
   lobby degrades gracefully when no realtime config exists. **No TURN is
   claimed**; text/store-and-forward is the dependable fallback.

Emergency requests (Part 2) are **never routed into appointment matching**;
the emergency guidance block is unchanged.

## Roles

- `patient` (default, every anonymous/authenticated user)
- `clinician`, `facility_coordinator`, `pharmacy_operator`,
  `pharmacy_manager`, `platform_admin` — stored server-side in the
  `user_roles` registry (RLS-enabled, no client policies) and assigned only
  by an existing platform admin (`/staff/admin` console) or the local
  `npm run staff:bootstrap` script. Resolution helper
  `getStaffIdentity(userId)` reads `facility_memberships` AND requires an
  active registry row (server-side only); clients can never assert a role,
  and suspended/revoked staff lose access on the next request.

## Migration 018 (forward-only, additive)

- `facilities(id, name, timezone, created_at)`
- `clinician_profiles(id, user_id UNIQUE, display_name, facility_id FK,
  specialty, languages text[], modes text[] CHECK (text|audio|video),
  availability_state CHECK (available|busy|offline), next_available_at,
  max_active_requests, updated_at)`
- `facility_memberships(id, user_id, facility_id, role CHECK
  (clinician|coordinator), UNIQUE(user_id, facility_id))`
- `clinician_availability(id, clinician_id, state, note, changed_by,
  created_at)` — append-only history (audit)
- `care_request_assignments(id, care_request_id FK UNIQUE active-per-request,
  clinician_id, facility_id, state CHECK (assigned|accepted|declined|released),
  reason_category, assigned_by, created_at)`
- `appointments(id, care_request_id FK, clinician_id, patient_id,
  mode CHECK (text|audio|video), proposed_starts_at, confirmed_starts_at,
  patient_acknowledged_at, state CHECK (...13 lifecycle states...),
  room_id nullable, created_at, updated_at, UNIQUE(care_request_id))`
- `appointment_status_events(id, appointment_id, actor_id, prev_state,
  next_state, metadata jsonb (redacted), created_at)` — append-only
- `consultation_messages(id, appointment_id, sender_id, sender_role,
  body (≤2000), client_created_at, delivered_at, created_at)`
- `document_share_consents(id, care_request_id, patient_id,
  document_ids uuid[], consent_version, granted_at, revoked_at nullable)`
- `consultation_audit_events(id, appointment_id, actor_id, event, metadata
  jsonb, created_at)` — append-only
- RLS on every table: patients see own rows; staff rows readable only by the
  owning clinician / same-facility coordinator via `facility_memberships`
  lookups; INSERT/UPDATE policies enforce identity + assignment where
  applicable. Append-only tables get SELECT/INSERT only.

## Appointment lifecycle (server-validated)

`draft → queued_offline → submitted → awaiting_review → assigned → accepted →
appointment_proposed → appointment_confirmed → in_consultation → completed`;
terminal side-states: `cancelled | declined | expired | needs_attention`.

- `src/lib/appointments/state-machine.ts` — pure transition table + actor/role
  rules (mirrors the Part 1 queue state-machine pattern; fully unit-tested).
- Every transition writes `appointment_status_events` with actor + prev/next.
- Duplicate transitions are idempotent (same-state no-op returns 200).

## APIs (repository conventions: Zod + getUser + generic error codes)

- `POST/PATCH /api/staff/admin/roles` — platform-admin-only role
  management (session-authorized; audited; idempotent)
- `GET /api/facilities` — genuine facilities only (empty list when none)
- `PATCH /api/clinicians/me/availability` — clinician self-update (audited)
- `GET /api/care-options` — deterministic match (urgency, language, specialty,
  mode, capacity, freshness) of REAL available clinicians; explainable score
  fields returned
- `POST /api/care-requests/[id]/assign|accept` — clinician/coordinator only,
  assignment-checked, idempotent
- `POST /api/appointments` + `POST /api/appointments/[id]/status` — Zod,
  role-checked transitions, idempotency keys
- `GET/POST /api/appointments/[id]/messages` — participants only; POST is
  queued-safe (client sends via offline queue action `appointment.message`)
- `POST /api/appointments/[id]/share-consent` (+ DELETE to revoke pre-start)
- `POST /api/consultations/[id]/signal` — join-token-guarded signalling
  relay stub (realtime path documented; no cross-room leakage)

## Queue integration

New queue action `appointment.message` (text consultation messages) rides the
existing Part 1 engine: offline composition → IndexedDB → auto-sync → delivered
only on server ack. Care-request status polling merges server state with local
queue state for truthful labels.

## Consent + document sharing

`document_share_consents` gates clinician document access: the document fetch
path for clinicians validates an active, non-revoked consent covering the
requested document for that specific care request; signed URLs only, never
public. Patient can revoke before consultation start; audit history retained.

## UI (en/hi/or via `src/lib/i18n/part3.ts`)

Patient: status detail, available options ("Available care team" — never
"best doctor"), appointment confirm, consent screen, secure text, lobby.
Clinician/coordinator: honest "Staff access is not configured" until role
exists; availability controls for real clinicians. All states truthful; the
no-clinician state says the request remains saved and will be reviewed when a
clinician becomes available.

## Testing (as built)

- `tests/unit/appointments-state-machine.test.ts` (28) — legal/illegal
  transitions, actor authorization, terminal states, idempotent no-ops.
- `tests/unit/care-options-matching.test.ts` (13) — freshness expiry,
  language/mode/capacity filters, deterministic explainable ordering,
  empty-when-no-data.
- `tests/unit/part3-apis-security.test.ts` (15) — admin-key guard, patient
  cannot assign, emergency not routable, cross-user denial (status/messages/
  consent), oversized/empty bodies, generic 500s, audit rows written.
- `tests/unit/consultation-ui.test.tsx` (7) — offline compose → queue (not
  delivered), refresh survival, delivered-only-after-ack, permission on Join
  only, permission-denied fallback, failed-setup fallbacks, aria-live.
- `tests/unit/i18n-part3.test.ts` (7) — en/hi/or parity, fallback,
  interpolation, honesty wording (no best-doctor/seen/diagnosis claims).

- `appointments-state-machine.test.ts` — every legal/illegal transition,
  actor rules, idempotency
- `care-options-matching.test.ts` — freshness expiry, language/specialty/
  mode/capacity/urgency ordering, empty-when-no-data, explanation payload
- `staff-roles-api.test.ts` — key guard, no client-controlled elevation
- `appointment-api.test.ts` — auth, ownership, cross-user rejection, invalid
  transitions, duplicate accept/confirm idempotency
- `consultation-messages.test.tsx` — offline queue survives remount, no
  delivered-before-ack, duplicate retry → one row, cross-user thread denial
- `share-consent-api.test.ts` — selected-only access, revocation, ownership
- `consultation-lobby.test.tsx` — permission on Join only, honest states,
  fallbacks, aria-live, no fake connected claim
- `i18n-part3.test.ts` — en/hi/or parity + fallback + no diagnosis wording
