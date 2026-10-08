# Firebase Migration — P1: Firebase Foundation & Authentication

**Date:** 2026-10-08
**Status:** Design approved (Sections A–E, reviewed interactively)
**Supersedes:** the Better Auth + Supabase-auth hybrid left by commit `720491a`

---

## 1. Background & goal

HealthFolio currently runs two half-migrations:

- **Identity/sessions** already run on Better Auth (`src/lib/auth.ts`, `pg` + `DATABASE_URL`), but Supabase Auth remnants remain: 10 route files still call `supabase.auth.getUser()` on a service-role client (reports, routines, upload-sessions, document confirm — these return a permanent `401`), `api/account/delete` still calls `admin.auth.admin.deleteUser()` / `supabase.auth.signOut()`, `@supabase/ssr` is an unused dependency, and the README still says "Auth: Supabase Auth".
- **Supabase still powers** data access (PostgREST + service-role key, ~60 Postgres tables), file storage (private `documents` bucket, signed URLs), and realtime (WebRTC consultation signalling — the only browser-side Supabase usage).

**Goal:** remove Supabase entirely and consolidate on Firebase.

| Supabase role | Replacement (user-approved) |
|---|---|
| Auth leftovers + identity | **Firebase Auth** |
| Data (Postgres via PostgREST) | **Firestore**, accessed **client-direct with Security Rules** |
| Storage (documents bucket) | **Firebase Cloud Storage** |
| Realtime (call signalling) | **Firebase Realtime Database (RTDB)** |

**Approved decisions (2026-10-08):**

1. Scope: remove Supabase entirely; auth becomes Firebase-based.
2. Data: Firestore with client-direct access + Security Rules (not an API-route engine swap).
3. Storage: Firebase Cloud Storage.
4. Realtime: Firebase RTDB.
5. Existing data: **start fresh** — no Postgres → Firestore data migration; old dev rows are abandonable.
6. Local dev: **real Firebase project from day one**; emulators arrive in P2 (the Firestore emulator — required for rules tests — needs Java 11+).

## 2. Phasing (approved)

Each phase gets its own spec → plan → build cycle and must leave `lint` / `typecheck` / `test` / `build` green.

| Phase | Sub-project | Order rationale |
|---|---|---|
| **P1 (this spec)** | Firebase foundation + Auth | Client-direct Firestore needs `request.auth` for rules; roles must live in Firestore before rules can check them. |
| **P2** | Data → Firestore: collection model + full Security Rules + all page data access; ~54 CRUD routes deleted; server compute (agent/OCR/AI/briefs/medicine) rewired to Firestore Admin SDK; offline-queue dispatch swapped from HTTP to SDK writes | One holistic spec (collections + rules are interdependent); plan chunks it by feature area. Fresh-start data ⇒ no dual-stack data migration. |
| **P3** | Storage → Firebase Cloud Storage (upload flow, preview/download, signed URLs) | Independent of data; between P2/P3 Supabase Storage still serves bytes via the service client. |
| **P4** | Realtime → RTDB (consultation signalling transport) | Small, isolated (one consumer: `src/lib/consultation/signalling.ts`). |
| **P5** | Cleanup: remove `@supabase/*`, `pg`, `better-auth`, `@electric-sql/pglite` + PostgREST shim; 74 routes → ~20 compute-only; integration tests → Firestore emulator; README/docs/env/CSP/service-worker/secrets-scan | All old deps can only die last. |

**Scale note:** P1 is contained (auth surfaces are well-seamed — ~40 files call `getUser()`; we re-implement the seam once). P2 is the majority of the total work.

## 3. P1 scope

**In scope:** Firebase packages/modules/env, CSP, client auth forms, session-cookie model, guard-seam re-implementation, `users/{uid}` profile + roles, Postgres identity bridge, minimal deny-by-default Firestore rules, sign-out UI, account-delete auth swap, auth test rewrites.

**Out of scope (later phases):** Firestore data model & full rules (P2), storage (P3), realtime (P4), removal of `pg`/`@supabase/*` data-layer code, the PG bridge, and transitional dual-writes (P2/P5 as noted below).

## 4. Section A — Foundation

**Packages:** add `firebase` (client) and `firebase-admin` (server). Remove in P1: `better-auth`, `@supabase/ssr`.

**Module layout** (mirrors `src/lib/supabase/*`, one obvious place for call sites):

- `src/lib/firebase/client.ts` — memoized, SSR-safe client app init; exports `auth` (and later `db`, `storage`, `rtdb`).
- `src/lib/firebase/admin.ts` — lazy Admin SDK init (same pattern as `getServerSupabase()`); exports `adminAuth`, `adminDb`.
- `src/lib/firebase/config.ts` — single place that reads/validates env and throws the existing style of "missing env" error.

**Environment variables:**

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | client (public) | web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | client (public) | web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | client (public) | web app config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | client (public) | web app config (used from P3) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | client (public) | web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | client (public) | web app config |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | server only | service-account JSON as one env string (simplest for `.env.local`; no file-path juggling) |

`.env.example` gains the names (no values); README env table updated minimally in P1, fully in P5. Client web-config values are public by design.

**CSP (`next.config.js`):** add `connect-src` for `*.googleapis.com`, `*.firebaseio.com`, `*.firebasedatabase.app`, `securetoken.google.com`, `identitytoolkit.googleapis.com`. Keep the `*.supabase.co` allowances until P5 (data/storage/realtime still use them).

**Service worker (`public/sw.js`):** add Firebase hosts to the never-cache list alongside `supabase`; full cleanup in P5. (The SW already skips cross-origin requests — this is belt-and-braces.)

**Repo-added Firebase config files:** `firebase.json`, `.firebaserc`, `firestore.rules` — rules are **deny-by-default for everything except `users`** (the P1 starter rules in Section D). Deployed to the real project via Firebase CLI once in P1.

**Dev environment:** real Firebase project from day one (fastest first run; password-reset emails really arrive). Emulators (Auth/Firestore/Storage/RTDB, env-gated so production never connects) arrive in P2 together with rules tests; the Firestore emulator requires Java 11+ — install that when P2 starts, not now.

**Implementation-time verification item:** confirm current Firebase session-cookie quotas/limits in official docs during the build (re-exchange flow keeps the active set small; single-user local use is far from any quota).

## 5. Section B — Session model & guard seams

Cookie-based, mirroring today's architecture so guard call sites barely move:

```
Browser                                Next.js server
-------                                --------------
signInWithEmailAndPassword / createUser…
  └─ SDK returns ID token
POST /api/auth/session  ──────────────▶ adminAuth.createSessionCookie(idToken, { expiresIn: 7d })
     (body: idToken)                   └─ Set-Cookie: __session (HttpOnly, Secure, SameSite=Lax, path=/)
onIdTokenChanged (token refresh) ─────▶ debounced re-exchange → cookie always ≤7d old

Every server request:
  src/proxy.ts    ── checks __session cookie PRESENCE only (logic unchanged: PUBLIC_ROUTES,
                     AUTH_PAGES, open-redirect sanitizer; only the cookie name changes)
  route handlers  ── adminAuth.verifySessionCookie(__session) → uid
                     └─ roles from users/{uid} (Admin SDK, 60s in-memory cache)
```

**Guard seams — re-implemented once, return types preserved so call sites don't churn:**

| Seam | Becomes |
|---|---|
| `getSessionUser(headers)` (`src/lib/auth-session.ts:62`) | verify session cookie → build the same `AuthSession` shape (`id`, `email`, `roles`) |
| `getUser()` (`src/lib/auth-helpers.ts:28`) | same return type — ~35 routes compile unchanged |
| `requireSession` / `requireRole` (`src/lib/api/auth-guard.ts`) | same signatures, Firebase-backed |
| `requireArea()` (`src/lib/auth/page-guard.ts`) | reads Firestore roles instead of PG `app_roles` |
| `GET /api/auth/home` (role-based landing) | re-pointed to Firestore roles |
| `GET /api/auth/session-owner` (offline queue) | returns the Firebase uid — queue `ownerId` logic unchanged |
| `src/lib/auth.ts` (Better Auth instance + `databaseHooks` + limits) | **deleted**; role hook-writing moves to Section D; rate limits move to the new auth routes |
| `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts` | **deleted** (replaced by `/api/auth/session`, `/api/auth/sign-out`, `/api/auth/provision`) |

**Key choices (rationale):**

- **Roles in `users/{uid}` doc, not custom claims** — claims need a token refresh before guards/rules see them (stale-role window after promotion); a doc read is immediately consistent. Server-side role reads are cached 60s, so volume is a non-issue.
- **proxy.ts stays presence-only** — firebase-admin can't run in the middleware/edge runtime, and the current proxy also only checks presence; cryptographic verification happens in route handlers. Same security posture as today.
- **New auth routes are rate-limited** with the existing in-memory limiter: `session` (30/60s, same as today's `auth/home`), `sign-out`, `provision`.
- **401 parity:** verification failure → plain JSON 401 with today's shapes, so the ~14 pages with `status === 401 → AUTH_REQUIRED` branches keep working untouched.

## 6. Section C — Client auth UX

**Forms — same pages, same Zod schemas, same friendly error strings; SDK calls swap:**

| Form | New flow |
|---|---|
| `SignInForm` | `signInWithEmailAndPassword()` → map Firebase codes (`auth/invalid-credential`, `auth/wrong-password`, `auth/too-many-requests`, `auth/user-not-found`) to the existing friendly messages → existing `sanitizeRedirect()` + `GET /api/auth/home` role landing (flow unchanged) |
| `RegisterForm` | existing `RegisterSchema` runs client-side first (≥13 y/o, consent literal) → `createUserWithEmailAndPassword()` → `POST /api/auth/session` (get cookie) → `POST /api/auth/provision` (cookie + dob/gender/region — see Section D) → `router.push("/dashboard")` |
| `ForgotPasswordForm` | `sendPasswordResetEmail()` — Firebase's own email templates; no SMTP anywhere (parity with today's zero-email-infra reality) |
| `ResetPasswordForm` | link lands with `?oobCode=` → `verifyPasswordResetCode` (validates + shows target email) → `confirmPasswordReset(newPassword)` (existing password schema) → redirect to sign-in |

**Auth state provider (new):** `FirebaseAuthProvider` mounted in `src/app/providers.tsx` beside the existing `SyncProvider`: `onAuthStateChanged` → `{user, loading}`; `onIdTokenChanged` → debounced session-cookie re-exchange. Replaces better-auth's `useSession` — its only consumer today is `src/components/voice/VoiceAssistant.tsx:188`.

**Sign-out (new UI — none exists today):** minimal email + "Sign out" menu in `TopBar` (currently logo-only) → `signOut()` (client SDK) → `POST /api/auth/sign-out` (server clears the HttpOnly cookie; optionally `revokeRefreshTokens`) → redirect `/sign-in`.

**Deliberately untouched:** the ~14 pages' 401 branches; `SyncStatus` and queue behavior; `proxy.ts` redirect logic (cookie name only); the offline queue's `ownerId` gating (new uid from the re-pointed `session-owner` route); `GET /api/auth/home` contract.

**Auth surfaces deleted by end of P1:** `src/lib/auth.ts`, `src/lib/auth-client.ts`, `api/auth/[...all]`, `better-auth` + `@supabase/ssr` packages, and the **10 route files** with broken `supabase.auth.getUser()` calls (`api/reports/route.ts`, `api/reports/[documentId]/route.ts`, `api/routines/route.ts`, `api/routines/activate/route.ts`, `api/routines/occurrences/[id]/route.ts`, `api/upload-sessions/route.ts`, `api/upload-sessions/page/route.ts`, `api/upload-sessions/page/verify/route.ts`, `api/upload-sessions/finalize/route.ts`, `api/documents/[id]/confirm/route.ts`) re-pointed to the new `getUser()` seam — incidentally fixing their permanent-401 state.

## 7. Section D — Profile, roles model, and the Postgres bridge

**`users/{uid}` document** — top-level collection, doc id = Firebase uid, created by the provision route via Admin SDK:

```
users/{uid}: {
  email, displayName,
  dob, gender, region,          // register schema (kept for P2 rules)
  locale, contact,              // language chooser + settings/profile routes
  consent: {...},               // register consent literal
  roles: ["patient"],           // authoritative identity roles from P1 onward
  status: "active",
  createdAt, updatedAt
}
```

**Two kinds of roles, deliberately split:**

- **Identity roles** — the `app_roles` registry values (`patient`, `doctor_pending`, `doctor`, `facility_admin`, `platform_admin`) live on `users/{uid}.roles` and are read by all guard seams (60s server cache).
- **Data memberships** — `pharmacy_memberships`, `facility_memberships`, `clinician_profiles` remain Postgres *data* until P2; existing routes read them as data, untouched.

**Role write matrix:**

| Change | Path |
|---|---|
| Signup default | provision route writes `roles: ["patient"]` — never client-writable |
| Doctor application | existing `/api/doctor/apply` keeps its session check + PG audit write, **adds** an Admin-SDK append of `doctor_pending` to the roles doc |
| Staff console grant/revoke | existing `/api/staff/admin/roles` switches its write from PG `app_roles` → Firestore roles doc (Admin SDK); UI unchanged |
| Any direct PG `app_roles` reader (known: `src/lib/staff/roles.ts`, `src/lib/auth/admin.ts`; implementation greps for any others) | re-pointed to the `getActiveRoles()` seam |

**Postgres identity bridge (why P1 needs one):** migration `027`'s trigger mirrors `"user"`-table rows into `auth.users` so all ~60 data tables' FKs (`user_id REFERENCES auth.users(id)`) stay satisfied; Better Auth's `databaseHooks` used to create that row and Firebase has no Postgres hook.

- **`POST /api/auth/provision`** (rate-limited, idempotent): verify **session cookie** → upsert `users/{uid}` doc (profile fields) → `pg` `INSERT INTO "user" (id, email, dob, gender, region) … ON CONFLICT DO NOTHING` → trigger mirrors into `auth.users` → every existing PG-backed route keeps working for new Firebase users during the P1 window.
- Flow order (resolves an ambiguity from the interactive review): register → `createUserWithEmailAndPassword` → **session cookie exchange first**, then provision with the cookie (single credential path; no ID-token verification needed on provision).
- Called automatically after every sign-in/register (fire-and-forget, idempotent). **Removable in P2** together with PG data.

**Known wrinkle (accepted):** old PG rows belong to old Better-Auth UUIDs; a new Firebase account gets a fresh uid, so pre-existing dev data reads as empty in P1 — consistent with the fresh-start decision; P2 eliminates PG data entirely.

**Minimal Firestore rules ship in P1** (only the `users` collection): owner read; owner create with `roles == ["patient"]`; owner update of non-`roles` fields; `roles` owner-immutable (Admin SDK bypasses rules for legitimate changes). Everything else **denied by default**. The full rules framework (cross-user workflows, role matrix) is P2's spec.

**Transitional dual-writes (temporary, deleted in P2/P5):** doctor/apply + staff/admin keep writing PG audit rows (`role_policy_events`) *and* the Firestore roles doc while PG data routes still exist.

## 8. Section E — Account deletion, security, verification

**`api/account/delete` (148 lines):** only its auth operations change in P1 — `admin.auth.admin.deleteUser()` → `adminAuth.deleteUser(uid)`; `supabase.auth.signOut()` → session-cookie clear; additionally the `users/{uid}` doc is deleted via Admin SDK (it is P1-only identity state, no data lives in it yet). Soft-delete profile, storage cleanup, and PG cascade are storage/data concerns — untouched until P2/P3. Order: verify cookie → Supabase storage objects (still works) → PG cascade → Firebase user delete → cookie cleared.

**Security posture:**

- `FIREBASE_SERVICE_ACCOUNT_KEY` is server-only; `.env.example` documents the name only; existing `npm run secrets:scan` continues to cover leaked-key patterns.
- Firebase web config (`NEXT_PUBLIC_FIREBASE_*`) is public by design — safe **because P1 ships deny-by-default rules** (only `users` has any allow rule; the rest of the project is empty anyway).
- No email verification — parity with today's Better Auth config (register → immediate access); later a one-toggle change in the Firebase console.
- Rate limiting (existing `rate-limit.ts`) on `session`, `sign-out`, `provision`.
- Error/401 response parity with current shapes (Section B).

**Testing & definition of done:**

- Rewrite `tests/unit/auth-better-auth.test.ts` → Firebase equivalents: guard matrix, redirect sanitizer, Zod schemas (imports change, assertions survive), rate limiter.
- Update `tests/unit/proxy-pwa-assets.test.ts` for the `__session` cookie name.
- New unit tests: provision idempotency (mock `pg` + Admin SDK), form error mapping (Firebase code → message), auth provider (existing RTL patterns).
- Integration/PGlite harness untouched (data routes unchanged in P1). E2E: one Playwright smoke — sign in → dashboard → sign out (real project).
- `npm run lint && npm run typecheck && npm run test && npm run build` all green.
- Manual smoke: register → dashboard; sign-out → sign-in; password-reset email arrives and completes; **reports/routines/upload-sessions return data instead of their current permanent 401**; doctor apply still promotes to `doctor_pending`.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Firebase session-cookie quotas (exact numbers to confirm at build time — Section A) | 7d cookie + `onIdTokenChanged` re-exchange keeps a small active set; single-user local usage is far below any quota |
| P1 hybrid window (Firebase identity + Postgres data) confusing | Every transitional seam is labeled in-code as `// P1-TEMP` and enumerated here; P2/P5 removal list is explicit |
| New Firebase uid orphans old dev rows | Accepted (fresh-start decision); documented in Section D |
| Firestore rules deployed to real project by mistake | Rules file ships deny-by-default; P2 expands it; emulator testing gates rule changes from P2 onward |
| Password-reset email deliverability (Firebase default templates) | Out of the box on the Spark plan; tested in P1 manual smoke |

## 10. Key file references

- Current Better Auth core: `src/lib/auth.ts`, `src/lib/auth-session.ts`, `src/lib/auth-helpers.ts`, `src/lib/api/auth-guard.ts`, `src/lib/auth/page-guard.ts`, `src/proxy.ts`
- New seam targets: `src/lib/auth-types.ts` (shape), `src/app/api/auth/home/route.ts`, `src/app/api/auth/session-owner/route.ts`
- Broken-by-legacy call sites (10 files): listed in Section C
- Account delete: `src/app/api/account/delete/route.ts`
- Auth forms: `src/app/(auth)/sign-in/SignInForm.tsx`, `register/RegisterForm.tsx`, `forgot-password/ForgotPasswordForm.tsx`, `reset-password/ResetPasswordForm.tsx`
- Role sources being replaced: PG `app_roles` (migration `027`), `src/lib/staff/roles.ts`, `src/lib/auth/admin.ts`
- Tests: `tests/unit/auth-better-auth.test.ts`, `tests/unit/proxy-pwa-assets.test.ts`
- Config: `next.config.js` (CSP), `public/sw.js`, `.env.example`, `README.md` (env table ~L290-302, stale "Auth: Supabase Auth" at ~L183)
