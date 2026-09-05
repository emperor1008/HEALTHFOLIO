# Healthfolio — Feature Ticket List

## How to use this file

Build tickets in numeric order unless a dependency says otherwise. Give one ticket at a time to an AI coding tool. Require it to inspect existing code, implement only the ticket scope, add tests, run relevant checks and summarize changed files. Do not prompt the tool to “build the entire app” in one attempt.

Priority labels:

- **P0 Must-have:** required for production release
- **P1 Should-have:** add after all P0 tickets pass
- **P2 Nice-to-have:** post-MVP

## Phase 0 — Foundation

### HF-001 — Scaffold the application

**Priority:** P0 Must-have  
**Dependencies:** None

**Task description:** Create a single Next.js TypeScript App Router project with Tailwind CSS, strict TypeScript, ESLint, Prettier, Vitest and Playwright. Add scripts for development, build, lint, typecheck, unit tests and end-to-end tests. Create `.env.example` and ensure real environment files are ignored.

**Acceptance criteria:**

- App starts locally with one command.
- `lint`, `typecheck`, `test` and `build` scripts exist.
- No secret value is committed.
- Root README contains initial setup commands.

### HF-002 — Implement design tokens and app shell

**Priority:** P0 Must-have  
**Dependencies:** HF-001

**Task description:** Implement Healthfolio colors, typography, spacing and responsive application shell from the frontend specification. Add reusable Button, Input, Textarea, Card, Badge, Modal, Spinner and ErrorMessage components with accessibility states.

**Acceptance criteria:**

- Components match documented tokens.
- Focus, disabled, loading and error states work.
- Shell works at 360 px and desktop widths without horizontal scroll.
- Component tests cover primary interactive states.

### HF-003 — Configure Supabase clients and migrations

**Priority:** P0 Must-have  
**Dependencies:** HF-001

**Task description:** Add typed browser/server Supabase clients, validated environment configuration and SQL migrations for the documented schema. Do not add service credentials to client code.

**Acceptance criteria:**

- Environment validation fails clearly when required variables are missing.
- Migrations create all MVP tables and relationships.
- Service-role code is server-only.
- Seed script creates fictional demo data only.

## Phase 1 — Identity and data isolation

### HF-004 — Build authentication

**Priority:** P0 Must-have  
**Dependencies:** HF-002, HF-003

**Task description:** Build email/password sign-up, verification guidance, sign-in, sign-out and password-reset flows using secure sessions. Protect application routes.

**Acceptance criteria:**

- User can create account, sign in and sign out.
- Protected routes redirect unauthenticated users.
- Errors use generic safe messages.
- Auth secrets/tokens never appear in UI or logs.

### HF-005 — Apply and test row-level security

**Priority:** P0 Must-have  
**Dependencies:** HF-003, HF-004

**Task description:** Enable RLS and implement ownership policies for every user-data table and the private storage bucket. Add integration tests using two users.

**Acceptance criteria:**

- User A cannot read, update or delete User B data.
- User cannot alter `user_id` ownership.
- Storage objects are private and ownership-scoped.
- Unauthorized resource requests return a non-revealing response.

### HF-006 — Consent and privacy controls

**Priority:** P0 Must-have  
**Dependencies:** HF-004, HF-005

**Task description:** Add versioned terms, privacy and AI-processing consent before upload. Add settings controls for document deletion and account-deletion request.

**Acceptance criteria:**

- Upload is blocked until required consent is recorded.
- Consent version and timestamp are stored.
- User can delete an owned document and dependent outputs are marked stale/invalid.
- UI states that demo data must be fictional.

## Phase 2 — Goal and document ingestion

### HF-007 — Build dashboard and preparation goal form

**Priority:** P0 Must-have  
**Dependencies:** HF-002, HF-004

**Task description:** Create dashboard empty state and a form for goal, appointment date/time, timezone, specialty and optional clinician/location. Validate with Zod on client and server.

**Acceptance criteria:**

- User can create and edit a preparation goal.
- Past/invalid dates show clear errors.
- Timezone is stored explicitly.
- Goal length and content are validated server-side.

### HF-008 — Implement secure document upload

**Priority:** P0 Must-have  
**Dependencies:** HF-005, HF-006, HF-007

**Task description:** Add multi-file PDF/PNG/JPEG upload with MIME, signature, size and ownership validation. Store files in private user paths and create document rows.

**Acceptance criteria:**

- Supported files up to 10 MB upload with progress.
- Unsupported, corrupt or oversized files are rejected safely.
- User can remove a file before starting processing.
- No public storage URL is created.
- Duplicate file hash is identified.

### HF-009 — Build document list and preview

**Priority:** P0 Must-have  
**Dependencies:** HF-008

**Task description:** Show owned documents with type, upload time, status and actions. Provide authorized preview through short-lived access without exposing permanent URLs.

**Acceptance criteria:**

- Loading, empty, failed and populated states exist.
- Document status is labeled with text/icon.
- Another user cannot preview the document.
- Preview works on mobile and closes accessibly.

## Phase 3 — AI intelligence

### HF-010 — Create AI provider adapter and output schemas

**Priority:** P0 Must-have  
**Dependencies:** HF-001

**Task description:** Implement a server-only provider interface for text/vision tasks. Define strict Zod schemas for document classification, extracted facts, evidence locators, confidence and agent next-action decisions.

**Acceptance criteria:**

- Provider can be replaced through configuration.
- Invalid model output is rejected.
- API key never reaches browser.
- Unit tests cover valid, missing and malicious output.

### HF-011 — Implement document extraction pipeline

**Priority:** P0 Must-have  
**Dependencies:** HF-008, HF-010

**Task description:** Extract PDF text/page mappings deterministically, run OCR/vision fallback where required, and store structured extraction records with evidence and confidence. Treat document text as untrusted data.

**Acceptance criteria:**

- Processes prescription, lab-report and discharge-summary fixtures.
- Every extracted fact has document ID, page and evidence locator.
- No unsupported fact is stored as verified.
- Embedded prompt-injection fixture cannot change tool policy.
- Timeout and malformed output produce recoverable failure status.

### HF-012 — Build extraction review queue

**Priority:** P0 Must-have  
**Dependencies:** HF-009, HF-011

**Task description:** Build the source-and-field review screen. Users can confirm, correct or reject uncertain extraction. Only confirmed/corrected facts can be promoted to verified events.

**Acceptance criteria:**

- Low-confidence facts visibly require review.
- User can view the source page.
- Corrections are validated and audited.
- Rejected facts do not enter timeline/brief.
- Keyboard and mobile interactions work.

### HF-013 — Generate the verified timeline

**Priority:** P0 Must-have  
**Dependencies:** HF-012

**Task description:** Convert verified extractions into neutral chronological events. Display a responsive timeline with dates, event types, verification state and source links.

**Acceptance criteria:**

- Timeline order is deterministic.
- Unknown/approximate dates are clearly marked.
- Every event opens its evidence source.
- Conflicting dates remain visible for resolution rather than silently merged.
- No clinical interpretation is added.

## Phase 4 — Agent loop

### HF-014 — Implement tool registry and policy

**Priority:** P0 Must-have  
**Dependencies:** HF-010, HF-011, HF-013

**Task description:** Create allowlisted tools with Zod input/output contracts and a policy that permits tools only in valid agent states. Add maximum steps, retries, idempotency and forbidden medical-action checks.

**Acceptance criteria:**

- Unknown tools and invalid parameters are rejected.
- Step/retry limits terminate safely.
- Duplicate requests do not duplicate effects.
- Diagnosis, prescription and dosage actions are impossible through registry.
- Tool success and failure tests pass.

### HF-015 — Implement agent controller and verifier

**Priority:** P0 Must-have  
**Dependencies:** HF-014

**Task description:** Implement the intake, extract, review, plan, execute, verify, adapt, complete and blocked states. Persist state after each step. Store only concise public operational summaries, never hidden reasoning.

**Acceptance criteria:**

- Goal persists across steps.
- Controller chooses only registered tools.
- Verifier checks evidence, confidence, approval and tool status.
- Interrupted run can resume from persisted state.
- Run ends as complete, blocked or failed within configured limit.

### HF-016 — Build agent activity timeline

**Priority:** P0 Must-have  
**Dependencies:** HF-015, HF-002

**Task description:** Display observation, decision, action, result, verification and adaptation summaries. Make failures and recovery visible without exposing chain-of-thought or sensitive raw prompts.

**Acceptance criteria:**

- Current, completed, failed and blocked states are distinct.
- Activity updates without duplicate steps.
- Failed step presents one recovery action.
- Raw provider payloads and hidden reasoning are absent.
- Screen is presentation-ready on mobile and desktop.

### HF-017 — Implement blurred-document recovery

**Priority:** P0 Must-have  
**Dependencies:** HF-012, HF-015, HF-016

**Task description:** Add an intentional low-confidence sample and replacement flow. Agent must continue safe independent work, request replacement/correction and resume when resolved.

**Acceptance criteria:**

- Unclear fact is blocked from verified timeline.
- Other valid documents continue processing.
- User can replace, correct or exclude the file.
- Agent resumes without restarting completed work.
- Activity timeline explicitly shows adaptation and final verification.

## Phase 5 — Actionable outcome

### HF-018 — Generate consultation brief and checklist

**Priority:** P0 Must-have  
**Dependencies:** HF-013, HF-015

**Task description:** Generate a structured brief containing appointment details, user goal, verified timeline highlights, included/missing documents, questions to discuss and non-clinical checklist. Every factual item must reference evidence.

**Acceptance criteria:**

- Brief uses verified information only.
- Questions are framed for clinician discussion.
- Safety disclaimer is visible.
- User can approve the draft.
- Appointment/source changes mark the brief stale.

### HF-019 — Export consultation PDF

**Priority:** P0 Must-have  
**Dependencies:** HF-018

**Task description:** Generate a clean one-page or concise multi-page PDF from an approved brief, including source appendix and safety statement. Enforce authorization and private no-cache response headers.

**Acceptance criteria:**

- Only owner can export.
- PDF opens correctly and contains no clipped text.
- Source references and generation date are present.
- Export failure does not destroy the approved brief.
- Filename is safe and professional.

### HF-020 — Create reminders and ICS calendar export

**Priority:** P0 Must-have  
**Dependencies:** HF-007, HF-015

**Task description:** Store an in-app appointment reminder and generate a valid `.ics` file. When appointment changes, mark the old reminder/calendar artifact stale and regenerate after approval.

**Acceptance criteria:**

- Reminder respects stored timezone.
- ICS imports into a common calendar application.
- Repeated requests do not create duplicate reminders.
- Date changes trigger visible adaptation.
- Calendar content contains no unnecessary health details.

## Phase 6 — Resilience and release

### HF-021 — Implement global error and offline states

**Priority:** P0 Must-have  
**Dependencies:** HF-002, HF-015

**Task description:** Add route-level/global error boundaries, retryable server errors, offline indicator and safe preservation of local form drafts. Do not queue sensitive uploads while offline.

**Acceptance criteria:**

- App never shows a raw stack trace.
- Retryable actions are explicit.
- Goal form draft survives a temporary disconnect.
- Upload waits for connectivity.
- Agent state remains consistent after refresh.

### HF-022 — Create resettable fictional demo mode

**Priority:** P0 Must-have  
**Dependencies:** HF-017, HF-018, HF-020

**Task description:** Add fictional sample records and a reset command/control for rehearsals. Clearly label fixture/fallback output and never present prepared data as a live AI result.

**Acceptance criteria:**

- Demo resets to identical starting state.
- Contains one blurred-document failure.
- No real names, identifiers or patient data exist.
- Complete workflow runs in under four minutes.

### HF-023 — Security and safety test suite

**Priority:** P0 Must-have  
**Dependencies:** HF-005, HF-011, HF-014, HF-021

**Task description:** Add tests for cross-user access, private storage, prompt injection, malformed model output, step limit and diagnosis/treatment/medication requests.

**Acceptance criteria:**

- Two-user isolation tests pass.
- Prompt injection cannot select unregistered tools.
- Forbidden medical actions return fixed safe responses.
- Secrets and raw records do not appear in logs.
- Test report can be shown to judges.

### HF-024 — Performance and accessibility pass

**Priority:** P1 Should-have  
**Dependencies:** All P0 UI tickets

**Task description:** Audit mobile performance, keyboard navigation, screen-reader labels, contrast, loading behaviour and large-document responsiveness.

**Acceptance criteria:**

- Critical flow usable at 360 px and 200% zoom.
- No keyboard traps.
- Labels/errors are programmatically associated.
- Large processing tasks do not freeze the UI.
- Reduced-motion preference is honored.

### HF-025 — Repository and release documentation

**Priority:** P0 Must-have  
**Dependencies:** All P0 tickets

**Task description:** Finalize public README, architecture, setup, environment, safety, limitations, demo instructions and screenshots. Add license and contributor/team section appropriate for one developer.

**Acceptance criteria:**

- Fresh setup succeeds using README.
- `.env.example` describes every variable.
- Architecture diagram and agent loop are included.
- Demo video maps goal → decision → action → adaptation → outcome.
- Secret scan is clean before public push.

## Optional post-MVP tickets

### HF-026 — Installable PWA

**Priority:** P1 Should-have  
**Dependencies:** HF-021

Add manifest, icons and cached application shell. Never cache private document bodies unless a separate encrypted offline design is completed.

### HF-027 — Plain-language glossary

**Priority:** P1 Should-have  
**Dependencies:** HF-012

Explain extracted terms using source-aware neutral language without clinical interpretation or personalized advice.

### HF-028 — Google Calendar integration

**Priority:** P2 Nice-to-have  
**Dependencies:** HF-020

Add OAuth and create/update calendar events with explicit consent. Preserve ICS fallback.

### HF-029 — Hindi and Odia localization

**Priority:** P2 Nice-to-have  
**Dependencies:** Stable English UI

Localize navigation, errors and reminder templates. Medical record text remains source-preserving and is not silently translated as fact.

## Recommended solo build order

1. HF-001–HF-009: application, security and upload
2. HF-010–HF-013: visible AI document intelligence
3. HF-014–HF-017: agent execution and recovery
4. HF-018–HF-020: final useful artifacts
5. HF-021–HF-025: resilience, testing and release
6. Add P1 only if every P0 demo rehearsal passes

