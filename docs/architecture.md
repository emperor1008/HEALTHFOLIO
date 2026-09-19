# Healthfolio — System Architecture (Release)

Truthful as-built architecture for the rural-care platform (Parts 1–5).
Every claim here maps to code in the repository.

## 1. High-level view

```
┌─────────────────────────── Patient device (browser) ───────────────────────────┐
│  Next.js App Router UI (en/hi/or, offline i18n dictionaries)                   │
│                                                                                │
│  Capture flow ─┐   Care-request wizard ─┐   Secure text ─┐   Pharmacy finder ─┐ │
│                │                        │                │                    │ │
│                ▼                        ▼                ▼                    ▼ │
│              Offline queue engine (IndexedDB, src/lib/offline)                 │
│              • sequential sync  • idempotency keys  • bounded backoff          │
│              • truthful states: pending|syncing|synced|failed|needs-attention  │
└────────────────────────────────────┬───────────────────────────────────────────┘
                                     │ HTTPS, session auth (Supabase anonymous)
┌────────────────────────────────────▼───────────────────────────────────────────┐
│ Next.js API routes (Zod-validated, server-side authz, safe error mapping)      │
│  records/upload  care-requests  triage  appointments  messages  consents       │
│  clinician documents  pharmacy stock/requests  metrics  region config          │
└────────────────────────────────────┬───────────────────────────────────────────┘
                                     │ service-role (server only)
┌────────────────────────────────────▼───────────────────────────────────────────┐
│ Supabase / Postgres                                                            │
│  • RLS on every user-owned table (migrations 001–022)                          │
│  • Private `documents` storage bucket; short-lived signed URLs                 │
│  • Append-only audit + reliability_metrics tables (no client writes)           │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Patient application

- **Framework**: Next.js 14 (App Router) + React, Tailwind design system
  (warm ivory / forest teal / sage / restrained terracotta).
- **PWA**: `public/manifest.webmanifest` + `public/sw.js`. The service worker
  caches only non-sensitive app-shell assets. Protected API responses and
  documents are never cached; cross-patient leakage on shared devices is
  prevented by keeping all patient data out of the SW cache entirely.
- **i18n**: dictionary-based, offline. Part 1 base dictionary plus part2/3/4
  modules and the journey dictionary. English fallback for missing keys;
  medical record content is never translated.
- **Accessibility**: 44px minimum touch targets, icon+text controls, semantic
  landmarks, labelled forms, visible focus, aria-live for sync/consultation
  status, reduced-motion support, responsive 320px → desktop.

## 3. Offline queue (the reliability core)

- **Storage**: IndexedDB (memory driver for tests), items + blobs in separate
  stores (`src/lib/offline/storage.ts`).
- **Engine** (`src/lib/offline/sync-engine.ts`): strictly sequential delivery;
  concurrent `syncNow` calls coalesce; triggers = reconnect, foreground/focus,
  manual "Sync now", enqueue-when-online.
- **State machine** (`state-machine.ts`): `pending → syncing → synced | failed
  | pending; failed → syncing|pending|requires_attention`. `synced` is reached
  only from a real server acknowledgement. Bounded exponential backoff
  (5s·2^n capped at 120s, max 5 auto retries) with user retry that overrides
  backoff windows.
- **Idempotency**: every item carries a UUID idempotency key replayed on every
  attempt; all server write routes deduplicate on it, so retries never create
  duplicate records.
- **Queueable actions**: care requests (incl. Part 2 packets), staged record
  uploads (file bytes in IndexedDB blobs), language/contact profile updates,
  secure appointment messages, pharmacy stock updates, pharmacy availability
  requests/responses.
- **Failure honesty**: transport failures → retryable, sanitized reason;
  definitive rejections (401/403/4xx validation) → needs-attention with
  Retry/Remove-after-confirmation. Nothing is ever silently discarded.

## 4. Data layer, RLS, and storage

- Migrations 001–022 are forward-only and additive. Key rural-care tables:
  - **Part 1**: care_requests (+ idempotency), document pipeline.
  - **Part 2**: triage_assessments (append-only, no symptom text) + packet
    columns on care_requests.
  - **Part 3**: facilities, clinician_profiles, facility_memberships,
    clinician_availability (history), care_request_assignments, appointments,
    appointment_status_events, consultation_messages, document_share_consents,
    consultation_audit_events, clinician_document_access(+_audit).
  - **Part 4**: pharmacies, pharmacy_memberships, pharmacy_stock_events
    (append-only truth; latest event per (pharmacy, medicine) wins),
    pharmacy_availability_requests/responses, pharmacy_audit_events.
  - **Part 5**: reliability_metrics (append-only, closed event vocabulary),
    region_config.
- **RLS**: enabled on every user-owned table with explicit per-operation
  policies. Tables where the server must arbitrate (stock events, requests,
  responses, appointments, metrics) deliberately have **no client
  INSERT/UPDATE policies** — writes happen only through server routes that
  verify identity, role, and ownership.
- **Documents**: private bucket; patient-scoped paths; access only via
  short-lived signed URLs. Clinician access to documents requires an active,
  patient-granted consent covering the **exact** document, a valid
  time-limited grant (24h default), and produces an audit event per open.
  Revocation ends future access immediately.

## 5. Deterministic triage (Part 2)

- `src/lib/triage/concepts.ts`: closed set of broad symptom concepts — the
  hard boundary of what interpretation may produce.
- `normalizer.ts`: offline, deterministic matching of typos/aliases and
  verified Hindi/Odia phrases to broad concepts; preserves original text;
  confidence levels; uncertain input asks for clarification.
- `red-flags.ts`: versioned rules (`2026.09-part2.1`) with documented source
  references; emergency > urgent > routine priority is structural; output is
  rule IDs + version only (auditable, never patient-facing wording).
- No LLM is involved anywhere in triage. No disease names are generated.

## 6. Care coordination (Part 3)

- **Roles**: patient / clinician / coordinator, resolved server-side from
  `facility_memberships` (admin-key-guarded writes). Clients cannot assert
  roles.
- **Appointment lifecycle**: pure state machine (`src/lib/appointments/
  state-machine.ts`) with role-checked transitions, actor+timestamp audit,
  idempotent replays; emergency requests are refused routine routing.
- **Matching**: deterministic, explainable scoring (freshness, language,
  mode, capacity) in `care-options.ts`; no "best doctor" claims; honest
  empty list when no genuine clinician is available.
- **Consultation**: text/store-and-forward is primary and offline-capable;
  audio/video use WebRTC behind an authorization-checked signalling seam.
  Media permissions are requested only on Join; connection states are shown
  truthfully (Connecting/Connected/Reconnecting/failed), with visible
  "Continue by secure text" / "Try audio only" fallbacks. No TURN is
  configured by default, so the UI never claims reliable video.

## 7. Pharmacy workflow (Part 4)

- Operators update stock via the console (offline-safe through the queue);
  every event stores pharmacy, medicine, status, optional quantity hint
  (never shown to patients unless explicitly enabled), staff-only note,
  source, operator, server timestamp, idempotency key.
- Patient results show status + last-confirmed timestamp + freshness only.
  The freshness policy (configurable; default fresh<24h, stale<7d, expired
  ≥7d) demotes stale "available" to "Not recently confirmed".
- Availability requests are questions, not reservations; responses are
  attributable and timestamped; patients see only factual replies.

## 8. Observability (Part 5)

- `reliability_metrics` records closed-vocabulary events (queue created/
  synced/failed, care request submitted, triage completed, clinician action,
  appointment lifecycle, consultation fallback, pharmacy status/response,
  consent grant/revoke) with aggregate metadata only.
- Recording is best-effort and never blocks request paths; invalid events are
  dropped at the Zod boundary and by a DB CHECK constraint.
- `/reliability` dashboard (staff-only via server-side role resolution) shows
  real counts, sync reliability, median time-to-clinician-action, fallback
  rate, and transparent definitions. Empty data shows "No data yet".

## 9. Failure recovery

| Failure | Behavior |
|---|---|
| Network drops mid-sync | In-flight item fails retryably, backoff scheduled; next item stops; reconnect triggers auto sync |
| Server 5xx / timeout | Retryable failure with sanitized reason; bounded retries; then needs-attention (visible) |
| Browser refresh/restart | Items restored from IndexedDB; states preserved; sync resumes on focus/reconnect |
| Duplicate taps/replays | Idempotency keys make replays no-ops server-side |
| Definitive rejection (401/403/4xx) | Needs-attention with Retry/View details; removal only with explicit confirmation |
| Consent revoked | Clinician access grant ended in the same moment; audit history retained |
| Stale pharmacy data | Status demoted to "Not recently confirmed"; never shown as current |
| DB errors | Mapped to safe typed responses; internals never reach the client |
