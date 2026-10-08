# Healthfolio — Final Bug Register

Audit date: 2026-10-05 · Branch: `security/next-and-staff-hardening`
Method: static inspection of the real source, production build + headless-browser playtest on
`localhost:3000`, API probing over HTTP, and the project's own verifiers
(`lint`, `typecheck`, `test`, `build`, `test:e2e`, `secrets:scan`, `ai:check`).
Only issues actually observed or reproduced are listed. Unverifiable items are marked as such.

| ID | Severity | Feature | Reproduction | Root cause | Fix | Regression test | Status |
|----|----------|---------|--------------|------------|-----|-----------------|--------|
| HF-001 | P1 | Auth error feedback | Submit sign-in with DB unreachable (placeholder Supabase host) | Every failure collapsed to one misleading credential message | Typed error mapping: network throw / 5xx / credential failures each get honest copy | Browser re-verified 2026-10-05 | FIXED (pre-audit, re-verified) |
| HF-002 | P2 | Voice UI | `npm run lint` flagged ref writes during render in `VoiceAssistant.tsx` | Refs synced inside render instead of post-commit effect | Refs synced in `useEffect` after commit | lint 0 errors | FIXED (pre-audit, re-verified) |
| HF-003 | P2 | Test fixture | `part5-journey-metrics` closed-vocabulary test failed after voice events were added | Fixture predated the 11 voice metric events | Fixture extended with all voice event metadata shapes | `npm test` 1130 pass | FIXED (pre-audit, re-verified) |
| HF-004 | **P1** | **Offline / PWA** | `curl /sw.js` and `/manifest.webmanifest` returned **307 → /sign-in**; console: `The script resource is behind a redirect, which is disallowed.` | `src/proxy.ts` matcher excluded only images/`_next`; the auth gate swallowed the service worker, the manifest and `/offline` | Matcher now excludes `sw.js`, `manifest.webmanifest`, `branding/`, icon/font extensions; `/offline` added to `PUBLIC_ROUTES` | `tests/unit/proxy-pwa-assets.test.ts` (4 tests) + strengthened `tests/e2e/app-shell.spec.ts` (`maxRedirects: 0`) | **FIXED — runtime verified:** SW `active`, scope `/`, shell cache holds `/offline`, `/manifest.webmanifest`, logo |
| HF-005 | P3 | Auth pages | Browser tab said “Healthfolio — Your health history, clearly organized” on sign-in/register/forgot/reset | Client component pages cannot export `metadata`; no auth layout supplied one | Thin server wrappers per page exporting page-specific titles (same pattern as `access-denied`) | Titles asserted via `curl` on all four routes | FIXED |
| HF-006 | P2 | Test quality | Two e2e PWA tests passed while the assets were actually broken | Playwright follows redirects; assertions were weak enough to pass on the sign-in page | `maxRedirects: 0`, status/content-type/body assertions, real offline-page heading | e2e 12/12 pass after fix | FIXED |
| HF-007 | P2 | Repo hygiene | `/voice-playtest` was a public route mounting the real assistant | Throwaway playtest scaffold was never removed (its own comment said so) | Page deleted, route removed from proxy | Build + route returns 307 to sign-in like any unknown protected path | FIXED |
| HF-008 | P3 | Docs vs code | `src/lib/supabase/user-context.ts` claimed its “helpers make [owner scoping] the path of least resistance” | No such helpers exist; scoping is per-call-site with a service-role connection (RLS bypassed) | Docstring corrected to state the real invariant and the review requirement for new queries | – (documentation) | FIXED |
| DV-001 | P2 | Storage_signed_url | `createSignedUrl` built `${doc.id}/${doc.original_name}` instead of the stored `storage_path` | The app serves files from `documents/` + `upload-sessions/` via the canonical `{userId}/{portfolioId}/{documentId}/{filename}` path; the URL mismatch broke ownership-safe links | `createSignedUrl` now uses `storage_path`; harness seed sows the canonical path | `tests/integration/patient-isolation.test.ts` signed-URL probes (403/401/expired) | FIXED (pre-audit, re-verified) |
| DV-002 | P2 | Clinician_document_route | `src/app/api/clinician/documents/route.ts` selected no `original_name` column (schema has no `file_name`) | Route always 404'd on the document read | Added `original_name` to the select and wired it to `file_name` | clinician-workflow + patient-isolation routes | FIXED (pre-audit, re-verified) |
| DV-003 | P2 | CareRequestWizard | `fetch("/api/documents")` used a GET shape that did not match the route | The wizard's document picker could not render original filenames | `GET /api/user-data/documents?select=id,original_name,created_at&order=created_at.desc&limit=100` with state shape `original_name` | harness + clinician-workflow | FIXED (pre-audit, re-verified) |
| DV-004 | P2 | Clinician_document_route_404 | The clinician-document route silently 404'd on every read | No `file_name` column in schema; route assumed one | Select corrected; `original_name` wired | regression probes | FIXED |
| DV-005 | P2 | Pharmacy_stock_events_policy | `020_pharmacy_stock.sql` placed "Pharmacy staff can view own stock events" after the broad "Patients can view stock events for verified pharmacies" | Scoped policy (internal_note/quantity_hint) was shadowed by the broad policy | Reordered the two policies | `tests/integration/pharmacy-workflow.test.ts` (10/10) | FIXED |
| DV-006 | P2 | Better_Auth_credential_tables | `031` migration applied too late; `user`/`session`/`account`/`verification` had no RLS + default grants exposed credentials | If RLS were ever disabled, anon/authenticated could read session tokens, credential hashes, PII | RLS enabled (zero policies) + `REVOKE ALL FROM anon, authenticated` on the four tables | `rls-policies.test.ts` "does not expose Better Auth credentials" (4 roles × 4 tables = denied) | FIXED |

## Observed limitations (not bugs)

| ID | Classification | Evidence | Why not fixed |
|----|----------------|----------|---------------|
| HF-L01 | NOT VERIFIED — EXTERNAL SERVICE | `npm run ai:check` fails: Ollama `ECONNREFUSED 127.0.0.1:11434` | Local model server not running in this environment. The app's contract is honest: `StubProvider` **throws** instead of faking output, and `ai-interpret.ts` collapses every failure to `AI_UNAVAILABLE / AI_TIMEOUT / AI_INVALID_RESPONSE` with the deterministic engine as authority. |
| HF-L02 | NOT VERIFIED — EXTERNAL SERVICE | Supabase host is a placeholder (`db..supabase.co`, ENOTFOUND) | Auth, RLS, data, sync and Realtime cannot run end-to-end here. All reachable error paths were verified graceful (see matrix). RLS/scoping reviewed statically only. |
| HF-L03 | NOT VERIFIED — BROWSER/HARDWARE | No microphone/camera in the test browser; signalling needs a live DB | Speech recognition, TTS audio output, and a real two-peer WebRTC call cannot be exercised. Static review confirms real `RTCPeerConnection`, `getUserMedia`, offer/answer, trickle ICE, `iceRestart`, and track/connection cleanup; voice en/hi runtime verified through the UI. |
| HF-L04 | COSMETIC | `curl /robots.txt` → 307 → sign-in | No `robots.txt` exists in the project; authoring one would be a new feature, not a repair. |
| HF-L05 | TYPE DEBT | 19 pragmatic `as any` / `: any` sites (mostly error-code enums and DB row shapes) | No observed runtime impact; a mass rewrite has regression risk without an evidenced failure. Left documented. |
| HF-L06 | LOW INFO DISCLOSURE | `GET /api/ai/status` (public by design) reports provider + model names | Intentional per its own docstring; exposes configuration state, not secrets or patient data. |

## Priority summary

- **P0:** none found.
- **P1:** HF-001, HF-004 — both fixed and re-verified.
- **P2:** HF-002, HF-003, HF-006, HF-007 — all fixed.
- **P3:** HF-005, HF-008 — fixed; DV-001..DV-006 fixed and re-verified; HF-L04/L05/L06 documented.
