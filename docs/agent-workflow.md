# Healthfolio — Agent Workflow

## Overview

Healthfolio uses a controlled agent loop to process medical documents. The agent is not an autonomous AI — it is a state machine that selects tools from a predefined allowlist, validates all inputs and outputs through Zod schemas, and pauses for human review whenever confidence is insufficient.

This document describes how the agent processes a medical document from upload to verified outcome.

## The Workflow: Goal → Observe → Decide → Act → Evaluate → Adapt → Outcome

### Goal

The user uploads a medical document and wants it organized, with verified information added to their health timeline and tracking.

### Observe

The agent inspects the uploaded file and its context:

| Observation | What the Agent Checks |
|---|---|
| File type | PDF, PNG, JPEG, or WEBP |
| File size | Within allowed limits (10 MB) |
| Text layer | Does the PDF contain extractable text? |
| Image quality | Is the scan clear enough for OCR? |
| Page orientation | Is the document rotated? |
| Existing context | Has this document been processed before? |
| Consent status | Has the user consented to AI processing? |

### Decide

Based on observations, the agent selects the appropriate tool:

| Condition | Tool Selected |
|---|---|
| PDF with text layer | `document.extract` (native PDF extraction) |
| Scanned PDF or image | `document.extract` (OCR pipeline) |
| Rotated image | Orientation correction → retry OCR |
| Low confidence | `clarification.request` (pause for user review) |
| Unclear document type | `clarification.request` |
| Already processed | Skip or `document.replace` if user requests |

### Act

The selected tool performs a real side effect:

1. **Text extraction** — PDF text is extracted page by page, or Tesseract.js processes the image
2. **Classification** — The AI classifies the document (prescription, lab report, discharge summary, etc.)
3. **Structured extraction** — The AI extracts dates, measurements, medicines, diagnoses, and instructions
4. **Evidence storage** — Every extracted fact stores its source document ID, page number, and evidence text
5. **Confidence scoring** — Each fact receives a confidence score

### Evaluate

The agent verifies the tool output:

| Check | What Happens |
|---|---|
| Zod schema validation | Invalid structured output is rejected |
| Confidence threshold | Facts below the threshold are flagged for review |
| Evidence presence | Every fact must have a source document and page |
| Unit and date validity | Units must be recognized; dates must be parseable |
| Contradictions | Conflicting values within the same document are flagged |
| Medical safety | Diagnosis, prescription, and dose actions are impossible |

### Adapt

When evaluation reveals problems:

| Problem | Adaptation |
|---|---|
| OCR confidence too low | Correct orientation, retry OCR |
| Structured output invalid | At most one repair attempt; then fail |
| Value uncertain | Pause in `REVIEW_REQUIRED` state |
| User corrects a value | Store correction with revision history |
| External source timeout | Retry with backoff; safe error if persistent |
| Document type unclear | Request user clarification |

### Outcome

After successful processing:

- The document is organized in the correct category
- Verified measurements are added to Health Tracking
- Timeline events are generated with source citations
- The source evidence page is accessible from every extracted fact
- The activity timeline shows safe, concise summaries of what happened

## Agent States

```
INTAKE
  ↓
INGEST
  ↓
EXTRACT
  ↓
REVIEW_REQUIRED (if confidence below threshold)
  ↓ (user confirms/corrects)
PLAN
  ↓
EXECUTE
  ↓
VERIFY
  ↓
ADAPT (if verification fails)
  ↓ (retry or adjust)
COMPLETE | BLOCKED
```

### State Descriptions

| State | Description |
|---|---|
| `INTAKE` | Agent receives the document and user goal |
| `INGEST` | File is validated, stored, and prepared for processing |
| `EXTRACT` | Text extraction and OCR run; structured data is produced |
| `REVIEW_REQUIRED` | Agent pauses; uncertain facts need user confirmation |
| `PLAN` | Agent plans the next action based on extraction results |
| `EXECUTE` | Selected tool runs (classification, measurement storage, etc.) |
| `VERIFY` | Agent checks that the tool output is valid and complete |
| `ADAPT` | Agent adjusts strategy after a failed verification |
| `COMPLETE` | All processing finished successfully |
| `BLOCKED` | Agent cannot proceed; needs user intervention or external fix |

## Tool Allowlist

Every tool call must pass these validations:

1. **Allowlist check** — Only registered tools can be invoked
2. **State permission** — The tool is allowed in the current agent state
3. **Input validation** — Tool input passes Zod schema validation
4. **Output validation** — Tool output passes Zod schema validation
5. **Ownership validation** — The tool operates only on the current user's data
6. **Retry limit** — Each tool has a maximum retry count (default: 3)
7. **Step limit** — The agent run has a maximum step count (configurable via `AGENT_MAX_STEPS`)
8. **Timeout** — Individual tool calls have configurable timeouts

## Persistent State

Agent state is persisted to the database after every step:

- **agent_runs** table: stores the current state, goal, document ID, and run status
- **agent_steps** table: stores each step's state, tool, input, output, and result

This means:
- If the browser refreshes, the agent can resume from the last persisted state
- If the server restarts, the agent run continues from where it left off
- If the user navigates away, the agent keeps processing in the background

## Human Review

When the agent enters `REVIEW_REQUIRED`:

1. The UI shows the uncertain fact alongside its source page
2. The user can view the original document evidence
3. The user can:
   - **Confirm** the value as correct
   - **Correct** the value (the correction is stored with revision history)
   - **Reject** the value (excluded from Health Tracking and Timeline)
4. After the user acts, the agent resumes from its persistent state

The agent never makes assumptions about uncertain values. It does not silently accept low-confidence extractions.

## Failure Recovery

| Failure | Recovery |
|---|---|
| OCR fails | Retry with orientation correction |
| AI returns invalid JSON | One repair attempt; then fail with safe message |
| AI timeout | Retry with backoff; report timeout after max retries |
| Database write fails | Safe error message; no partial state persisted |
| User cancels mid-processing | Agent stops; partial results preserved |
| Browser disconnects | Agent continues server-side; UI resumes on reconnect |
| Ollama unavailable | Safe error message; processing pauses until available |

## Idempotency

- Re-uploading the same file does not create duplicate documents (detected by file hash)
- Retrying the same agent step does not create duplicate effects
- User confirmation of the same value is a no-op
- Export requests return the same result without duplication

## Evidence Traceability

Every extracted fact in Healthfolio traces back to:

```
Fact in UI
  → Extraction record (database)
    → Source document ID
      → Source page number
        → Evidence text (exact excerpt)
          → Original file in private storage
```

This chain is unbroken. No fact exists without evidence. No evidence exists without a source document.

## Medical Safety in the Agent

The agent is designed to be incapable of:

- Prescribing medicine
- Recommending treatment
- Calculating doses
- Diagnosing conditions
- Determining whether a missed dose should be taken
- Claiming a user is medically non-adherent
- Changing or interpreting a prescribed dose

These are not just UI-level restrictions — they are enforced at the tool registry level. No registered tool can perform medical actions. The agent state machine cannot reach a state where medical actions are possible.

## Activity Timeline

The agent's processing is visible to the user through an activity timeline that shows safe summaries:

- "Processed document upload"
- "Extracted text from 3 pages"
- "Classified document as laboratory report"
- "Extracted 12 structured values"
- "5 values verified, 2 require review"
- "Requested verification for uncertain result"
- "Resumed processing after verification"
- "Updated Health Tracking with verified measurements"

Hidden chain-of-thought, raw prompts, and internal reasoning are never displayed.
