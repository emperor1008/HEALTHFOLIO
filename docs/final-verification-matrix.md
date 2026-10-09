# Phase 6 Final Verification Matrix

All items verified against a real (PGlite) Postgres + the real migrations.
Anything that depends on hosted Supabase (Postgres settings, PostgREST,
GoTrue, Realtime, Storage services, network auth) is marked exactly:

`NOT VERIFIED — EXTERNAL ENVIRONMENT`

Never mark GREEN for external infrastructure.

| # | Item | Method | Result |
|---|---|---|---|
| 1 | RLS verified | PGlite + real migrations; queries executed against PG's policy engine; anon/authenticated/service_role roles, `auth.uid()` JWT claims, and `REVOKE ALL FROM anon, authenticated` on Better Auth tables | **PASS** — `tests/integration/rls-policies.test.ts` 7/7 |
| 2 | service-role ownership verified | `asRole('service_role')` bypass probe confirms any caller can read every row, so every call site must scope its own queries | **PASS** |
| 3 | consent verified | 11 probes: assignment+consent+grant OK; NO_ACTIVE_CONSENT; revocation denied; wrong doc 403; expired grant; unassigned 403; patient 403; honest TTL | **PASS** — `tests/integration/consent-access.test.ts` 11/11 |
| 4 | patient isolation verified | 18 probes: own-read, user_id eq filter dropped, owner forced on insert, cross-user read/update/delete blocked, audit filter, unauthenticated 401, allow-list + read-only, malformed uuid, signed URL 403/401/expired-URL | **PASS** — `tests/integration/patient-isolation.test.ts` 18/18 |
| 5 | clinician isolation verified | 16 probes: assign→accept, idempotency, second clinician 409, §13 concurrent assignments → 1 row, OFFLINE 409, capacity 409, emergency 409, only assigned clinician accepts, decline needs reason, patient cannot staff routes, suspended registry 403, coordinator scoped to own facility, missing doc 404 | **PASS** — `tests/integration/clinician-workflow.test.ts` 16/16 |
| 6 | pharmacy isolation verified | 10 probes: stock persisted as pharmacy_id=operator, display_status=fresh, pharmacy B 403, cannot read A's history, idempotency 200-dup, malformed 400/403, pending hidden, verified-only availability request, patient 403, unauthenticated 401 | **PASS** — `tests/integration/pharmacy-workflow.test.ts` 10/10 |
| 7 | real doctor workflow verified | harness assign→accept→patient status; idempotency; concurrent assignment dedupe; capacity; emergency routing | **PASS** |
| 8 | real pharmacy workflow verified | harness stock confirmation + availability request; idempotency; verified-only availability | **PASS** |
| 9 | Realtime verified | not deployed | `NOT VERIFIED — EXTERNAL ENVIRONMENT` |
| 10 | concurrency verified | harness probes for idempotent dedupe, capacity, exclusive ownership | **PASS** |
| 11 | storage security verified | `storage.objects` folder-ownership probe: owner A sees own folder, cannot see B's | **PASS** |
| 12 | integration tests pass | `vitest run` | **PASS** — 69 files, 1197 tests |
| 13 | regression tests pass | unit suite | **PASS** |
| 14 | full suite passes | `vitest run` | **PASS** |
| 15 | build passes | `npm run build` | **PASS** |
| 16 | secrets scan | `node scripts/scan-secrets.js` | **PASSED** |
| 17 | live Supabase auth/RLS/data/sync/Realtime | external | `NOT VERIFIED — EXTERNAL ENVIRONMENT` |
