# Final Architect Verification — Phase 6

Date: 2026-10-06. Scope: runtime verification of auth, RLS, authorization,
consent, doctor assignment, pharmacy, and the offline/PWA shell, executed
against a real (PGlite) Postgres plus the repository's real migrations.

## 1. What is verified

- **RLS** — `tests/integration/rls-policies.test.ts` (7/7). One row owned by
  Patient B is written as `service_role` for every probed table, then Patient
  A's `authenticated` connection attempts to read, update, and delete it.
  Assertions run against PostgreSQL's own policy engine.
- **service-role ownership** — `asRole('service_role')` (the app's server
  connection) bypasses RLS by design; the probe proves any caller can read
  every row, so every call site must scope its own queries. This is why the
  app uses service-role from server code, never from the browser.
- **Consent** — `tests/integration/consent-access.test.ts` (11/11).
- **Patient isolation** — `tests/integration/patient-isolation.test.ts`
  (18/18).
- **Clinician isolation** — `tests/integration/clinician-workflow.test.ts`
  (16/16).
- **Pharmacy isolation** — `tests/integration/pharmacy-workflow.test.ts`
  (10/10).
- **Doctor / pharmacy workflow** — harness probes confirm the real lifecycle
  and idempotency.
- **Storage security** — `storage.objects` folder-ownership probe.
- **Schema / constraints / RLS** — every migration in
  `supabase/migrations` applies cleanly (`migrationFailures` empty).

## 2. What is NOT VERIFIED — EXTERNAL ENVIRONMENT

- Real login / session (GoTrue) — placeholders only.
- Hosted Postgres settings and RLS in production (PGlite is local, zero-cost,
  deterministic).
- PostgREST / API routing / network auth.
- Realtime.
- Storage service (PGlite shim).
- Anything that depends on the hosted Supabase project.

These are marked `NOT VERIFIED — EXTERNAL ENVIRONMENT` and are never green.

## 3. Server posture

The app connects to the database with the service-role key from server code
only; the browser receives public project URL + anon key. RLS is enabled on
every user-owned table as defence in depth; the `user`-facing subset of
server-only tables keeps RLS enabled with zero client policies (reviewed
allow-list). Better Auth tables (`user`, `session`, `account`, `verification`)
are RLS-locked with no policies and revoked for `anon`/`authenticated`.

## 4. Result

✅ Integration suite green (69 files, 1197 tests) · ✅ tsc clean ·
✅ eslint 0 errors · ✅ next build succeeds · ✅ secrets scan clean ·
⚠ Realtime held `NOT VERIFIED — EXTERNAL ENVIRONMENT`.
