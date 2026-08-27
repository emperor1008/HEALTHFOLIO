# Healthfolio — Frontend Specification

## 1. Experience direction

Healthfolio should feel calm, credible and precise—closer to a modern patient portal than a futuristic AI dashboard. Avoid neon gradients, glowing orbs, excessive glassmorphism, dark-purple “AI” styling and medical imagery that creates fear. The intelligence is communicated through clear evidence, progress and successful actions.

## 2. Brand system

### Name and messaging

- Brand: **Healthfolio**
- Tagline: **Your health history, clearly organized.**
- Product descriptor: **Agentic medical record intelligence and consultation preparation**
- Primary CTA: **Create my Healthfolio**
- Workflow CTA: **Prepare for an appointment**

### Color palette

| Token | Hex | Use |
|---|---|---|
| Primary 700 | `#0F5C5E` | Primary buttons, active navigation |
| Primary 600 | `#176D6F` | Hover/interactive emphasis |
| Primary 100 | `#DDEEEE` | Selected and informational surfaces |
| Secondary 600 | `#315E7D` | Timeline and supporting actions |
| Accent 500 | `#D97757` | Small highlights only, never large backgrounds |
| Canvas | `#F7F5EF` | Main warm background |
| Surface | `#FFFFFF` | Cards, sheets and forms |
| Text primary | `#1F2933` | Main text |
| Text secondary | `#5F6B76` | Supporting text; verify contrast at size |
| Border | `#D9DEE3` | Dividers and input borders |
| Success | `#18794E` | Verified/success state |
| Warning | `#A15C00` | Review required/uncertain state |
| Error | `#B42318` | Failed/destructive state |
| Info | `#245EA8` | Neutral system information |

Status is never communicated by color alone. Pair it with an icon and label such as “Verified,” “Needs review” or “Failed.”

### Typography

Use **Manrope Variable** for the complete interface to reduce loading and preserve consistency.

| Style | Desktop / mobile | Weight | Use |
|---|---|---|---|
| Display | 48 / 36 px | 600 | Landing headline only |
| H1 | 36 / 30 px | 600 | Page title |
| H2 | 28 / 24 px | 600 | Major section |
| H3 | 20 / 18 px | 600 | Card/section title |
| Body large | 18 / 17 px | 400 | Introductory copy |
| Body | 16 px | 400 | Default text |
| Small | 14 px | 400 | Metadata and help text |
| Label | 14 px | 600 | Form labels and compact controls |

Use a minimum 16 px input font on mobile to avoid browser zoom. Line height should be approximately 1.5 for body text.

## 3. Spacing and layout

- Base spacing unit: 4 px
- Common gaps: 8, 12, 16, 24, 32, 48 and 64 px
- Mobile page padding: 16 px
- Tablet page padding: 24 px
- Desktop page padding: 32 px
- Maximum content width: 1200 px
- Reading/forms column: 680–760 px
- Border radius: 10 px inputs/buttons, 14 px cards, 18 px modal/sheet
- Minimum touch target: 44 × 44 px
- Use a 12-column grid on desktop; single column under 768 px
- Fixed bottom actions on mobile only when they do not hide content

## 4. Navigation

### Desktop

Left navigation:

- Overview
- Documents
- Timeline
- Preparation
- Settings

Top bar contains product name, processing indicator, help and account menu.

### Mobile

Use a compact top bar and bottom navigation with at most four primary destinations. Secondary settings live in the account sheet. Never place the main upload action only inside a hidden menu.

## 5. Component specifications

### Buttons

**Primary:** solid primary color, white text, 44 px minimum height. One primary action per region.  
**Secondary:** white/surface background, primary text, 1 px border.  
**Ghost:** text/icon only for low-emphasis actions.  
**Destructive:** error-colored only for confirmed deletion.  

States: default, hover, focus-visible, disabled, loading and success. Loading buttons preserve width and show a spinner plus verb, e.g. “Generating brief…”.

### Inputs

- Label above input; placeholder is never the label
- 44–48 px height
- Clear help text and inline validation
- Error text below field, associated through accessibility attributes
- Date/time inputs show timezone
- Goal input uses a textarea with suggested examples

### Cards

Use cards only to group a meaningful entity: document, timeline event, activity step or final artifact. White surface, subtle border and minimal shadow. Avoid nested cards.

### Upload area

- Standard file button plus drag-and-drop on desktop
- Accepted formats and 10 MB limit visible before selection
- Each file row shows name, size, progress, state and remove/retry action
- Image/PDF preview opens in an accessible sheet/modal
- Never expose private storage URL

### Status badges

- Verified: check icon + “Verified”
- Needs review: alert icon + “Needs review”
- Processing: spinner + “Processing”
- Failed: error icon + “Failed”
- Excluded: minus icon + “Excluded”

### Modal and mobile sheet

Use for confirmation, document preview and destructive actions. Include visible title, close control, focus trap, Escape handling and focus return. Use a bottom sheet on small screens when content is short.

### Toasts

Use only for non-blocking confirmation such as “Calendar file downloaded.” Persistent errors belong inline near the failed item.

## 6. Core screen specifications

### Landing page

- Headline: “Turn scattered medical records into one clear health story.”
- Short explanation of upload → verify → prepare
- Primary CTA
- Three-step product demonstration
- Safety statement before testimonials or claims
- No invented clinical statistics

### Dashboard

- Current preparation goal
- Next appointment
- Documents needing review
- Latest timeline update
- Primary CTA: Prepare for an appointment
- Empty state with one guided action

### Goal and upload

- Step indicator: Goal → Documents → Review → Prepared
- Goal text area and appointment fields
- Multi-file upload
- Consent reminder
- Start button disabled until required fields/files are valid

### Agent activity

Show concise operational state, not private chain-of-thought:

1. Observation
2. Decision
3. Action/tool
4. Result
5. Verification/adaptation

Only the current step expands by default. Completed steps remain readable. Failed steps provide one clear recovery action.

### Extraction review

- Split view on desktop: source preview and extracted field
- Stacked view on mobile
- Confidence expressed as labels, not deceptive precision
- Actions: Confirm, Correct, Reject
- Unverified information never appears as confirmed

### Timeline

- Chronological vertical timeline
- Event title, date, type, verification label and source link
- Approximate/unknown dates visibly marked
- Filters are optional; do not add them until six or more event types exist

### Consultation brief

Sections:

- Appointment details
- Reason for preparation, written by user
- Verified timeline highlights
- Documents included and missing
- Questions to discuss with clinician
- Preparation checklist
- Evidence/source appendix
- Safety disclaimer

User approves before PDF export. Editing appointment data marks dependent output “Needs update.”

## 7. Responsive behaviour

- No horizontal page scrolling at 320–360 px.
- Timeline remains vertical on mobile.
- Desktop split panes become sequential source → field cards.
- Tables become labeled stacked rows when columns would be unreadable.
- Primary actions remain reachable with one thumb.
- Test browser zoom at 200% and keyboard-only navigation.

## 8. Accessibility

- Meet WCAG 2.2 AA contrast and interaction expectations.
- Semantic headings and landmarks
- Visible focus indicators
- Full keyboard operation
- Form errors announced to assistive technology
- Progress updates use restrained live regions
- Icons include labels or accessible names
- Document preview has text alternative/status
- Respect reduced-motion preference
- Never use animation to imply clinical urgency

## 9. Motion

- 150–220 ms transitions for panels and state changes
- Timeline updates may highlight once, then settle
- No looping decorative animation
- Processing uses a small determinate indicator when progress is known
- Reduced-motion mode removes nonessential movement

## 10. Internal API specification

All APIs require JSON unless uploading bytes. Responses use a standard envelope:

```json
{
  "data": {},
  "error": null,
  "requestId": "opaque-id"
}
```

Errors use stable codes such as `AUTH_REQUIRED`, `FILE_TOO_LARGE`, `LOW_CONFIDENCE`, `RUN_BLOCKED` and `EXPORT_FAILED`.

### Create document upload

`POST /api/documents`

Input:

```json
{
  "portfolioId": "uuid",
  "fileName": "report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 123456
}
```

Output: document ID and short-lived private upload instructions. The browser never chooses storage ownership.

### Start agent run

`POST /api/runs`

Input: portfolio ID, goal, appointment data and document IDs.  
Output: run ID, initial status and first public activity step.

### Advance run

`POST /api/runs/:id/step`

Input: optional idempotency key and approved user response.  
Output: current public step, run state and required user action. One call executes a bounded amount of work.

### Confirm extraction

`POST /api/extractions/:id/confirm`

Input:

```json
{
  "decision": "confirm | correct | reject",
  "correctedValue": null
}
```

Output: updated verification state and affected timeline status.

### Export brief/calendar

Authorized GET routes return `application/pdf` or `text/calendar`. Responses use private, non-cacheable headers and safe filenames.

## 11. Third-party integrations

### Supabase

Purpose: authentication, PostgreSQL data and private file storage.  
Data sent: account email, application rows and uploaded files.  
Data returned: session, authorized rows, signed upload/download instructions.  
Security: browser receives public project URL/anon key only; service-role key remains server-only; RLS always active.

### AI model provider

Purpose: structured extraction, document classification, timeline proposal, question/checklist drafting.  
Data sent: only the minimum document page/text and task instruction required.  
Data returned: schema-constrained JSON with evidence locations and confidence.  
Security: called server-side; retention settings reviewed; raw provider output is never directly rendered.

### OCR/PDF parser

Purpose: deterministic text extraction before expensive model calls.  
Data sent: document bytes or selected pages, preferably processed server-side.  
Data returned: text, page mapping and extraction metadata.

### Calendar integration

MVP uses locally generated `.ics`; no third party receives data. Google Calendar OAuth is deferred until after the core demo.

## 12. Content style

- Calm, direct and non-judgmental
- Use “could not verify” instead of “bad document”
- Use “questions to discuss” instead of “recommended treatment”
- Use “medical record” rather than “medical truth”
- Avoid “diagnosed by AI,” “clinically approved” and unsupported claims
- Explain every blocked action with a next step

