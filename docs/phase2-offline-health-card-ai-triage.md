# Healthfolio — Phase 2: Offline Health Card and Low-Bandwidth AI Symptom Interpretation

## 1. As-built summary

Phase 2 adds two patient-facing capabilities on top of the existing Part 1/2
offline + triage foundation:

| Capability | What ships | Entry point |
| --- | --- | --- |
| **Offline Health Card** | Encrypted local snapshot of essential health facts (profile, medicines, allergies, conditions, recent care), stale indicator, explicit facts editor, clear-local | `/health-card`, dashboard card "My health" |
| **Guided symptom checker** | One-question-per-screen flow with voice input, optional AI language understanding, bounded clarifications, deterministic triage, consent handoff into the existing care-request queue | `/symptoms`, dashboard card "Check my symptoms" |

Both are fully trilingual (en/hi/or via `src/lib/i18n/phase2.ts`) and work
without a network connection. The AI layer is **optional**: every AI failure
degrades visibly and honestly to the deterministic path.

Key modules:

```
src/lib/health-card/model.ts        typed card schema, freshness, parsing
src/lib/health-card/crypto.ts       AES-GCM-256 per-device key (Web Crypto)
src/lib/health-card/storage.ts      encrypted snapshot store (IDB / memory)
src/lib/health-card/use-health-card.ts   local-first hook (open ⇒ no API wait)
src/app/api/health-card/route.ts    GET/PATCH (session-scoped, service-role)
supabase/migrations/029_health_card_facts.sql   facts table (NOT applied here)
src/lib/triage/interpretation.ts    Layer 1 sanitize/merge + Layer 2 decision
src/lib/triage/ai-interpret.ts      bounded AI wrapper (never throws)
src/app/api/triage/interpret/route.ts           interpretation endpoint
src/components/care/SymptomChecker.tsx          guided flow + consent sheet
src/app/(app)/health-card/page.tsx              health card UI
src/app/(app)/symptoms/page.tsx                 symptom checker page
```

## 2. Honest-scope statement (read first)

- This is a **symptom organizer and routing aid**, never a diagnosis, never a
  treatment or prescription, and never a health claim. Urgency comes from the
  deterministic red-flag engine (Part 2, `red-flags.ts`) only.
- **Migration 029 is written but NOT applied** in this environment (no
  database / placeholder Supabase env). Until applied, GET returns empty
  facts ("not recorded") and PATCH returns a structured
  `CONFIGURATION_ERROR` (503) instead of pretending to save.
- **No live Ollama call is exercised in tests** — the provider is mocked.
  The production path (`getAIProvider().callStructuredChat`) stays real and
  unmodified.
- **No live Realtime/E2E run** was possible (no DB, no listening servers);
  Playwright E2E was not executed for this phase. Coverage is unit/integration
  with deterministic mocks.
- Local encryption has a real limitation (see §9 and §12): it protects against
  casual access, backups and cross-origin attackers, **not** against malicious
  same-origin JavaScript (XSS) while the page is open.

## 3. Two-layer safety architecture

```
 patient words / buttons
        │
        ▼
 ┌── LAYER 1 (optional, may be absent) ──────────────────────────────┐
 │ POST /api/triage/interpret → strict ModelInterpretationSchema     │
 │ sanitizeInterpretation(): unknown concept/follow-up ids DROPPED   │
 │ bounded deadline 8 s; failures: AI_UNAVAILABLE / AI_TIMEOUT /     │
 │ AI_INVALID_RESPONSE — the client ALWAYS continues                 │
 └───────────────────────────────────────────────────────────────────┘
        │ sanitized concepts only
        ▼
 mergeSymptomConcepts(): deterministic normalizer ALWAYS runs
   (AI can ADD concepts, never REMOVE; nothing understood ⇒ uncertain)
        │
        ▼
 ┌── LAYER 2 (deterministic, offline, authoritative) ────────────────┐
 │ evaluateTriage() → buildTriageDecision()                          │
 │ precedence: engine emergency → engine urgent →                    │
 │             (not understood ⇒ uncertain) → routine                │
 │ the AI layer is never an input to this decision                   │
 └───────────────────────────────────────────────────────────────────┘
```

- **Mandatory red-flag override** (tested): an AI that "understands" only a
  benign-looking fever can never downgrade an engine emergency (e.g. fainting
  ⇒ `EM-03`) or an engine urgent result.
- "Uncertain" only ever softens a *routine* outcome; it can never downgrade
  emergency/urgent, and routine is phrased as routing, never reassurance.
- Duration maps onto exactly ONE reviewed rule: ≥3 days ⇒
  `fever_three_days_or_more` ⇒ `UR-03`. Explicit clarification answers always
  override duration-derived hints.

## 4. Offline Health Card

- **Card contents only** (never raw rows): name + preferred language,
  explicitly recorded allergies/conditions, active medicines, recent care
  summary (≤5 items, ≤160-char snippets). Full medical documents are **not**
  cached; the UI says so explicitly ("open Records when online").
- **Local-first open**: `useHealthCard` loads and decrypts the local snapshot
  before any network request — opening the card never waits on (or requires)
  the API. Background refresh runs only when a session **and** connection
  exist, with the same triggers as the Part 1 sync engine (online event,
  visibility, reconnect).
- **Honest freshness**: content older than 24 h shows "Some information may
  have changed…" — labeled, never blocked, never presented as current. A
  failed refresh keeps the saved copy visible with "Could not update right
  now — showing your saved copy."
- **Owner binding**: snapshots are bound to the Better Auth session user id
  (same binding the offline queue uses); another account on the same device
  gets `null`, never someone else's card.
- **Clear local**: one explicit confirmation removes ciphertext **and** key
  material from this device only; health-space records are untouched.
- **Facts editor**: `PATCH /api/health-card` with the shared
  `HealthCardFactsSchema` (trim, ≤120 chars, ≤50 items). Offline saves are
  refused honestly ("Saving needs a connection") — nothing fakes a save.

## 5. AI interpretation (low-bandwidth, bounded, optional)

- `src/lib/triage/ai-interpret.ts` wraps the existing provider abstraction
  (`getAIProvider().callStructuredChat`) with:
  - a **hard 8 s deadline** (vs. the provider's 120 s default) — the guided
    flow degrades quickly instead of hanging;
  - a **never-throw** contract: every problem collapses to
    `AI_UNAVAILABLE | AI_TIMEOUT | AI_INVALID_RESPONSE`;
  - a prompt that lists only the 11 canonical concept ids and 8 follow-up
    ids, explicitly forbids diagnosis/medicines/treatment, treats the
    patient's words as untrusted data, and sends **≤500 characters**;
  - **no logging** of raw symptom text anywhere (the route emits no console
    output at all).
- `POST /api/triage/interpret` (auth required):
  - 200 ⇒ `{ concepts, uncertain, duration, severity, suggestedFollowUpId,
    droppedConcepts, droppedFollowUp }` — merged with the deterministic
    normalizer server-side as well;
  - 401 `AUTH_REQUIRED`, 400 `INVALID_REQUEST`;
  - 503 `AI_UNAVAILABLE`, 504 `AI_TIMEOUT`, 502 `AI_INVALID_RESPONSE` —
    structured codes the client tolerates by falling back to guided mode.
- The response never contains urgency, diagnosis, or advice — triage stays
  with Layer 2 in the client.

## 6. Guided symptom checker (state machine)

```
intro → feeling → describe → duration → severity → interpreting
      → clarify (≤3 questions) → result → care_routing (consent sheet)
   feeling/describe/duration/severity/clarify ──engine says EMERGENCY──►
                                                    result (escalation)
```

- **One question per screen**, large ≥56 px tap targets, progress bar,
  `scStep` "Question x of y".
- **Feeling**: all 11 broad concepts as big buttons + "Other / type it";
  Continue locked until at least one symptom is chosen (or Other).
- **Describe** (optional): textarea (500-char cap) + **voice input with a
  mandatory confirmation step** — the transcript always appears as
  "You said:" with Correct / Try again / Cancel **before** anything is
  interpreted. Unsupported browsers get an honest notice and typing works.
- **Duration / severity**: one tap selects and advances; "Not sure" is an
  explicit answer.
- **Interpreting**: only runs when there is text *and* a connection; any
  failure shows a visible notice (`scAiUnavailable` / `scAiUnavailableOffline`
  + `scFallbackHint`) and the flow continues deterministically. Offline runs
  "guided symptom selection" mode from the start (`scOfflineMode`).
- **Clarify**: bounded to **≤3** questions drawn from
  `suggestedFollowUps()` plus the sanitized AI suggestion; Yes / No / Not
  sure (Not sure records nothing).
- **Red-flag override**: the engine is evaluated after feeling selection,
  after interpretation, and after every clarification answer. An engine
  **emergency stops collection immediately** — the escalation screen shows
  the emergency message + "Listen" (SpeechSynthesis) + Start again, and
  **no talk-to-doctor/appointment CTA**.
- **Result**: urgency badge, next action, the safety message for the
  decision (`safeEmergency|safeUrgent|safeRoutine|safeUncertain`),
  "What we understood", the standing disclaimer, Listen (speech, text always
  visible), Talk to a doctor (non-emergency only), Start again.

## 7. Consent-preserving doctor handoff

- "Talk to a doctor" opens a consent sheet (`share*` keys): symptom summary
  always included; **current medicines** and **allergies** from the local
  health card are opt-in checkboxes with a preview; when no card exists the
  sheet says only the symptom summary will be shared (`shareNoCard`).
- Confirm builds a `PacketSchema`-validated `CareRequestPacket` (same schema
  as the Part 2 wizard) and enqueues it through the **existing**
  `enqueueCareRequestPacket` queue — idempotent by `packet_id`, no new
  records, no new appointment architecture. The UI then routes to the
  existing `/care-requests` history.
- Urgent results require the emergency-guidance acknowledgement checkbox
  before Share unlocks (`PacketSchema.superRefine` enforces the same rule
  server-side). Emergency results never reach the consent sheet at all.
- The summary line is generated from confirmed fields only, in the packet
  language, ≤500 chars — never a server diagnosis.

## 8. Internationalization (en / hi / or)

- `src/lib/i18n/phase2.ts` — `Phase2Dict` interface + three dictionaries +
  `tPhase2(lang, key, vars)` with `{var}` interpolation and English fallback,
  same pattern as part2/part3/part4.
- Covers entry cards, health-card UI + relative-time strings, the whole
  symptom flow, clarification questions, urgency/next-action/safety messages,
  disclaimer, and the consent sheet (~130 keys).
- Parity verified by `tests/unit/i18n-phase2.test.ts`: all keys present and
  non-empty in all three languages, interpolation works, **no** medicine/
  dosage wording, **no** "you are safe / nothing serious" claims, **no**
  invented phone numbers in safety copy, and the disclaimer explicitly says
  it does not diagnose in every language.
- Safety copy is i18n keys from the decision (`safetyMessageKey`), so the
  engine never emits free-form prose in one language only.

## 9. Browser limitations (honest)

- **IndexedDB + Web Crypto are required** for the encrypted local card. In
  SSR (no IndexedDB) the storage driver falls back to memory; without
  `crypto.subtle`, `save()` returns `false` and **refuses to store plaintext**
  — the card then honestly shows "no saved copy" instead of faking one.
- **Voice input** (`SpeechRecognition` / `webkitSpeechRecognition`) is not
  available in every browser (notably Firefox): the checker shows
  `scVoiceUnsupported` and typed input is always available.
- **Speech output** (`speechSynthesis`) is best-effort: if unavailable, the
  critical message stays fully visible as text — audio never replaces text.
- **Encryption limitation (stated, not hidden):** the AES-GCM key is
  non-extractable and stored separately from the ciphertext, which protects
  against casual file/backup access and cross-origin attackers. It does
  **not** protect against malicious same-origin script (XSS) while the page
  is open — a successful XSS could read the key from memory. Web Crypto
  offers no stronger guarantee in a browser context.
- The interpret API needs a connection; the rest of the checker (buttons,
  duration/severity, clarifications, triage, escalation, queueing) is fully
  offline.
- Full-document caching is deliberately out of the model (see §4).

## 10. Zero-cost operation

- **No paid services are used or required.** Language understanding runs on
  the existing local **Ollama** provider (`AI_PROVIDER=ollama`,
  `OLLAMA_TEXT_MODEL`, default `qwen2.5:3b`) — free, offline, on-device.
- If Ollama is absent, the product loses nothing functional: the deterministic
  normalizer + engine handle the same inputs, and the UI says so honestly.
- Storage is the user's own browser (IndexedDB) — no cloud sync tier, no
  third-party analytics, no external speech APIs (browser-native only).
- The health-card API uses the already-provisioned Supabase project; the new
  table (migration 029) adds no external dependency.

## 11. Security & privacy

- Both routes require a Better Auth session (401 `AUTH_REQUIRED`
  otherwise).
- **Ownership is never client-selectable**: every health-card query is
  `.eq("user_id", session user)`; a `user_id`/`id` in the PATCH body is
  ignored (Zod strips it). Cross-user rows are invisible (tested).
- RLS stays enabled with **no client policies** (default deny) on migration
  029 — only the service-role API layer reads/writes, same model as
  migrations 026/027.
- Symptom text is length-capped (500), used only for interpretation, and
  never logged — the interpret route contains no console output; a test
  asserts a unique marker string never reaches the console on success *or*
  failure paths.
- Errors are machine-readable codes through `formatErrorResponse`
  (`AI_UNAVAILABLE` added to the `ErrorCode` union), never stack traces or
  raw database messages.
- The card snapshot binds to the session owner (see §4); clearing removes
  both ciphertext and key material.

## 12. Testing (as built)

Full suite after Phase 2: **60 files / 1076 tests passed** (Phase 1 ended at
54 files / 985). New Phase 2 coverage (91 tests):

| File | Tests | Proves |
| --- | --- | --- |
| `tests/unit/phase2-interpret-ai.test.ts` | 20 | wrapper never throws; unconfigured/timeout/bad-JSON classified; 8 s deadline enforced with fake timers; prompt forbids diagnosis + closed vocabularies + ≤500-char truncation; route 401/400/503/504/502; merged concepts; uncertain; **no symptom text in console** |
| `tests/unit/phase2-interpretation.test.ts` | 23 | strict sanitize (unknown ids dropped, strict schema rejects); AI add-never-remove; duration→UR-03 only; explicit wins; decision precedence; **mandatory red-flag override (emergency + urgent)**; no diagnosis fields; multilingual (en/hi/romanized/or/mixed) |
| `tests/unit/phase2-health-card.test.ts` | 17 | AES-GCM roundtrip, fresh IVs, wrong key/tamper reject; ciphertext-only storage; owner isolation; schema-version drop; clear; **no Web Crypto ⇒ refuses to save**; freshness; hook opens offline with **zero fetches**, refresh failure keeps copy, stale labeled |
| `tests/unit/phase2-health-card-api.test.ts` | 10 | GET/PATCH 401; cross-user rows invisible; missing-migration GET degrades; card-schema-only response; PATCH 400s; PATCH 503 `CONFIGURATION_ERROR`; body `user_id` ignored (writes always session user) |
| `tests/unit/phase2-symptom-ui.test.tsx` | 11 | intro/disclaimer/offline notice; disabled Continue; **emergency stops collection, no care CTA**; mid-flow EM-02 escalation; routine handoff enqueues schema-valid packet; urgent ack gate; ≤3 clarifications; AI 503/504/network failure fallback; offline guided mode; voice unsupported notice |
| `tests/unit/i18n-phase2.test.ts` | 10 | en/hi/or parity + interpolation + safety-wording bans |

Gates (Phase 2 final): `tsc --noEmit` ✅ · `npm test` 1076 ✅ ·
`npm run lint` 36 problems (baseline: 25 errors / 11 warnings — no new) ✅ ·
`npm run build` ✅ (see §13 report).

## 13. Configuration

```bash
# .env.local — AI layer (optional; everything works without it)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TEXT_MODEL=qwen2.5:3b
AI_REQUEST_TIMEOUT_MS=120000   # provider default; symptom interpret caps at 8 s
```

No new environment variables are introduced by Phase 2. The health-card API
uses the existing Supabase service-role configuration.

## 14. Known limitations (honest)

1. **Migrations 028 (Phase 1) and 029 (Phase 2) are not applied** in this
   environment — no database is reachable. Effects are bounded and tested:
   facts GET ⇒ empty ("not recorded"), facts PATCH ⇒ 503
   `CONFIGURATION_ERROR`.
2. **No live Ollama / no E2E run here**: AI and route behavior are covered
   with deterministic mocks; the production provider path is untouched.
3. **Same-origin XSS can read the local key** (stated in §9) — browser
   platform limit, not hidden.
4. **Speech recognition depends on the browser** (Chromium-family mainly);
   typed input is the universal path.
5. **Severity/duration beyond the reviewed rules do not change urgency** —
   by design the engine only reasons over reviewed rules; severity is
   carried for the doctor summary, not for routing.
6. **No push/SMS emergency dialing**: the emergency screen intentionally
   never invents a phone number or claims a service exists; it instructs the
   patient to seek local emergency help.
7. **Single-device card**: the snapshot is per-device (by design — it is the
   offline copy); it is not a cross-device sync of health facts.
8. **Baseline lint debt**: 36 pre-existing problems (25 errors) in unrelated
   files remain the accepted baseline; Phase 2 adds zero new ones.
