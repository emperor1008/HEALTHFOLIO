# Healthfolio — Part 4: Pharmacy Medicine Availability and Verified Stock Confirmation

Plan and as-built record. Builds on Parts 1–3: offline queue (`src/lib/offline`),
en/hi/or i18n with English fallback, medicine reference layer
(`src/lib/medicines` — RxNorm/DailyMed/OpenFDA adapters, deterministic
normalizer, `MedicineIdentity`), Supabase RLS patterns, and the Part 3
staff-role pattern (server-side role resolution).

## Honest-scope statement

No pharmacy exists in this deployment. Therefore:
- Every pharmacy list, stock result, and request view renders an honest empty
  state until a real operator updates real stock.
- Pharmacy roles live only in `pharmacy_memberships` (no client-controlled
  assignment; membership rows are managed server-side, same pattern as Part 3).
- Medicine identity comes from the verified medicine layer; stock data comes
  only from operator actions. The UI never invents either.

## Data model — migration 020 (forward-only, additive)

- `pharmacies(id, name, service_area_text, languages text[], is_open boolean,
  verification_state CHECK pending|verified|suspended, verified_by,
  verified_at, created_at, updated_at)`
- `pharmacy_memberships(id, user_id, pharmacy_id, role CHECK operator|manager,
  UNIQUE(user_id, pharmacy_id))` — SELECT-only RLS for the member; writes go
  through the server (no client INSERT/UPDATE/DELETE policies)
- `pharmacy_stock_events(id, pharmacy_id, medicine_id, medicine_label,
  status CHECK available|low_stock|unavailable|not_stocked,
  quantity_hint int NULL (never shown to patients by default),
  show_quantity_to_patients boolean default false,
  internal_note text NULL (staff-only),
  source CHECK manual_operator|approved_integration,
  updated_by, server_recorded_at, idempotency_key,
  UNIQUE(pharmacy_id, medicine_id, idempotency_key))`
  — append-only history; latest valid event per (pharmacy, medicine) is truth
- `pharmacy_availability_requests(id, patient_id, pharmacy_id, medicine_id,
  medicine_label, strength NULL, form NULL, language,
  status CHECK pending|responded|cancelled, idempotency_key,
  UNIQUE(patient_id, idempotency_key))`
  — NO diagnosis/prescription/triage fields by design
- `pharmacy_availability_responses(id, request_id, pharmacy_id, responder_id,
  response CHECK confirmed_available|limited|unavailable|cannot_confirm_now,
  note_for_patient text NULL, idempotency_key,
  UNIQUE(request_id, idempotency_key))`
- `pharmacy_audit_events(id, pharmacy_id, actor_id, event, metadata jsonb)`
  — append-only; never contains patient health data
- RLS: patients read verified-pharmacy summaries + own requests/responses;
  staff rows scoped by membership; no client INSERT/UPDATE on stock events,
  requests, or responses (server routes only).

## Core libs

- `src/lib/pharmacy/freshness.ts` — configurable thresholds
  (`DEFAULT_FRESHNESS_POLICY`: fresh < 24h, aging < 72h, stale < 7d,
  expired ≥ 7d), `classifyFreshness` computed ONLY from server timestamps;
  `patientDisplayForEvent` converts stale/expired `available` into
  `not_recently_confirmed` so stale availability is never shown as current.
- `src/lib/pharmacy/roles.ts` — server-side membership resolution
  (`getPharmacyMemberships`, `canManage`, `canManageStaff`).
- `src/lib/pharmacy/schemas.ts` — Zod schemas for every write route.
- `src/lib/pharmacy/service.ts` — `getPatientStockView`: verified pharmacies
  only, latest event per pharmacy (deterministic), safe projection
  (status + timestamp + freshness — never notes/quantities).
- `src/lib/pharmacy/medicine-search.ts` — offline-safe search over a curated
  verified alias index (brand↔generic), typo-tolerant above a 0.92
  confidence threshold only, original query preserved verbatim, never
  guesses or substitutes.

## APIs (Zod + getUser + role checks + idempotency, repo conventions)

- `POST/GET /api/pharmacy/stock` — operator update (server timestamp, source,
  audit, idempotent replay) / own-pharmacy event list (staff-only surface).
  GET with `pharmacyId=me` resolves the caller's single membership.
- `GET /api/pharmacy/stock/patient-lookup?medicineId=` — patient lookup:
  verified pharmacies + latest valid event + freshness; safe fields only.
- `POST/GET /api/pharmacy/requests` — patient request (offline-queued,
  idempotent) / patient's own requests with responses.
- `GET /api/pharmacy/requests/inbox` — operator inbox for member pharmacies
  (medicine label/strength/form/language/status only — no patient identity).
- `POST /api/pharmacy/requests/respond` — operator response, attributable +
  timestamped, marks the request `responded`, writes audit, idempotent.

## Queue integration

New actions `pharmacy.stock_update`, `pharmacy.availability_request`, and
`pharmacy.availability_response` ride the existing Part 1 engine:
offline save → IndexedDB → auto-sync on reconnect → truthful states;
idempotency keys prevent duplicate events/requests/responses.
Staff state labels: Saved on this device | Waiting for connection | Syncing |
Updated | Needs attention. Failed items stay visible and retryable.

## UI (en/hi/or via `src/lib/i18n/part4.ts`)

- Patient: `/medicines/pharmacy` — search → identity confirmation ("Did you
  mean…" only for high confidence; user can reject; original query shown) →
  pharmacy results with pharmacy name + last-confirmed timestamp + freshness
  caution + non-binding note → "Ask the pharmacy to confirm" (offline queues
  truthfully) → "My confirmation requests" with real response states.
- Pharmacy: `/pharmacy` console — quick stock update (status buttons,
  optional quantity with explicit patient-display opt-in, staff-only note),
  requests needing response (four real response options), recent updates,
  membership-empty honest state, offline banner + pending count.
- Honest empty states everywhere; calm offline wording; no invented data.

## Safety boundaries

- Stock data never prescribes/recommends/substitutes; no dose or treatment
  advice in any stock surface (i18n tests enforce the word-sweep).
- No alternative-medicine suggestions; no equivalence claims between medicines.
- Patient requests carry medicine identity only — no health-record data.
- Internal notes and quantities never leave staff surfaces (API test asserts
  the exact safe projection key set).
- "Confirmed" appears only after a real operator response; requests are
  questions, never reservations.

## Testing

- `pharmacy-freshness-search.test.ts` (18) — thresholds, stale/expired
  never-available rule, no-update state, verbatim query, alias resolution,
  typo threshold, determinism, no-advice field set.
- `pharmacy-apis-security.test.ts` (20) — unauthenticated rejection, non-member
  403, invalid status/quantity 400, attribution + audit writes, duplicate
  idempotency for stock/request/response, unverified pharmacy 404, inbox
  isolation, patient-lookup safe projection.
- `pharmacy-ui.test.tsx` (6) — search + identity confirm flow, honest empty
  state, timestamp + freshness labels, offline request queues and never claims
  sent, request survives simulated reload, labelled controls.
- `i18n-part4.test.ts` (7) — key parity en/hi/or, non-empty values, fallback,
  dosage-word sweep, mandatory disclaimers, "reported" framing, script checks.

Run with `npm test`. Full gate: `npm run lint && npm run typecheck && npm test
&& npm run build && npm run secrets:scan && npm run db:verify`.
