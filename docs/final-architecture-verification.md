# Healthfolio — Final Architecture Verification

Audit date: 2026-10-05 · Branch: `security/next-and-staff-hardening`
This document describes what is **actually implemented**, verified by reading the source and exercising
the running build. Nothing below is planned-but-absent; where a capability could not be run in this
environment it is stated explicitly.

## 1. Runtime and entry points

- **Framework:** Next.js 16 App Router, TypeScript, Tailwind. Production build via `npm run build`
  (`next build`), served by `next start`; verifiers: `lint`, `typecheck`, `test` (Vitest),
  `test:e2e` (Playwright), `secrets:scan`, `ai:check`, `db:verify`.
- **Root composition:** `src/app/layout.tsx` (metadata + manifest link) → `src/app/providers.tsx`
  (i18n, sync, PWA registration) → route groups.
- **Route groups:**
  - `(marketing)` — public landing, clean header/footer.
  - `(auth)` — `sign-in`, `register`, `forgot-password`, `reset-password`; each is a thin server page
    (owns `metadata`) rendering a client form component.
  - `(app)` — the authenticated product (dashboard, records, medicines, health card, doctor, staff,
    reliability, admin, timeline, voice on dashboard).
  - `src/app/offline/page.tsx` — public offline fallback.
- **Gate:** `src/proxy.ts` (Next 16 route proxy) checks session-cookie presence only. It is a coarse
  outer gate; real authorization is server-side per page/route. Static assets (`sw.js`,
  `manifest.webmanifest`, icons, branding) bypass the gate — gating them previously broke the offline
  layer (HF-004). `/api/*` is never redirected, so API clients always receive JSON.

## 2. Identity, data access and authorization

- **Sessions:** Better Auth owns authentication; session lives in HTTP-only cookies; user ids are UUIDs
  so they match medical-table `user_id` foreign keys (`src/lib/auth.ts`, `src/lib/auth-session.ts`).
- **The browser never talks to the database directly.** Client code calls internal `/api/*` routes;
  Supabase is reached only from server code.
- **Data access:** `src/lib/supabase/user-context.ts` opens the connection with the **service-role key**
  (server-only, RLS bypassed) and provides **no scoping helpers** — each call site must add the
  session-derived owner filter. The generic gateway `src/app/api/user-data/[table]/route.ts` enforces
  this structurally: allow-listed tables, `user_id` forced from the session on `GET`/`POST`/`PATCH`/
  `DELETE`, `user_id` unreassignable, client-supplied `user_id` ignored, rate-limited per user.
- **Role gates:** patient / clinician / pharmacy / care-hub / admin are resolved server-side
  (`src/lib/auth/roles`, `src/lib/staff/roles`, `src/lib/pharmacy/roles`); pharmacy mutations verify
  membership server-side; clinician queues are scoped through the session's own profile id.
- **Migrations:** 30 ordered SQL migrations in `supabase/migrations/` (schema, storage, audit/constraints,
  indexes, RPCs, RLS-related policies, up to `030_voice_telemetry.sql`).

## 3. Voice assistant (7 layers)

`src/lib/voice/` + `src/components/voice/`, mounted on the dashboard:

| Layer | File | Role |
|---|---|---|
| Intent vocabulary (closed) | `intents.ts` | Enumerable intents + risk classes; no free-form actions |
| Understanding | `understanding.ts` | Text/number/language parsing incl. Odia/Hindi tokens |
| Router | `router.ts` | Pure mapping intent → existing app action; auth-gated intents refused signed out; **no voice backdoor** — every plan runs through the same server routes |
| Conversation | `conversation.ts` | State machine, confirmations, no persistence of transcripts |
| Responses | `responses.ts` | Deterministic, non-diagnostic reply assembly |
| Speech | `speech.ts` | `SpeechRecognition` / `SpeechSynthesis` with explicit availability detection |
| Telemetry | `telemetry.ts` | Fire-and-forget, closed event vocabulary, no transcript content |

i18n for en/hi/or lives in `src/lib/i18n/voice.ts`. Verified at runtime: greeting, `help`, intent
refusal while signed out, language switch, Hindi responses. Microphone and audible TTS were not
exercisable here (HF-L03).

## 4. Clinical safety (AI is never the authority)

- `src/lib/triage/ai-interpret.ts` is the only LLM touchpoint for symptoms: bounded deadline
  (8 s), strict output validation, unknown concepts dropped, and a **never-throwing** failure
  contract (`AI_UNAVAILABLE` / `AI_TIMEOUT` / `AI_INVALID_RESPONSE`). Raw symptom text is truncated
  and never logged.
- `src/lib/triage/` (`concepts.ts`, `normalizer.ts`, `red-flags.ts`, `interpretation.ts`, `packet.ts`)
  holds the deterministic layer that decides urgency; emergency rules win unconditionally.
- AI providers (`src/lib/ai/provider.ts`): Ollama / OpenAI / `StubProvider`. The stub **throws** a
  configuration error — it never fabricates clinical output.

## 5. Consultation, connectivity and offline

- **WebRTC:** `src/lib/consultation/peer.ts` uses a real `RTCPeerConnection` with `getUserMedia`,
  SDP offer/answer, trickle ICE, `ontrack` remote media, `iceRestart` on disconnect, bounded
  reconnection backoff, and explicit teardown (`stop()` closes the connection and stops tracks).
  `media.ts` degrades video→audio-only when capture fails; `adaptation.ts` maps connection quality to
  the media profile. Signalling is Supabase Realtime broadcast/presence in `signalling.ts` with
  subscribe/unsubscribe and channel removal. **Not executed here** (needs live DB + peers + camera).
- **Offline queue:** `src/lib/offline/` — IndexedDB-backed durable store (`storage.ts`), retry/backoff
  and server-side idempotency keys (`sync-engine.ts`), auth-scoped ownership so queued items can never
  sync under a different account (`ownership.ts`), orchestration in `sync-provider.tsx`.
- **Offline Health Card:** `src/lib/health-card/` — AES-GCM-256 with a **non-extractable** Web Crypto
  key held in a separate IndexedDB store from the ciphertext, fresh 96-bit IV per encryption, and
  **fail-closed** behaviour (no key ⇒ no read/write). The module documents its real limit: a
  malicious same-origin script could read the key while the page is open.
- **Service worker:** `public/sw.js` — precaches the offline page, manifest and logo; network-first
  navigations with the offline page as fallback; **never caches `/api/*` or Supabase traffic** so a
  shared device cannot leak one patient's data to the next.

## 6. Pharmacy, metrics, operations

- **Pharmacy:** `src/lib/pharmacy/` — deterministic, server-authoritative freshness policy
  (`freshness.ts`: fresh/aging/stale/expired/`no_update`), membership-scoped stock mutation with
  idempotency, and patient-facing responses limited to medicine label/strength/form/status — never
  patient identity. Availability is freshness-stamped, **not** a live push channel; `/api/*` reads
  refresh on demand rather than streaming.
- **Metrics:** `src/lib/metrics/` — closed event vocabulary (`events.ts`) with strict metadata schemas
  and a server-side ingest service; voice events share the same closed vocabulary.
- **Operations/reliability:** `(app)/reliability`, `(app)/staff`, `(app)/admin/*` expose queue/status
  views; e2e asserts they never show fabricated impact numbers.

## 7. Known architectural risks (unchanged by this audit)

1. **Service-role data access** concentrates correctness in per-call-site owner filters. The generic
   `user-data` gateway enforces it structurally, but new bespoke routes must be reviewed for the
   `.eq("user_id", …)` invariant (now stated in the module docstring — HF-008).
2. **RLS no longer protects browser traffic** (browsers don't connect directly); it remains as
   defence-in-depth for any future direct access path.
3. **No live verification possible** for DB-backed and media-backed paths in this environment
   (see `docs/final-verification-matrix.md` and HF-L01–L03).
