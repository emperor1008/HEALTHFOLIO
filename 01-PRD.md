# Healthfolio — Product Requirements Document

**Document status:** Build baseline  
**Product stage:** Hackathon MVP  
**Primary owner:** Solo developer  
**Submission target:** Tech Zephyr 4.0 Agentic AI Hackathon, Round 1  
**Product type:** Responsive web application / installable PWA

## 1. Product summary

Healthfolio is an agentic medical-record intelligence and consultation-preparation application. A user uploads scattered medical documents—such as prescriptions, reports and discharge summaries—and gives Healthfolio a goal such as “Prepare me for my appointment next Monday.” Healthfolio reads the documents, extracts evidence-linked facts, creates a chronological health timeline, identifies uncertain or missing information, asks for confirmation, and completes practical preparation tasks such as producing a consultation brief, checklist, reminder and calendar file.

Healthfolio is not an AI doctor. It does not diagnose, prescribe, recommend treatments, change doses or replace a healthcare professional.

## 2. Problem statement

Patients often keep their health information in disconnected places: paper prescriptions, phone photographs, PDF reports, email attachments and discharge files from different hospitals. Before a consultation, they must manually remember dates, find relevant reports, explain their history and identify what to carry. Important context can be missed, while unclear documents may be misunderstood.

Existing storage apps keep files but do not actively prepare the patient. Generic chatbots can summarize text, but they commonly stop after answering and may not verify uncertain extraction, execute follow-up actions or adapt when an input fails.

Healthfolio solves this preparation problem by turning scattered records into a source-linked, user-verified timeline and then pursuing a defined preparation goal through an observable agent loop:

**Observe → Decide → Act → Verify → Adapt → Complete or hand off**

## 3. Target users

### Primary persona: independent patient

- Age: 18–65+
- Device: primarily Android phone; sometimes laptop
- Technical comfort: basic to moderate
- Situation: has multiple medical documents and an upcoming consultation
- Wants: one organized history, a clear checklist and less stress before the appointment
- Frustrations: confusing terminology, scattered documents, forgotten dates, unreadable photographs and repeating the same history

### Secondary persona: family caregiver

- Organizes documents for a parent or dependent with explicit permission
- Needs a concise brief and task checklist
- Requires strong separation between portfolios and clear consent boundaries

### Hackathon demo persona

- Uses fictional records only
- Uploads 4–6 prepared sample documents
- Demonstrates one successful workflow and one recoverable failure

## 4. Product vision

Healthfolio will become a trusted preparation layer between a patient’s scattered health records and their next healthcare interaction—organizing evidence, exposing uncertainty and completing safe administrative next steps without pretending to provide clinical judgment.

## 5. Product principles

1. **Evidence before fluency:** Every extracted fact must link to its source document and page.
2. **Uncertainty must be visible:** Low-confidence fields require confirmation; they must not silently enter the verified timeline.
3. **Action, not only conversation:** The agent must create real artifacts and task state.
4. **Human control:** The user approves extracted facts and sensitive actions.
5. **No diagnosis:** Clinical decisions remain with qualified professionals.
6. **Small, complete MVP:** One excellent end-to-end workflow is more valuable than many unfinished features.
7. **Mobile first:** Core workflows must work at 360 px width and with slow connections.

## 6. Jobs to be done

- When I have an upcoming appointment, help me organize the relevant records so I can explain my history clearly.
- When a document is unclear, tell me exactly what cannot be verified instead of guessing.
- When my appointment changes, update my preparation plan and reminders.
- When I need to share context with a doctor, generate a concise, source-linked brief that I can review first.

## 7. Core features

| Feature | Description | MVP classification |
|---|---|---|
| Account and private portfolio | Secure sign-up, sign-in and personal workspace | Must-have |
| Goal capture | User states a goal and optional appointment date | Must-have |
| Document upload | Upload PDF, PNG or JPEG with validation and progress | Must-have |
| Document intelligence | OCR/multimodal extraction into structured, source-linked fields | Must-have |
| Confidence review | Separate verified, uncertain and failed fields; request corrections | Must-have |
| Health timeline | Chronological events with source citations | Must-have |
| Agent controller | Plan, select tools, verify results and adapt after failure | Must-have |
| Agent activity trail | Human-readable observation, decision, action, result and adaptation | Must-have |
| Consultation brief | Generate a reviewable one-page appointment summary | Must-have |
| Appointment checklist | Documents and non-clinical preparation tasks | Must-have |
| Reminder | In-app reminder and downloadable calendar `.ics` file | Must-have |
| PDF export | Export the approved consultation brief | Must-have |
| Demo mode | Fictional dataset and resettable scripted scenario | Must-have |
| Plain-language glossary | Explain terms without interpreting their clinical meaning | Should-have |
| Installable PWA | App-like mobile installation and cached shell | Should-have |
| Google Calendar OAuth | Create/update external calendar events | Nice-to-have |
| Hindi/Odia interface | Localized navigation and message templates | Nice-to-have |
| Caregiver sharing | Time-limited read-only link with consent | Nice-to-have, post-MVP |

## 8. Agentic behaviour requirements

The agent receives a user goal and maintains explicit state until the goal is completed, blocked or handed back to the user.

### Required loop

1. **Observe:** inspect goal, appointment, documents, extraction status and prior actions.
2. **Decide:** choose the next safe action from a strict allowlist.
3. **Act:** call one tool with validated structured input.
4. **Verify:** check tool success, confidence, user approval and remaining work.
5. **Adapt:** retry safely, request clarification, skip a blocked item, or re-plan.
6. **Finish:** show completed, pending and blocked outcomes.

### Demonstrable failure

One sample prescription is intentionally blurred. The extractor returns low confidence. The agent must prevent the uncertain information from entering the verified timeline, request a clearer image, continue processing other documents, and resume after replacement.

### Allowed tools

- `document.ingest`
- `document.extract`
- `timeline.build`
- `clarification.request`
- `brief.generate`
- `checklist.generate`
- `reminder.create`
- `calendar.export_ics`
- `pdf.export`

The model cannot invent tool names or execute arbitrary code.

## 9. MVP app flow

### Flow A: first-time user

1. Landing page explains the outcome and safety boundary.
2. User selects **Create my Healthfolio**.
3. User signs up with email and password and accepts privacy/AI-processing consent.
4. Empty dashboard offers **Prepare for an appointment**.
5. User writes the goal and optionally enters date, time and clinician/specialty.
6. User uploads documents.
7. App validates files and starts an agent run.
8. Processing screen shows current step without exposing hidden model reasoning.
9. User reviews uncertain facts and confirms or corrects them.
10. Agent builds the verified timeline.
11. Agent generates the brief, checklist and reminder.
12. User reviews the final outcome and exports PDF/ICS.

### Flow B: failed document extraction

1. Extraction marks a page unreadable or low confidence.
2. UI shows the affected document/page and a clear retry instruction.
3. User replaces the file, corrects the value manually or excludes the document.
4. Agent verifies the choice and continues from the blocked step.
5. Final output marks excluded information rather than hiding the failure.

### Flow C: appointment date changes

1. User edits the appointment date.
2. Agent observes that reminders and generated brief metadata are stale.
3. Agent proposes updates.
4. User approves.
5. Reminder, checklist deadlines, ICS file and brief are regenerated.

### Flow D: returning user

1. User signs in.
2. Dashboard lists portfolios, active goal and recent agent runs.
3. User resumes a blocked run or opens the latest verified timeline.

## 10. Screen inventory

1. Landing
2. Sign up / sign in
3. Consent
4. Dashboard
5. New preparation goal
6. Document upload
7. Agent processing
8. Extraction review
9. Timeline
10. Consultation brief and checklist
11. Export/share controls
12. Settings, privacy and delete account

## 11. MVP acceptance criteria

- A new user can register and access only their own portfolio.
- User can upload supported files and see validation/progress.
- At least three document types are converted into structured events.
- Every timeline fact has a source document/page and verification state.
- Low-confidence extraction cannot silently become verified.
- Agent activity shows observation, decision, tool, result and adaptation summaries.
- The blurred-document demo recovers after replacement.
- User can generate and download a consultation PDF and `.ics` calendar file.
- No flow provides diagnosis, prescription or dose-change advice.
- Core workflow works at 360 px mobile width and on desktop.
- Demo can be reset and completed in under four minutes.

## 12. Success metrics

### Hackathon metrics

- Complete end-to-end demo success rate: target 100% across ten rehearsals
- Successful recovery from the intentional extraction failure: target 100%
- Median demo workflow time: under four minutes
- Source coverage: 100% of timeline facts include document/page reference
- Unverified-fact leakage: 0
- Unsafe clinical recommendations in test suite: 0
- Mobile critical-flow completion: 100% of tested screens

### Future product metrics

- Percentage of users who complete a consultation brief
- Time from upload to verified timeline
- Percentage of uncertain facts corrected by users
- Reminder completion rate
- Returning users who prepare a second appointment
- User-reported confidence before consultation

## 13. Deliberately not building in version one

- Diagnosis, triage or treatment recommendations
- Medication initiation, discontinuation or dose advice
- Emergency-response decision-making
- Doctor or hospital marketplace
- Insurance claims
- Live electronic health-record integration
- Real-time clinician chat
- Pharmacy ordering
- Wearable-device integration
- Family sharing
- Payments
- Multi-agent architecture
- Large public medical RAG database
- Native Android/iOS apps

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| OCR invents or misreads text | Confidence thresholds, source evidence and user confirmation |
| LLM gives medical advice | Safety classifier, forbidden-intent checks and deterministic response templates |
| Sensitive-data exposure | Private storage, RLS, signed URLs, redacted logs and delete controls |
| Prompt injection inside documents | Treat documents as untrusted data; tools remain allowlisted server-side |
| Solo-development scope | One user role, one workflow, one agent and few integrations |
| API outage | Clear blocked state, retry control and deterministic demo fallback using prepared extraction fixtures |
| Judges perceive a chatbot | Activity trail and real PDF/ICS/reminder actions make execution visible |

## 15. Round 1 submission definition of done

- Public repository with sanitized code and `.env.example`
- Complete README and architecture documentation
- Hosted or locally reproducible application
- Fictional sample documents
- 3–5 minute demo video showing failure and adaptation
- Problem/solution deck with safety limitations
- No real patient information, secrets or mocked success claims

