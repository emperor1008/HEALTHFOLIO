# Healthfolio — Part 2: Safe Symptom Triage and Offline Care-Request Packets

Implementation plan and as-built record. Builds directly on the completed Part 1
foundation (`docs/offline-first-part1.md`): IndexedDB queue + state machine,
idempotent care-requests API, en/hi/or i18n, PWA shell, SyncStatus UI.

## What exists and is reused (verified)

- **Queue** (`src/lib/offline/`): `sync-engine.ts` (sequential, exponential backoff,
  never-synced-without-server-ack), `state-machine.ts` (pure transitions),
  `storage.ts` (IndexedDB + memory drivers, separate blob store),
  `sync-provider.tsx` (React binding + per-action HTTP handlers sending the
  `Idempotency-Key` header).
- **Server idempotency** (`src/lib/api/idempotency.ts` + `idempotency_keys` table):
  replay-safe POSTs; 23505 concurrency fallback returns the original row.
- **care_requests** table (migration 016): RLS on all operations,
  `(user_id, idempotency_key)` unique constraint.
- **i18n** (`src/lib/i18n`): `Dict` + `translate()` with English fallback,
  `LanguageProvider`; extended with a separate Part 2 dictionary module.
- **Design system**: `Button` (44px targets), `Card`, `PageTransition`
  (reduced-motion aware), calm ivory/forest-teal/sage/terracotta palette.

## Part 2 architecture (as built)

### 1. Triage library — pure, offline, auditable (`src/lib/triage/`)

| Module | Responsibility |
|---|---|
| `concepts.ts` | The **only** allowed broad symptom concepts (`SYMPTOM_CONCEPTS`: chest_discomfort, difficulty_breathing, fever, fainting, severe_bleeding, weakness_one_side, severe_headache, vomiting, pregnancy_concern, injury, abdominal_pain) plus body areas, guided categories, and age groups. Closed sets with `isX()` guards; nothing outside these can be produced or parsed. |
| `normalizer.ts` | Deterministic normalizer: punctuation folding (**preserving `\p{M}` matras — required for Devanagari/Odia**), whitespace squeeze, static typo/romanized-Hindi/Odia token rewrites, and a curated phrase table (English, romanized Hindi, Devanagari, Odia — exact verified translations only). Outputs concepts with per-concept confidence (`high` = multi-word phrase, native-script term, or verbatim user word; `medium` = rewrite-derived). Preserves `originalText` byte-for-byte. Unrecognized text ⇒ `uncertain: true` so the UI asks a neutral clarification instead of guessing. Never emits disease names — the concept list is the hard boundary. |
| `red-flags.ts` | Versioned rules engine: `RULES_VERSION = "2026.09-part2.1"`. 11 emergency rules (EM-01..EM-11) + 9 urgent rules (UR-01..UR-09), each with a stable ID, human description, and clinical-safety source string. Conditions evaluate only guided selection + confirmed concepts + follow-up answers + age group (only where a rule needs it and the user provided it). Any EM hit ⇒ `emergency`, else any UR hit ⇒ `urgent`, else `routine`. Rule evaluation is exception-guarded (a rule bug can never crash intake). Also exports `suggestedFollowUps()` used by the wizard. |
| `packet.ts` | Zod `PacketSchema` — the single contract shared by wizard, queue payload, and API. Rejects: concepts outside the closed set, invented rule IDs (`/^(EM|UR)-\d{2}$/`), oversized summaries, and (via `superRefine`) emergency/urgent packets without `acknowledged_emergency_guidance` or emergency packets with no EM rule. `newPacketSkeleton()` gives every packet a UUID and consistent shape. |

### 2. Data model — migration 017 (additive only)

- `care_requests` gains nullable/default columns: `packet_id` (unique partial
  index), `symptom_text_original`, `symptom_concepts text[]`, `body_area`,
  `symptom_category`, `follow_up_answers jsonb`, `age_group`, `triage_category`
  (CHECK emergency|urgent|routine; comment: routing category, NOT a diagnosis),
  `triage_rules_version`, `triage_rule_ids text[]`,
  `acknowledged_emergency_guidance boolean`, `summary`. Existing columns,
  policies, and indexes untouched; user+triage index added.
- `triage_assessments`: append-only audit (SELECT/INSERT own rows only — no
  UPDATE/DELETE policies), containing **no symptom text and no contact
  details**: rules_version, category, rule_ids, concepts, follow-up answers,
  age group, ack state, timestamps.
- `scripts/db-verify.js` now requires `triage_assessments`.

### 3. API (`/api/care-requests`)

- POST accepts an optional validated `packet`; `reason` comes from
  `packet.summary`. Without a packet, Part 1 behavior is unchanged.
- Server **verifies ownership of every linked document id** before insert and
  returns 403 `LINKED_DOCUMENTS_NOT_OWNED` on any mismatch (never silently
  drops).
- Writes a best-effort `triage_assessments` audit row (audit failure never
  fails the user's saved request).
- Idempotency: replay via `idempotency_keys`, 23505 concurrency fallback,
  response stored after success — duplicate retries produce exactly one row.
- GET lists the session user's rows only (401 otherwise). All errors are
  generic codes; DB internals are never echoed.

### 4. Queue integration

`care_request.create` payload gained an optional `packet` field (additive, so
Part 1 items stay readable). `sync-provider.tsx` sends it in the POST body and
exposes `enqueueCareRequestPacket()`. Failed packets keep all existing truthful
queue semantics: never deleted, retry/backoff, requires-attention states,
"sent" only after server acknowledgement.

### 5. Voice input

Inline in the wizard: uses `window.SpeechRecognition`/`webkitSpeechRecognition`
**only if present**; otherwise shows "voice input is not available on this
device" and the typed field remains fully functional. Transcript is always
shown as editable text for user review before saving. No audio is recorded,
stored, or uploaded.

### 6. UI — wizard under `/care-requests`

The Part 1 form page becomes a hub: menu → 9-step wizard (start, category,
body area, description + voice review, interpretation confirm "We understood
this as: …" with correct/reject chips, follow-ups, urgency result with
mandatory emergency/urgent acknowledgement before Continue unlocks, records
picker listing only user-owned records with name/date, review & save) →
history. History shows only truthful statuses (Saved on this device / Waiting
for connection / Syncing / Sent / Needs attention) from queue + GET API; no
doctor, appointment, or pharmacy claims. Emergency guidance block is
configuration-driven from the i18n dictionary. Progress bar, aria-live urgency
announcement, semantic buttons, focus-visible rings, 44px+ targets.

### 7. Safety boundaries (enforced in code and tests)

- Concept list is a closed enum; the normalizer and the packet schema both
  reject anything outside it; no disease name can be echoed.
- Every urgency screen shows "This tool does not diagnose medical conditions."
  (en/hi/or).
- Emergency outcome overrides urgent/routine; the user may still save the
  request after explicit acknowledgement; the emergency instruction is never
  hidden behind interaction.
- No automatic contacting of anyone; no claims of emergency-service, hospital,
  or clinician integration.
- Raw symptom text, contact details, and health data are never logged; the
  audit row stores only rule IDs/category/version/ack.

## Testing (as built)

- `tests/unit/triage-red-flags.test.ts` (47) — positive + negative case for
  **every** rule; emergency>urgent>routine priority with contradictory inputs;
  patient-visible output carries no diagnosis wording; rule audit
  description/source present; crash safety with hostile inputs.
- `tests/unit/triage-normalizer-packet.test.ts` (24) — typo/romanized/native
  script mapping only to allowed concepts; original text unchanged; uncertain
  ⇒ clarification not guess; packet accepts valid, rejects missing ack,
  invented rule IDs, foreign concepts, bad categories, oversized summaries.
- `tests/unit/i18n-part2.test.ts` (7) — every Part 2 key exists in en/hi/or
  with non-empty values; English fallback; interpolation; emergency guidance
  semantics present in all languages; no diagnosis-like patient-facing wording
  (the `notADiagnosis` disclaimer is the only exemption to the "diagnos"
  pattern, by design).
- `tests/unit/care-requests-packet-api.test.ts` (13) — 401s without session;
  malformed JSON; invented rule ID; emergency without ack; foreign concept;
  linked-document ownership 403 vs owned pass; idempotent replay; 23505
  duplicate returns original row; response stored; 500 leaks nothing.
- `tests/unit/care-wizard-ui.test.tsx` (5) — keyboard focus + progressbar +
  accessible buttons; interpretation chip pre-selected from typo'd input
  ("bukhar"); urgent outcome requires ack before Continue enables; offline
  save enqueues packet, stays `pending`, no `serverRecordId`/`syncedAt`;
  packet text preserved verbatim; persisted item survives provider remount
  (reload simulation).

## Verification commands

```
npm run lint          # passes (pre-existing warnings only)
npm run typecheck     # passes
npm test              # 704/704 pass (608 Part 1 + 96 Part 2)
npm run build         # passes
npm run secrets:scan  # passes
npm run db:verify     # requires a reachable Supabase (see Part 1 doc)
```

## Known limitations (honest)

- Voice input depends on browser speech-to-text availability (Chrome/Edge on
  most platforms; not Firefox/iOS-Safari). The UI states this truthfully and
  typed input always works.
- Odia speech recognition (`or-IN`) is not widely supported in browser engines;
  Odia users may get English/hi recognition results — always reviewable and
  correctable before saving.
- `db:verify` and live sync need a reachable Supabase instance with migration
  017 applied; offline everything except server-acknowledged states works.
- The triage engine is deliberately conservative; broad concepts + yes/no
  follow-ups cannot capture every clinical nuance. False urgents are possible
  (safe direction); a routine outcome is a routing suggestion, never a health
  claim.
