# Healthfolio — Part 1: Offline-First Rural Patient Care Foundation

Implementation plan. Written before structural changes, per the task order.

## What exists today (verified)

- **Next.js 14 App Router + TypeScript + Tailwind + Zod + Vitest/jsdom/RTL** (jsdom configured).
- **Invisible anonymous Supabase session** via middleware + `/auth/bootstrap`; user id is always derived
  server-side via `getUser()` — never from the client. RLS on all user tables.
- **Capture pipeline** (`src/lib/capture`): `validateFile` (extension/size/magic-byte aware), camera scanner,
  page review, quality checks (dimensions/blur/brightness/contrast), signed-URL upload sessions
  (`/api/upload-sessions` with server-side idempotency via `upload_sessions.idempotency_key` unique index).
- **Design system**: warm ivory canvas, deep forest-teal primary, sage surfaces, terracotta for attention;
  `Card`, `Button` (44px min), `Badge`, `EmptyState`, skeletons, `PageTransition` (reduced-motion aware).
- **Existing upload flow is online-only**: `AddRecordButton.handleUpload` fails with `NETWORK_ERROR` and
  discards the pages on network loss. This is the gap Part 1 closes.

## Scope decisions

| Decision | Choice | Reason |
|---|---|---|
| PWA layer | Hand-rolled `manifest.webmanifest` + hand-written `sw.js` (network-first shell, never cache `/api/`) | No new dependency (spec forbids heavy new deps); full control over what is cached; `next-pwa` adds webpack-level coupling and a new dependency for ~150 lines of auditable SW code |
| Queue storage | IndexedDB (raw, no dependency), single object store, DB version migration | Spec requires IndexedDB; a tiny promise wrapper (~60 lines) is auditable |
| Payload encryption | WebCrypto AES-GCM with a per-device random key in IndexedDB (non-extractable key), payload stored as ciphertext | "encrypted where possible": real encryption, no secrets in code, no server dependency |
| i18n | `src/lib/i18n/` dictionaries for `en`, `hi`, `or` + `t(key, lang)` with English fallback | Lightweight dictionary approach required; works fully offline |
| Care requests | New `care_requests` table + RLS + Zod-validated idempotent API | Foundation only — no triage, no classification |
| Queued actions | care-request create/update, language preference, staged photo/file upload | Per spec, Part 1 scope |
| Profile/contact | Settings display-name save goes through the queue too | Safely exists today; minimal change |

## What the service worker caches — and what it never caches

**Cached (app shell, non-sensitive):**
- `/`, `/offline`, `/consent` navigation responses (network-first with cache fallback → `/offline` page)
- build-hashable static assets: `/_next/static/*` (immutable, cache-first), icons, `manifest.webmanifest`
- Manrope font CSS/woff2 from Google Fonts (cache-first, separate versioned cache)

**Never cached, never stored:**
- Everything under `/api/` — hard rule with an early return in the fetch handler. Protected medical API
  responses (records, measurements, signals, evidence, signed upload URLs) are never written to any cache,
  so nothing on a shared device can leak another patient's records. (For the same reason the queue stores
  user data only in the per-device encrypted IndexedDB store, not in any HTTP cache.)
- Non-GET requests. Cross-origin requests. Anything matching a documented deny-list.

**Documented in:** `docs/offline-first-part1.md` (this file) and in-code comments in `public/sw.js`.

## Queued action contract

Each queue item: `id` (UUID), `idempotencyKey` (UUID), `actionType` (`care_request_create` |
`care_request_update` | `language_preference` | `staged_upload` | `profile_update`), `payload`
(AES-GCM ciphertext), `createdAt`, `retryCount`, `state`
(`pending → syncing → synced | failed | requires_attention`), `lastError` (sanitized), `serverRecordId`,
`kind: "json" | "file"`, and `fileName`/`mimeType`/`byteSize` metadata for staged files.

Sync order: strictly by `createdAt` per action ordering dependencies, sequential (concurrency 1 —
"safe small concurrency"), exponential backoff `retryDelayMs(retryCount)` capped at `MAX_RETRY_COUNT = 8`
then `requires_attention`. Items are never auto-deleted. "Remove" needs explicit confirmation in the UI.
Synced items are pruned only after server acknowledgement, by explicit user action or prune on next sync.

## API design

- `POST /api/care-requests` — Zod `careRequestSchema`; user from `getUser()`; idempotency via
  `care_requests.idempotency_key` unique index `(user_id, idempotency_key)`; returns 200 with existing row
  on replay. No `user_id` from body. Same `formatErrorResponse` envelope as other routes; safe messages only.
- `PATCH /api/care-requests/[id]` — ownership-checked draft updates.
- `GET /api/care-requests` — list own requests (Track/records shortcut).
- Language preference: `PATCH /api/profile` (new) updates `profiles.locale` (session user only) —
  the offline queue syncs it idempotently (last-write-wins by newest item wins, replay-safe).
- Staged upload sync: replays the **existing** createUploadSession → uploadPage → finalize pipeline
  using the original stored `Blob`s from IndexedDB, reusing server-side session idempotency.
- Service worker caches `/offline` page for graceful shell fallback.

## Migration 016 (idempotent, follows 015 conventions)

- `care_requests` table: id, user_id (FK cascade), portfolio_id, preferred_language CHECK, reason TEXT,
  reason_length ≤ 1000, preferred_contact_method CHECK, status CHECK (draft/submitted/processing/completed),
  idempotency_key TEXT, created/updated timestamps.
- RLS: SELECT/INSERT/UPDATE/DELETE all `auth.uid() = user_id`.
- Indexes: `(user_id, status, created_at)`, plus unique `(user_id, idempotency_key)` where not null.
- **No changes** to any existing table or policy.

## UI plan

- `SyncStatus` card on Home with truthful states: Synced securely / Saved on this device / Syncing your
  saved items / Some items need attention. `aria-live="polite"` announcements on state change.
- Home keeps its current calm welcome + capture CTAs (online) or explains the offline capture path.
  Offline Home still shows: capture actions (staging works offline), records shortcut, care requests,
  attention items for genuinely failed queue items. Never raw errors.
- Records/capture: on network failure mid-upload, `AddRecordButton` converts to a queued staged upload
  (original blob preserved) with "Saved on this device…" message instead of a dead end. Pre-upload quality
  checks remain advisory and reuse `analyzeImageQuality`.
- New `/care-requests` page: form (language, reason, contact method) → queued when offline, straight API when
  online, with the fixed emergency notice when free text matches emergency terms and the persistent
  "not medical advice" line. Draft saved → clear "Saved on this device / Submitted" state.
- Settings: language selector (English/हिन्दी/ଓଡ଼ିଆ), persists locally + queues a sync.
- First-use language choice: shown on first Home visit (once, per device), large buttons.
- PWA: manifest + service worker registration in the root layout via a small client component.

## Testing plan (mapped to the task's required list)

- `offline-queue.test.ts` — state transitions, idempotency-key generation/dedup, retry/backoff,
  online/offline detection abstraction, reload persistence (fresh `OfflineQueue` against the same store),
  failed items remain queued, not-synced-until-ack, duplicate sync retries do not duplicate
  (idempotency key replay returns same record), no sync after errors.
- `file-validation.test.ts` — accepted/rejected types & size via existing `validateFile`.
- `quality-check.test.ts` — quality-check result handling (existing `getQualityLabel/color` + warnings).
- `i18n.test.ts` — every Part-1 key present in en/hi/or, fallback behavior, no empty strings.
- `care-requests-api.test.ts` — authorization, ownership, validation, idempotency replay, no internals leak.
- `sync-ui.test.tsx` — truthful empty/error states on Home, no raw network/db errors rendered, accessible
  labels, keyboard navigation.
- Existing suites stay green.

## Adversarial review checklist

- Offline before submission → item stays `pending`, visible, syncs on reconnect (tested).
- Network loss mid-upload → converted to staged upload, not lost (code path + test).
- Server timeout → sanitized `lastError`, retry with backoff, then `requires_attention`.
- Browser refresh with pending items → reload persistence test + SyncProvider resumes on focus.
- Multiple manual retries → idempotency keys prevent duplicates (tested).
- Duplicate click → sync engine has a single in-flight loop guard + `uploadStarting` guard.
- Unsupported/oversized file → rejected before queueing (existing `validateFile` reused).
- Missing translation key → falls back to English (tested).
- Shared device → SW never caches `/api/`; IndexedDB per-browser-profile; queue scoped per session user.
- No secrets in tracked files; no fake medical data anywhere in UI.
