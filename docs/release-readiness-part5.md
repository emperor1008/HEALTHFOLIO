# Healthfolio — Part 5: Reliability, Observability, Validation, Release Readiness

As-built record. Parts 1–4 were preserved; Part 5 strengthens, integrates,
measures, and documents the whole platform.

## What was added

### A. Journey orchestration
- `src/lib/journey/status.ts` — deterministic derivation of the patient's
  end-to-end steps from REAL state only (offline queue items, care-request
  row, appointment row, consent state, pharmacy request). Timestamps appear
  only when they genuinely exist. "Needs attention" maps to genuine failures
  (failed queue items, declined/cancelled/expired appointments, revoked
  consent).
- `src/lib/journey/dict.ts` + `src/components/journey/JourneyStatus.tsx` —
  accessible timeline (ol, aria-live current-step announcement, 44px retry
  targets, icon+text buttons, no keyframe animations) in en/hi/or.

### B. Reliability
- Full audit of all queueable actions (8 action types) — all IndexedDB-
  persisted with UUID idempotency keys, bounded backoff, truthful states.
- **Real engine fix found by the release test suite:** a manual "Sync now"
  racing an in-flight auto pass could be coalesced and then blocked by the
  backoff window, so the item did not retry until the window expired.
  `selectDueItems` now accepts `ignoreBackoff` (manual passes only) — user
  retries always behave as asked. Regression-tested.
- `src/lib/dev/network-resilience.ts` + `src/components/dev/NetworkResilience
  Panel.tsx` — dev-only profiles (offline, slow 2G, slow 3G, timeout,
  drop-during-sync). Double-gated (NODE_ENV + explicit localStorage flag);
  delays/drops requests only, never fakes success, never writes data.

### C. Security audit outcomes
- PII leakage fixed: `console.log` of user/document ids removed from
  `documents/route.ts` and `runs/route.ts`.
- Cross-user denial tests consolidated across part3/part4/part5 suites:
  patient↔patient, clinician↔unassigned, pharmacy↔pharmacy, revoked-consent
  access, expired grants, malformed payloads, invalid transitions — all 401/
  403/404 with safe codes, no internals.
- New: `tests/unit/part5-apis-security.test.ts` (metrics staff-only gate,
  region-config coordinator-only writes, zeroed-summary truthfulness, DB
  failure → safe summary).

### D. Performance
- Capture modules (CameraScanner, PageReview, UploadProgress,
  ProcessingProgress) are now `next/dynamic` code-splits — the dashboard
  first paint no longer loads camera/canvas/OCR-adjacent code.
- WebRTC usage already isolated to the consultation route; consultation page
  builds to 2.55 kB route size (154 kB first load) per build output.
- Existing limits verified: documents list capped (100), messages capped,
  stock events capped (100), metrics reads capped (5000), media streams stop
  on unmount/failure paths, object URLs revoked in the capture flow.
- Measured (development build): `/consultations/[id]` 2.55 kB / 154 kB,
  `/dashboard` 12.4 kB / 232 kB, `/medicines` 4.42 kB / 206 kB first-load JS.

### E. Accessibility & multilingual
- `tests/unit/part5-a11y-i18n.test.tsx` — journey dictionary parity en/hi/or,
  every derived step has translations in all three languages, aria-live and
  semantic list verified, icon+text retry control, no keyframe animations on
  journey rows; part4 dict parity re-asserted. Existing per-part suites
  continue to enforce their dictionaries.

### F. Region configuration
- `src/lib/region/config.ts` (Zod-validated schema + safe unconfigured
  default: no fabricated phone numbers/locations, optional features off),
  `src/lib/region/service.ts` (coordinator-only writes resolved server-side),
  migration 022 (`region_config`, RLS: authenticated read, no client writes).

### G. Metrics & observability
- Migration 021: `reliability_metrics` (append-only, closed event vocabulary
  enforced by DB CHECK, no client policies).
- `src/lib/metrics/events.ts` — closed vocabulary + per-event fixed metadata
  schemas (free-form metadata rejected); explicit dashboard definitions.
- `src/lib/metrics/service.ts` — best-effort recording (invalid events
  dropped; never breaks request paths); aggregation for the dashboard.
- Wired into: queue engine (created/synced/failed — action type only),
  stock update route, consent grant/revoke route.
- `src/app/api/metrics/summary/route.ts` + `src/app/(app)/reliability/page.tsx`
  — staff-only dashboard with truthful "No data yet" and transparent
  definitions.

### H. Documentation
README (rural-care sections + limitations), `docs/architecture.md`,
`docs/security-privacy.md`, `docs/operations-runbook.md`,
`docs/demo-script.md`, `docs/deployment-checklist.md`, this file.

## E2E tooling decision

`@playwright/test` was already a devDependency; what was missing was the
**config, specs, and a working browser binary**. As part of Part 5 this was
completed:

- `playwright.config.ts` — desktop Chromium + mobile (Pixel 5) projects,
  auto-started dev server on an explicit port 3100 (the CLI flag is required
  because an ambient `PORT=0` env makes Next.js bind a random port).
- `tests/e2e/app-shell.spec.ts` — 6 specs × 2 projects = **12 passing e2e
  tests** against the real dev server: home renders with no raw error text,
  offline fallback page serves, PWA manifest + service worker present, the
  reliability surface shows no fabricated numbers, and no horizontal overflow
  at 320px.
- One-time setup: `npx playwright install chromium --only-shell` (the cached
  browser was older than the dependency expected).
- Scope note: e2e specs assert shell/honesty guarantees only — no clinical
  data is created in e2e (no fake patients/records/appointments). Clinical
  flow coverage lives in the unit/integration suite.

## Test results (final gate, recorded)

- lint: pass (5 pre-existing warnings, none in release files)
- typecheck: pass
- unit/integration tests: **869 passed / 0 failed** (782 before Part 5)
- e2e: **12 passed / 0 failed** (Playwright, desktop + mobile)
- build: compiled successfully
- secrets:scan: PASSED — no secrets in tracked files
- db:verify: 30/30 checks pass — including migrations 021–022 tables

## Honest limitations

- Real clinician/pharmacy participation is required for any live data; empty
  states are honest everywhere.
- WebRTC universal reliability requires correctly configured signalling and
  TURN; none is configured, so text/store-and-forward is the dependable path.
- The platform is not a diagnostic or emergency-response replacement.
- E2E specs cover the app shell + honesty guarantees; deeper browser-level
  clinical flows are intentionally not simulated in e2e (test-data policy).
- Rate limiting is in-process; a shared limiter is needed for multi-instance
  deployments.

## Secrets confirmation

`npm run secrets:scan` PASSED. No credentials, tokens, passwords, or
confidential values were committed; env names only are documented; admin keys
are read from server environment exclusively.
