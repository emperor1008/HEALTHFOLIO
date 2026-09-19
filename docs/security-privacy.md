# Healthfolio — Security & Privacy (Release)

As-built security posture for the rural-care platform. Each section names the
mechanism and where it lives in code.

## 1. Access model

| Role | Resolution | Scope |
|---|---|---|
| Patient | Supabase anonymous session (`getUser()`) | Own profile, records, requests, appointments, messages, consents, queue data only |
| Clinician | `facility_memberships` row (server-side, `src/lib/staff/roles.ts`) | Only assigned/accepted care requests; only consented documents within validity window |
| Coordinator | `facility_memberships` (role = coordinator) | Own facility's clinicians, capacity, unassigned queue; region config |
| Pharmacy operator | `pharmacy_memberships` (role = operator) | Own pharmacy's stock, requests, internal notes only |
| Pharmacy manager | `pharmacy_memberships` (role = manager) | Own pharmacy plus staff management |

Rules enforced everywhere:
- **Roles are never client-asserted.** Every privileged request re-resolves
  membership server-side (`getStaffIdentity`, `getPharmacyMemberships`).
- **Cross-user access is denied in depth**: RLS policies at the database AND
  ownership checks in every API route.

## 2. Row-Level Security

- Every user-owned table across migrations 001–022 has RLS enabled with
  explicit per-operation policies (SELECT/INSERT/UPDATE/DELETE enumerated).
- Server-arbitrated tables (appointments, stock events, availability
  requests/responses, metrics) have **no client write policies** — writes only
  via server routes; the client cannot fabricate rows or states.
- Verification: `npm run db:verify` asserts required tables exist; policy
  suites (`part3-apis-security`, `part4-apis-security`, `part5-apis-security`,
  `clinician-document-access`, `pharmacy-apis-security`) test cross-user
  denial at the API layer.

## 3. Document storage and sharing

- Private `documents` bucket; object paths scoped by user id and portfolio.
- Access exclusively via **short-lived signed URLs** (5-minute expiry for
  clinician opens; upload URLs are single-use signed upload URLs).
- **Consent scope**: a clinician can open a document only when (a) assigned to
  the appointment, (b) the patient granted consent covering that exact
  document id, (c) the derived time-limited grant (24h) is unexpired and
  unrevoked, and (d) the consultation has not ended. Every open is audited
  (`clinician_document_access_audit`).
- **Revocation**: patient revoke (pre-consultation) ends future access at the
  same moment; audit history is preserved while active access is removed.
- Old routes cannot resurrect access: `clinician/documents` re-validates the
  grant on every request — an expired/revoked share returns 403.

## 4. Input validation and safe errors

- Zod schemas on every write route (`src/lib/pharmacy/schemas.ts`,
  per-route schemas elsewhere). Unknown/invalid payloads → 400 with typed,
  safe codes; no Postgres/PostgREST internals, stack traces, or SQL text are
  ever returned.
- ID params validated (UUID checks) before touching the database.
- Error responses use stable codes (`UNAUTHENTICATED`, `FORBIDDEN`,
  `NOT_FOUND`, `INVALID_BODY`, …) mapped to calm patient-facing wording in the
  UI; raw "Network Error" never appears on patient screens.

## 5. Rate limiting and abuse

- Secure-message endpoint: 30 messages/minute per sender+thread (server-side
  count before insert; returns 429).
- Idempotency keys on all queued writes make replay floods harmless — replays
  return the original record.
- Metrics/region endpoints are staff-only (403 for patient sessions).

## 6. Secrets and key management

- **No secrets in source or Git.** `npm run secrets:scan` (tracked-file
  scanner) runs in the release gate; `.env.local` is gitignored.
- `SUPABASE_SERVICE_ROLE_KEY` and `STAFF_ROLE_ADMIN_KEY` are **server-only**
  env vars; they are never prefixed `NEXT_PUBLIC_` and never sent to the
  browser. All admin-client usage lives in `src/lib/supabase/admin.ts` and
  server-only modules.
- Environment variable *names* are documented in the README; values are not.
- No WebRTC credentials or TURN secrets exist (no TURN is configured); the
  signalling endpoint creates no tokens in browser code.

## 7. Logging and metrics privacy

- No PII in logs: user ids, document ids, contact values, and symptom text
  are never logged (two prior `console.log` PII leaks in
  `documents/route.ts` and `runs/route.ts` were removed in Part 5).
- `reliability_metrics` stores closed-vocabulary event names, durations, and
  fixed metadata keys only — enforced by Zod (`validateMetric`) and a DB
  CHECK. Symptom text, document contents, phone numbers, and addresses are
  structurally impossible to record.
- Audit tables append-only via RLS (no UPDATE/DELETE policies).

## 8. Known security limitations

- Anonymous-session auth means "patient identity" is per-device session, not a
  verified person; a later real identity system can be layered on without
  schema rewrites (ownership columns already reference `auth.users`).
- Rate limiting is in-process per route; a dedicated shared limiter is needed
  for multi-instance deployments.
- No TURN infrastructure: media relay for symmetric-NAT clients is not
  available; text fallback is the dependable path (documented, not hidden).
- The dev-only Network Resilience Test Mode is double-gated (NODE_ENV +
  explicit flag), never writes data, and ships no code paths that fake server
  success — but it must not be enabled on shared production devices.
