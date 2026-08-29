# Healthfolio — Security and Access Document

## 1. Security position

Healthfolio handles highly sensitive health-related documents. The MVP must use fictional data only and must not claim HIPAA, DISHA, ABDM or medical-device compliance. The security design nevertheless follows privacy-by-default principles so unsafe shortcuts do not become part of the product foundation.

## 2. Authentication

### MVP method

- Email and password through Supabase Auth
- Email verification before uploading documents
- Secure server-managed sessions using HttpOnly cookies
- Password reset through time-limited email link
- Rate limits on sign-up, sign-in and reset attempts

Google login and magic links are deferred. They add OAuth configuration but do not improve the judging workflow.

### Session rules

- Session cookies must be `HttpOnly`, `Secure` in production and `SameSite=Lax` or stricter.
- Refresh tokens never appear in logs.
- Sign-out clears the browser session.
- Sensitive server routes re-check the authenticated user and do not trust a client-supplied `user_id`.
- Optional inactivity timeout can be added after MVP.

## 3. Roles and permissions

### Guest

Can:

- View marketing, privacy and safety pages
- View a non-sensitive guided demo using fictional data

Cannot:

- Upload personal documents
- Access dashboards, exports, signed URLs or database records

### Authenticated user

Can:

- Create and manage their own portfolio
- Upload, replace, view and delete their own documents
- Start and resume their own agent runs
- Confirm or reject their own extracted facts
- View their own timeline, briefs, reminders and audit history
- Export their own PDF and ICS files
- Revoke consent and request account deletion

Cannot:

- Read another user’s records
- Change ownership fields
- Access service credentials
- Execute arbitrary tools or prompts as system instructions
- Modify server-side safety policy

### System service

Can:

- Perform bounded document processing and maintenance tasks
- Read only the resource IDs passed by an already-authorized server workflow
- Write extraction and agent-step results

Cannot:

- Be called directly from the browser with a service-role key
- Bypass ownership checks merely because it has elevated credentials

### Administrator

For MVP, no health-content admin dashboard is built. Operational admins may see aggregate status and redacted errors only. Direct content access requires a separately designed, audited support-consent workflow and is outside version one.

## 4. Authorization model

Every protected request follows:

1. Validate session.
2. Derive `user_id` from the session, never the request body.
3. Load the requested row with ownership filtering/RLS.
4. Verify portfolio/document relationships.
5. Check consent and resource state.
6. Execute the minimum permitted action.
7. Write a redacted audit event.

## 5. Row-level security

RLS is enabled on every user-data table. Default access is deny.

### Ownership policies

For `profiles`:

- A user may select/update only the row where `id = auth.uid()`.
- Profile creation uses `id = auth.uid()`.

For `portfolios`, `documents`, `extractions`, `medical_events`, `appointments`, `agent_runs`, `agent_steps`, `briefs`, `reminders`, `consents` and user-visible `audit_events`:

- Select: `user_id = auth.uid()`
- Insert: `user_id = auth.uid()` and referenced parent also belongs to `auth.uid()`
- Update: existing and new `user_id = auth.uid()`
- Delete: `user_id = auth.uid()` where deletion is permitted

The browser must not insert `extractions`, `agent_steps` or generated briefs directly. These use authorized server routes. RLS remains enabled even when server workflows exist.

### Storage policies

- Bucket is private.
- Object path format: `{user_id}/{portfolio_id}/{document_id}/{safe_filename}`.
- User can upload/read/delete only paths beginning with their authenticated user ID.
- UI uses short-lived signed URLs; public object URLs are forbidden.
- Replacing a document creates a new controlled version/path rather than overwriting an unrelated object.

## 6. Sensitive-data handling

- Use fictional data for all public demos and repository fixtures.
- Minimize collected profile information; phone number, address and date of birth are not required for MVP.
- Encrypt transport using HTTPS.
- Use provider-managed encryption at rest.
- Never log raw document text, extracted medical facts, AI prompts containing records or signed URLs.
- Redact filenames when they may include names.
- Strip unnecessary image metadata where practical.
- Configure AI provider data-retention controls when available.
- Send only pages/fields necessary for the current extraction task.
- Provide document, portfolio and account deletion controls.

## 7. AI-specific security

### Prompt injection

Documents are untrusted data. A document may contain text such as “ignore previous instructions.” The system must:

- Delimit document content as data, not instruction.
- Never allow document text to change the system prompt or tool policy.
- Use an allowlisted tool registry.
- Reject tool names and parameters outside schema.
- Block arbitrary URLs, SQL, shell and code execution.
- Limit step count, retries, input size and output size.

### Hallucination controls

- Every factual event requires evidence locator.
- Unclear fields receive confidence below threshold.
- Unverified facts do not enter the verified timeline or brief.
- Generated questions must be framed for discussion with a clinician, not as conclusions.
- Model output is validated with Zod before storage.
- Unsupported claims are removed by the verifier.

### Medical safety controls

The assistant must not diagnose, triage, prescribe or modify treatment. Requests for these are answered with a fixed boundary message and recommendation to contact a qualified professional. If a user indicates an urgent or emergency situation, the app stops the preparation workflow and directs them to local emergency services or a trusted healthcare professional; it does not attempt autonomous emergency assessment.

## 8. Input validation

### Files

- Allowed: PDF, PNG and JPEG
- Maximum: 10 MB per file for MVP
- Validate file extension, MIME type and magic bytes
- Sanitize display filename
- Reject encrypted/password-protected PDF unless explicitly supported
- Set page-count and pixel-dimension limits
- Scan or reject malformed files before parsing

### Text fields

- Goal: 1–1,000 characters
- Names/labels: length limited and HTML escaped
- Dates: ISO format on server; timezone required
- Manual corrections: schema-validated and auditable
- Never render model output as raw HTML

## 9. Error-handling guide

| Failure | User-facing response | Internal action |
|---|---|---|
| Wrong credentials | “Email or password is incorrect.” | Generic response; increment rate limit |
| Unverified email | “Verify your email before uploading records.” | Offer resend with cooldown |
| Expired session | “Your session expired. Sign in again to continue.” | Preserve safe local draft only |
| Unauthorized resource | “This record is unavailable.” | Return 404-style response; audit attempt |
| Unsupported file | “Upload a PDF, PNG or JPEG.” | Reject before storage |
| Oversized file | “This file exceeds the 10 MB limit.” | Reject before processing |
| Corrupt document | “We couldn’t open this document. Try another copy.” | Mark failed; do not call AI |
| Low-confidence extraction | “Some information could not be verified.” | Queue user review |
| AI timeout | “Processing paused. Your files are safe; try again.” | Bounded retry; preserve run state |
| Invalid AI response | “We couldn’t verify the result.” | Discard output; log non-sensitive code |
| Export failure | “Your brief is saved, but export failed.” | Permit idempotent retry |
| Network offline | “You’re offline. Unsaved actions will resume when connected.” | Queue only safe local actions |
| Safety boundary | “Healthfolio cannot diagnose or change treatment.” | Use fixed safe response |
| Unexpected server error | “Something went wrong. No changes were made.” | Correlation ID; redacted server log |

Never expose stack traces, SQL errors, provider responses, API keys or storage paths to the user.

## 10. Edge cases

- Empty upload selection
- Same file uploaded twice
- File renamed with incorrect extension
- Zero-page or extremely large PDF
- Rotated/upside-down image
- Multi-patient document uploaded into one portfolio
- Document with no visible date
- Two documents with contradictory dates
- Appointment in the past
- Appointment changed after brief generation
- User rejects every extracted fact
- User closes tab during processing
- Agent run resumed twice
- Tool succeeds but response is lost
- Duplicate reminder request
- Account deleted while job is processing
- AI provider unavailable during live demo
- Prompt injection embedded in a report
- User asks for diagnosis or medication change
- User enters another person’s information without authority

All write operations need idempotency keys where double execution could create duplicate records or reminders.

## 11. Deletion and retention

- User can delete individual documents.
- Deleting a document removes its storage object and invalidates dependent events/briefs.
- Account deletion starts a documented deletion workflow covering auth, database rows, storage objects and queued jobs.
- Demo data can be reset immediately.
- Production retention periods must be defined before real-user launch.
- Backups and provider retention must be described accurately in the privacy notice.

## 12. Security launch checklist

- RLS enabled and tested with two different users
- Private storage policies tested
- Service-role key absent from browser bundle
- `.env*` ignored except `.env.example`
- Secret scanning performed before public push
- All model output rendered as text/structured UI, not HTML
- File size/type/magic-byte validation active
- Agent step/retry limits active
- Diagnosis/treatment safety tests pass
- Prompt-injection fixtures pass
- Error pages reveal no internals
- Real patient information absent from fixtures, screenshots and video
- Delete and sign-out flows tested

