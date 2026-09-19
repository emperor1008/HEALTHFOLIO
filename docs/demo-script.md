# Healthfolio — 3–5 Minute Demonstration Script

Shows one complete, honest journey: offline start → sync → triage → clinician
action → consented sharing → text fallback → pharmacy confirmation → real
metrics. No simulated success: every status shown comes from real queue or
server state. Use only non-identifying demonstration accounts.

## Preparation (before recording)

1. `npm run dev`, migrations applied (`npx supabase db push`), dashboard open
   in a second tab (`/reliability`, staff session) to show real events at the
   end.
2. One genuine clinician account configured via the runbook (availability set
   through `/staff`) — introduced honestly if asked ("this is our configured
   demonstration clinician").
3. Dev-only resilience panel available for the network interruption (or use
   DevTools Offline — both are real request-level failures).

## 0. The home screen (30s)

- Open the app. Point out the calm welcome, connection/sync status card, and
  honest empty states — no fabricated records or numbers.
- Note the language selector: switch to **हिन्दी** then **ଓଡ଼ିଆ** and back —
  the whole interface translates instantly, offline.

## 1. Start offline, save a care request (60s)

1. Enable **Offline** (resilience panel or DevTools). The status card flips to
   "Saved on this device" style truthful states.
2. Start a care request: choose a symptom category, tap through the guided
   steps (one question per screen, large targets), type a short description.
3. Submit → the app shows **"Saved on this device. It will be sent when a
   connection is available."** — it does not claim "sent".

## 2. Refresh — prove persistence (30s)

- Reload the page completely. The request is still there, still shown as
  waiting (IndexedDB persistence). Nothing was lost.

## 3. Reconnect — automatic sync + safety routing (45s)

1. Disable Offline. Within seconds the queue syncs automatically; the request
   status becomes **Synced securely / Submitted** — only now, after the real
   server acknowledgement.
2. The deterministic triage result appears with its honest framing: a broad
   urgency signal (from the guided answers), the standing disclaimer that the
   tool does not diagnose, and — where applicable — the emergency block.

## 4. Clinician acts (45s)

- In the staff session (or showing the patient view), the assigned clinician
  accepts the request and proposes an appointment time; the patient confirms.
  Every transition is server-validated and audited; duplicate taps are no-ops.

## 5. Consented record sharing (30s)

- The consent screen lists the patient's real uploaded records by name/date.
  Grant sharing for selected records only. Mention: time-limited clinician
  access (24h), revocable before the consultation, audited on every open.

## 6. Consultation with honest fallback (30s)

- Open the consultation lobby; tap Join — permission is requested only now.
  Let the setup fail (offline again or denied permission): the app shows
  **"Connection failed"** and offers **"Continue by secure text"** /
  **"Try audio only"**. Send a message; if still offline it shows "Saved on
  this device", then delivers on reconnect. There is no "seen" receipt.

## 7. Pharmacy confirmation (45s)

- In the pharmacy operator session, update one medicine's status to
  **Available** (note the truthful offline state if the network is still
  shaky, then reconnect).
- Patient searches the medicine: result shows **"Reported available by this
  pharmacy"**, the **last-confirmed timestamp**, and the standing note
  "Availability can change. Please confirm with the pharmacy before
  travelling." Optionally send a non-binding confirmation request and answer
  it from the operator console.

## 8. Reliability dashboard — real events only (30s)

- Open `/reliability`: the event counts now include this session's real
  actions (queue items created/synced, care request submitted, appointment
  confirmed, fallback used, pharmacy update). Definitions are printed on the
  page. If it had been empty, it would have said "No data yet" — nothing is
  ever estimated.

## Talking points (if asked)

- No LLM anywhere in the safety path; triage is deterministic and versioned.
- No TURN is configured, so video is never presented as dependable — text is.
- Empty states are honest everywhere; no demo pharmacies/doctors exist in the
  product data.
