# HEALTHFOLIO — Phase 6 Final Report

Date: 2026-10-06. Status: **Phase 6 complete — static + integration verification done; live Supabase verification held as `NOT VERIFIED — EXTERNAL ENVIRONMENT`.**

## 1. Objective

Replace static verification with runtime verification where possible, against
a real (PGlite) Postgres + the real migrations:

- AUTH
- DATABASE / RLS
- AUTHORIZATION
- CONSENT
- DOCTOR ASSIGNMENT
- PHARMACY
- REALTIME
- OFFLINE SYNC

Do **not** fake a live pass: anything that depends on hosted Supabase
(Postgres settings, PostgREST, GoTrue, Realtime, Storage services, network
auth) is reported as `NOT VERIFIED — EXTERNAL ENVIRONMENT`.

## 2. Verification summary

| Area | Method | Result |
|---|---|---|
| RLS | PGlite + real migrations, execute real policies | **PASS** (`tests/integration/rls-policies.test.ts`, 7/7) |
| service-role ownership | `asRole('service_role')` bypass probe | **PASS** |
| consent | `tests/integration/consent-access.test.ts` | **PASS** (11/11) |
| patient isolation | `tests/integration/patient-isolation.test.ts` | **PASS** (18/18) |
| clinician isolation | `tests/integration/clinician-workflow.test.ts` | **PASS** (16/16) |
| pharmacy isolation | `tests/integration/pharmacy-workflow.test.ts` | **PASS** (10/10) |
| real doctor workflow | `clinician-workflow` harness | **PASS** |
| real pharmacy workflow | `pharmacy-workflow` harness | **PASS** |
| Realtime | not deployed (external) | `NOT VERIFIED — EXTERNAL ENVIRONMENT` |
| concurrency | harness probes | **PASS** |
| storage security | `storage.objects` folder-ownership probe | **PASS** |
| integration tests | `vitest run` | **PASS** (1197 tests) |
| regression tests | unit suite | **PASS** |
| full suite | `vitest run` | **PASS** |
| build | `npm run build` | **PASS** |
| secrets scan | `node scripts/scan-secrets.js` | **PASSED** |

Live Supabase: unreachable (URL/anon key placeholders, `SUPABASE_SERVICE_ROLE_KEY`
empty). Auth, RLS, data, sync and Realtime therefore cannot run end-to-end here
and are labelled `NOT VERIFIED — EXTERNAL ENVIRONMENT` — never green.

## 3. Defects fixed (all caught by the harness)

1. **Signed URL path (DV-001)** — `storage/signed-url` `createSignedUrl` used
   `${doc.id}/${doc.original_name}`. Must use the stored `storage_path`
   (`{userId}/{portfolioId}/{documentId}/{filename}`), seeded canonically in
   `documents/route.ts` and `upload-sessions/page`.
2. **`original_name` on clinician-document route (DV-002)** — the
   `src/app/api/clinician/documents/route.ts` select list had no `file_name`
   column, so the route always returned 404. Added `original_name` to the
   select and wired it to `file_name`.
3. **CareRequestWizard document shape (DV-003)** — `fetch("/api/documents")`
   queried `GET /api/user-data/documents` with a shape that did not match the
   route. Fixed to
   `GET /api/user-data/documents?select=id,original_name,created_at&order=created_at.desc&limit=100`
   with state shape `original_name`.
4. **Clinician-document route 404 always (DV-004)** — schema had no
   `file_name` column; see #2.
5. **Pharmacy stock-events policy order (DV-005)** — `020_pharmacy_stock.sql`
   placed `Pharmacy staff can view own stock events` **before** the broad
   `Patients can view stock events for verified pharmacies`, so internal_note/
   quantity_hint could not be scoped to the operator without breaking the UI.
6. **Better Auth credential tables (DV-006)** — `031_rls_for_better_auth_tables.sql`
   enables RLS (zero policies) + `REVOKE ALL FROM anon, authenticated` on
   `user`, `session`, `account`, `verification`. Regression probe in
   `rls-policies.test.ts` ("does not expose Better Auth credentials") is green.

All four previously failing integration suites now pass:
patient-isolation 18/18, clinician-workflow 16/16, pharmacy-workflow 10/10,
consent-access 11/11.

## 4. Blocked items

- **Realtime** — not deployed; held `NOT VERIFIED — EXTERNAL ENVIRONMENT`.
- **Live login / RLS / Realtime** — external Supabase unreachable by design.

## 5. Next steps (after this phase)

- Deploy to the real project; rerun the harness against hosted Postgres.
- Finish `docs/phase6-final-report.md` rows: `docs/final-verification-matrix.md`
  and `docs/final-architect-verif.md` carry the `NOT VERIFIED — EXTERNAL
  ENVIRONMENT` rows for anything depending on hosted infrastructure.
- Continue the §16 checklist.

Generated 2026-10-06. Full gate: tsc clean · eslint 0 errors · vitest 1197
passed · next build succeeded · secrets scan passed.
