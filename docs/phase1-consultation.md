# Healthfolio — Phase 1: Real Consultations over Rural Networks

Implementation plan **and as-built record**. Builds on Part 3 (appointments,
secure text) and the Part 1 offline queue. This document describes only what
the code actually does.

## As-built summary

- **Real WebRTC media** — `src/lib/consultation/peer.ts` (perfect
  negotiation with the patient as polite peer, trickle ICE, serialized ops,
  bounded ICE restarts, `getStats()` sampling, sender bitrate caps).
- **Supabase Realtime signalling** — `src/lib/consultation/signalling.ts`
  (broadcast + presence, Zod-validated payloads, version-tagged wire format,
  64-signal outbox, 15s join timeout, session-id binding). Media never rides
  the signalling channel; signalling never carries medical content.
- **Pure state machine** — `src/lib/consultation/state-machine.ts` is the
  single source of truth for UI/connection state (11 statuses, bounded
  reconnection via `MAX_RECONNECT_ATTEMPTS = 5`).
- **Network-aware adaptation** — `network-profile.ts` (Network Information
  API + `onLine` + WebRTC stats → five honest quality bands) and
  `adaptation.ts` (reduce video first, switch to audio only as a last
  resort, exponential backoff with ±10% jitter and a 30s cap).
- **Orchestrator hook** — `use-consultation.ts` wires session fetch, media,
  signalling, peer, adaptation loop, bounded reconnection, metric events and
  diagnostics. All mutable plumbing lives in refs; React state holds only
  what the UI renders.
- **Server APIs** — `GET /api/consultations` (my sessions), `GET
  /api/consultations/[id]` (role + room capability minting), `POST
  /api/consultations/[id]/signal` (audit + closed-vocabulary metrics),
  `GET /api/clinician/care-requests` (clinician queue).
- **UI** — the consultation room (`/consultations/[id]`) rewritten on the
  orchestrator (the previous timer-based fake lobby is gone), a patient
  entry card (`MyConsultations` on `/care-requests`), and a clinician queue
  (`ClinicianQueue` on `/staff`) with take-request / propose-appointment /
  join actions.
- **Telemetry** — new events in `src/lib/metrics/events.ts` + migration
  `028_consultation_telemetry.sql` (written; **not applied** in this
  environment — no database is configured here).
- **Tests** — `consultation-core` (machine, adaptation, backoff, network,
  signalling schema, RTC config, media mapping, diagnostics allowlist),
  `consultation-hook` (real orchestrator: load states + honest join
  failures), `consultation-apis` (auth/ownership/room-capability/audit),
  rewritten `consultation-ui` (queue truthfulness + lobby wiring).

## Honest-scope statement (read first)

1. **Two-party media is real**: browsers exchange offer/answer/ICE over a
   Supabase Realtime channel whose name is a server-minted 128-bit UUID
   capability (`care_appointments.room_id`), issued only to authorized
   participants in a joinable state (`appointment_confirmed` /
   `in_consultation`).
2. **No TURN is claimed or shipped.** The default ICE list is a free public
   STUN server (`stun:stun.cloudflare.com`), overridable via
   `NEXT_PUBLIC_ICE_SERVERS`. On strict NATs where STUN fails, the state
   machine lands in bounded reconnection and then store-and-forward —
   secure text remains fully usable offline.
3. **Placeholder environment ⇒ honest degradation.** When
   `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` are missing or placeholders,
   `getSignallingConfig()` returns null: the UI reports live audio/video as
   unavailable, join fails with a typed `signalling_unavailable` error
   *before* any permission prompt, and text/store-and-forward stays the
   dependable path. Nothing fakes a connection.
4. **This development environment has no database and placeholder Supabase
   credentials**, so the live two-browser path and migration 028 could not
   be exercised here. Coverage comes from unit/integration tests with
   deterministic mocks; the production code path is the real one.

## Connection state machine

```
idle → joining → waiting_for_peer → connecting → connected_video
connected_video ⇄ degraded_video          (adaptation loop)
connected_video/degraded_video ⇄ connected_audio   (manual or forced)
active → reconnecting (bounded: 5 attempts, exponential backoff)
reconnecting → connected_* on success | store_and_forward when exhausted
any active → store_and_forward (text) | ended | error (typed recovery)
```

Invariants (tested): `error` is non-null exactly when `status === "error"`;
events invalid for the current state are ignored (same object returned);
`retryAttempt` grows only through `RECONNECT_TICK` and resets on success,
join, or end — reconnection can never loop forever.

## Degradation ladder

```
video (720p/24fps/900kbps)          ← healthy network
  → video (360p/15fps/400kbps)      ← 3 consecutive weak samples
  → video (240p/10fps/150kbps)      ← 3 more weak samples
  → audio only                       ← 6 poor samples at the lowest level
  → text / store-and-forward         ← network lost or retries exhausted
```

Upgrades require 5 consecutive good samples plus a 15s minimum dwell at the
current level, so quality never flaps. Decisions take the *worse* of the
browser's network hints and real WebRTC `getStats()` RTT/loss.

## Signalling contract

- Events: `ready | offer | answer | ice-candidate | mode | leave`, version
  tagged (`v: 1`), each validated with Zod before touching the peer
  connection. Oversized SDP (>200k chars), unknown roles/modes, or a
  mismatched session id are dropped and counted (`signalling_invalid_payload`).
- The peer session accepts signals only from the single expected peer — a
  third presence entry cannot inject SDP into an established two-party call.
- `mode` signals carry `source: "user" | "recommend"`; recommendations show
  as an accept/dismiss banner, forced switches come only from the other
  participant.

## Security

- `GET /api/consultations/[id]`: 401 without a session; the caller must be
  the patient owner or the assigned clinician (403 otherwise); the room
  capability is minted once and only disclosed in a joinable state; the
  reason snippet is capped at 300 chars; no records, tokens, or SDP ever
  ride this endpoint.
- `POST /api/consultations/[id]/signal`: closed Zod enum of events (400 on
  anything unknown), same participant check, 409 outside joinable states,
  best-effort audit row, metrics from the closed vocabulary only.
- Diagnostics (`src/lib/consultation/diagnostics.ts`): 100-entry ring
  buffer with a per-event data allowlist — SDP and free text are never
  recorded; console output only with `NEXT_PUBLIC_DIAGNOSTICS=1`.

## UI notes

- Permission is requested **only** when the user presses Join (video or
  audio). The room page never prompts on load.
- Every status line comes from `statusMessageKey()` (plain language, no
  jargon), rendered in an `aria-live="polite"` region; quality is shown as
  icon **and** text (never color alone).
- Typed media errors render recovery buttons (`Try again`, `Continue with
  audio`, `Continue by secure text`) — no raw error text reaches the user.
- Store-and-forward state shows the offline card with a "Try live
  connection again" action; secure text composes offline through the Part 1
  queue (`appointment.message`) with truthful delivery states.
- A `Technical details` disclosure shows machine status, mode, video level,
  transport state, counters and the sanitized diagnostics tail.

## Internationalization

All Phase 1 strings live in `src/lib/i18n/part3.ts` (en/hi/or) with the
parity test in `tests/unit/i18n-part3.test.ts` enforcing full key coverage.

## Configuration

See `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — realtime
  signalling (placeholders ⇒ honest text-only mode).
- `NEXT_PUBLIC_ICE_SERVERS` — optional JSON ICE list (STUN/TURN override).
- `NEXT_PUBLIC_DIAGNOSTICS=1` — privacy-safe console diagnostics.

## Test strategy

| File | Proves |
| --- | --- |
| `tests/unit/consultation-core.test.ts` | pure machine/adaptation/backoff/network/signalling/media/diagnostics behavior |
| `tests/unit/consultation-hook.test.tsx` | real orchestrator load states + join failing honestly before any permission prompt |
| `tests/unit/consultation-apis.test.ts` | auth, ownership, room-capability gating, audit + metric vocabulary |
| `tests/unit/consultation-ui.test.tsx` | queue truthfulness, lobby wiring, honest degradation rendering |

## Known limitations

- Supabase Realtime and the migrations (028) require a configured project;
  neither could be applied or exercised in this development environment.
- No TURN server is bundled (zero-cost constraint); symmetric-NAT peers fall
  back to text.
- Baseline `npm run lint` reports pre-existing problems in unrelated files
  (see `npm run lint` output); Phase 1 adds none.
