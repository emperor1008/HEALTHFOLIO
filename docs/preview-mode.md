# Temporary preview mode + database-backed authentication

> Status: development / preview aid. **Off by default.** Disabling it restores
> normal authentication with no code changes.

This document describes the temporary setup that lets a developer open,
navigate and test every existing application page without being blocked by an
external authentication provider, an unavailable database host, or login
redirects.

---

## 1. What changed, in one page

| Concern           | Before                                              | After                                                                                                              |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Identity provider | Supabase Auth remnants (GoTrue) + Firebase          | Database-backed accounts/sessions (`auth_accounts`, `auth_sessions`, migration 032), with Firebase still supported |
| Session           | `__session` cookie verified by an identity provider | Same `__session` cookie: an opaque random token, stored only as SHA-256, HttpOnly + SameSite=Lax                   |
| Passwords         | external                                            | scrypt (N=16384, r=8, p=1, 16-byte salt, 64-byte key)                                                              |
| Database          | placeholder Supabase host (`db..supabase.co`)       | local PostgreSQL (PGlite) with the repository's real migrations, when no valid remote database is configured       |
| Signing in        | required for every page                             | optional, only when preview mode is valid                                                                          |
| Data for preview  | none                                                | idempotent synthetic seed owned by one reserved demo user                                                          |

Nothing was redesigned: the same routes, layouts, components, guards and
validation code run in preview mode. The only difference is _who the session
resolver says you are_ and _which database the data layer talks to_.

---

## 2. Preview mode

### 2.1 The gate

`src/lib/preview/gate.ts` is the single decision point (a pure function, so
the truth table is unit-tested). It is evaluated in exactly two places:

- `src/proxy.ts` — decides whether a page request needs a session cookie;
- `getSessionUser()` — decides whether a request _is_ the reserved demo user.

Every page guard, layout and API route inherits the result through those two
seams. **There is no per-page bypass code.**

Inputs (all server-side):

| Variable            | Meaning                                                    | Default                |
| ------------------- | ---------------------------------------------------------- | ---------------------- |
| `HF_DEMO_MODE`      | master switch                                              | **`false` (disabled)** |
| `HF_DEPLOYMENT_ENV` | `preview` marks a non-production preview deployment        | empty                  |
| `HF_PREVIEW_HOSTS`  | exact comma-separated preview hostnames (server allowlist) | empty                  |
| `HF_DEMO_ROLES`     | roles the demo identity may hold                           | `patient`              |
| `HF_LOCAL_DB_DIR`   | local database directory                                   | `.data/healthfolio`    |

`HF_DEMO_MODE` is never read from a `NEXT_PUBLIC_*` variable — a browser-set
flag can never open the door.

Enable conditions:

- **Local development**: `HF_DEMO_MODE=true` **and** `NODE_ENV=development`
  **and** the request `Host` is a recognized local hostname
  (`localhost`, `127.0.0.1`, `::1`, `*.localhost`, `*.local`).
- **Hosted preview**: `HF_DEMO_MODE=true` **and** `HF_DEPLOYMENT_ENV=preview`
  **and** the request `Host` exactly matches an entry in `HF_PREVIEW_HOSTS`.
  An empty or non-matching allowlist **fails closed** — the hostname is never
  guessed. Put the real Freebuff preview hostname in the Freebuff environment
  settings as `HF_PREVIEW_HOSTS`.
- **Anything else** (production, unknown host, missing flag, unrecognized
  flag value): the gate stays closed and normal authentication applies, even
  if `HF_DEMO_MODE=true` was set by accident.

### 2.2 The preview identity

`src/lib/preview/identity.ts` returns one reserved identity through the same
interface the application already uses:

```
id     00000000-0000-4000-8000-00000000de00   (reserved, never a real account)
email  preview.demo@healthfolio.local
name   Preview Demo
roles  from HF_DEMO_ROLES, validated against APP_ROLES
```

- It can only ever see rows it owns: every seeded record is owned by this id,
  and the data layer keeps applying the same `user_id` ownership filters it
  uses for real users.
- It holds no credential, cannot be signed into, and does not exist when the
  gate is closed.
- Administrator/staff consoles stay locked unless `HF_DEMO_ROLES` explicitly
  includes those roles (see §6).

### 2.3 The route directory

`/preview` lists every existing application page, grouped by purpose, plus
the API endpoints. The list is **generated from the repository**, never
hand-written:

```
node scripts/route-inventory.mjs --write
```

which rewrites `src/lib/preview/route-directory.json`. Regenerate it whenever
a route is added or removed.

When preview mode is disabled, `/preview` follows the normal authentication
rules (redirect to `/sign-in`) like every other protected page.

---

## 3. The local / preview database

`src/lib/db/index.ts` picks the database from server configuration only:

1. **local** — preview mode is enabled, **or** no valid remote database is
   configured while `NODE_ENV=development`;
2. **remote** — a real Supabase URL + service-role key (and a real
   `DATABASE_URL`) exist, or this is a production deployment.

The local database is PostgreSQL (PGlite, already a devDependency) running the
repository's **real** migrations from `supabase/migrations`, preceded by a
Supabase-compatibility layer (GoTrue `auth` schema, `storage` schema, API
roles) so the migrations apply unchanged. It is not a mock: constraints,
triggers and RLS policies are the production ones.

- Migrations are tracked in `hf_local_migrations` and applied once, in order.
- Production never silently switches to a local database: `local` requires
  preview mode or `NODE_ENV=development`.
- There is no fallback after a failed query. If a real query fails, the error
  surfaces; the app never swaps databases mid-request.

### Demo data

`src/lib/db/seed.ts` runs only when preview mode is enabled. It is
idempotent (marker row + `ON CONFLICT DO NOTHING`) and every row is:

- owned by the reserved demo user,
- obviously synthetic — every human-visible value starts with `DEMO`, and the
  app renders a **DEMO DATA** banner while preview mode is on.

Seeded: identity + roles, portfolio, two documents, a laboratory report with
three measurements, timeline entries, reminders, a health card, a
prescription + active medication routine, a care request, and the three
consents the dashboard requires.

**Persistence**: the local database lives in `HF_LOCAL_DB_DIR` (gitignored).
On a host with an ephemeral filesystem PGlite falls back to an in-memory
database, so preview data may not survive a restart or redeploy.

---

## 4. Database-backed authentication

`src/lib/auth/db-auth.ts` + migration `032_database_auth.sql`:

| Table               | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `auth_accounts`     | normalized unique email + scrypt hash + roles          |
| `auth_sessions`     | SHA-256 of the opaque cookie token, expiry, revocation |
| `auth_reset_tokens` | single-use, 30-minute recovery tokens (hashed at rest) |

Endpoints:

| Route                     | Behaviour                                                           |
| ------------------------- | ------------------------------------------------------------------- |
| `POST /api/auth/register` | creates the account, returns the session cookie (database provider) |
| `POST /api/auth/sign-in`  | verifies credentials, sets the cookie; generic 401, 10/min per IP   |
| `POST /api/auth/sign-out` | revokes the session row and clears the cookie                       |
| `GET /api/auth/me`        | current session for the browser (server stays authoritative)        |
| `GET /api/auth/home`      | role-based post-login landing (unchanged)                           |

Properties:

- No plaintext passwords, ever; hashes are `scrypt$N$r$p$salt$hash`.
- Session tokens are 32 bytes of CSPRNG entropy; only the SHA-256 is stored.
- Unknown email and wrong password return the **same** 401, and the unknown
  path still runs a scrypt hash so timing does not leak account existence.
- Cookie: HttpOnly, SameSite=Lax, Path=/, Secure in production, 7-day expiry.
- Logout revokes server-side, so a copied cookie dies with it.
- Provider selection: `HF_AUTH_PROVIDER=db|firebase`, defaulting to `database`
  when Firebase is not configured — so a Firebase production deployment keeps
  its existing behaviour unchanged.

Supabase **Auth** call sites (the 12 `supabase.auth.*` uses in reports,
routines, upload sessions, document confirm and account delete) were re-pointed
to the centralized `getUser()` seam. Supabase remains the storage/Realtime
integration it always was.

---

## 5. API endpoints in preview mode

- Requests resolve the demo identity through the shared session helper, so
  protected endpoints work without a login **only** when the gate is valid.
- Every read/write is scoped to `user_id = <demo id>` by the existing query
  filters — preview writes can never reach real rows.
- Unchanged and still enforced: 405 for unsupported methods, 4xx for invalid
  input, 401/403 for non-preview unauthenticated requests, role checks for
  staff/admin operations, and real server failures (no success-shaped
  placeholders).
- Integrations that need an unavailable external service (Ollama, Firebase,
  hosted storage) report their real unavailable/not-configured state instead
  of faking success.

---

## 6. Enabling and disabling

**Enable locally**

```
# .env.local
HF_DEMO_MODE=true
HF_DEMO_ROLES=patient            # add doctor,facility_admin,platform_admin to inspect those consoles
HF_LOCAL_DB_DIR=.data/healthfolio
```

Then open <http://localhost:3000/preview>.

**Enable for a hosted Freebuff preview** — set all three in the Freebuff
environment settings (values are not committed anywhere):

```
HF_DEMO_MODE=true
HF_DEPLOYMENT_ENV=preview
HF_PREVIEW_HOSTS=<exact preview hostname(s), comma separated>
```

`HF_PREVIEW_HOSTS` must be filled with the real preview hostname; the code
deliberately fails closed rather than guessing it.

**Disable** — set `HF_DEMO_MODE=false` (or remove it). Immediately:
the proxy requires a session cookie again, `getSessionUser()` returns the real
session, `/preview` redirects to `/sign-in`, and the demo identity disappears.
No code changes.

---

## 7. Verified / not verified

Verified by the checks run for this change (see the implementation report for
exact commands): typecheck, lint, unit tests, and a browser walk of `/preview`
→ `/dashboard` → records/track/medicines pages rendering seeded data without
a login.

Not verified here (external services are not available in this environment):

- hosted Supabase PostgREST/Storage/Realtime behaviour (the local database
  path is what runs in preview),
- Firebase sign-in (no Firebase credentials configured),
- Ollama-backed AI answers (service unreachable), video/WebRTC consultations,
  realtime pharmacy availability, microphone/TTS,
- email delivery for password recovery — the token flow is implemented, but
  no channel is configured, so the API reports that honestly instead of
  pretending a mail was sent.
