# Healthfolio — Technical Q&A

## 1. What problem does Healthfolio solve?

Medical records are scattered across paper, phone photos, email attachments, and hospital portals. When a patient visits a specialist, they either carry physical documents or describe their history from memory. Healthfolio organizes these scattered records into a verified timeline, extracts structured information from documents, tracks health trends over time, and helps users prepare for healthcare conversations with evidence-backed summaries.

## 2. Why is an agent needed instead of a single AI call?

Medical document processing requires sequential decisions that depend on outcomes. A single AI call cannot:

1. Determine whether a file is a text PDF or scanned image
2. Choose the correct extraction method (PDF parsing vs OCR)
3. Evaluate extraction confidence and decide whether to retry
4. Handle orientation correction for rotated scans
5. Pause for human review when uncertain
6. Resume processing after user confirmation

An agent architecture handles this variety and uncertainty through explicit states, tool selection, evaluation gates, and human review checkpoints.

## 3. Why is this not a basic chatbot?

A chatbot generates text responses. Healthfolio's agent:

- Selects tools from a predefined allowlist
- Validates all inputs and outputs through Zod schemas
- Performs real side effects (file extraction, database writes, state transitions)
- Evaluates confidence before accepting results
- Pauses for human review when uncertain
- Persists state across browser refreshes and server restarts
- Cannot perform actions not in the tool registry (e.g., medical actions)

The agent is a state machine, not a conversational AI. Ask Healthfolio is the conversational layer, and it too has safety boundaries.

## 4. How does the agent select tools?

The agent controller maintains a registry of allowed tools in `src/lib/tools/tool-names.ts`. Each tool specifies:

- Input Zod schema
- Output Zod schema
- Which agent states permit the tool
- Timeout and retry configuration

When the agent reaches a decision point, it evaluates the current state and available information, then selects exactly one tool. The selection is validated against the allowlist before execution. Unknown tools and tools called from invalid states are rejected.

## 5. How does OCR work?

Healthfolio uses Tesseract.js for optical character recognition:

1. **Input:** A PNG, JPEG, or WEBP image (or a scanned PDF converted to images)
2. **Processing:** Tesseract.js runs in a web worker with English language data
3. **Output:** Extracted text with per-word and per-line confidence scores
4. **Quality gate:** If average confidence falls below the configured threshold, the agent retries with orientation correction or requests user review

OCR runs server-side through the document processing pipeline. The browser does not directly invoke Tesseract.js for document processing.

## 6. How are uncertain values handled?

When an extracted value has confidence below the configured threshold (`EXTRACTION_CONFIDENCE_THRESHOLD`):

1. The agent pauses in `REVIEW_REQUIRED` state
2. The UI shows the uncertain value alongside its source page
3. The user can view the original document evidence
4. The user confirms, corrects, or rejects the value
5. Corrections are stored with revision history (original value preserved)
6. The agent resumes from its persistent state

Uncertain values are never silently accepted. They are never added to Health Tracking until the user confirms them.

## 7. How does the system prevent hallucinated medical data?

Multiple safeguards:

- **Zod validation:** Every AI output must match a strict schema. Invalid responses are rejected.
- **Evidence requirement:** Every extracted fact must have a source document ID, page number, and evidence text. Facts without evidence are rejected.
- **Confidence threshold:** Values below the threshold require user confirmation.
- **Tool registry:** Medical actions (diagnosis, prescription, dose calculation) are not in the tool registry. The agent cannot perform them.
- **Safety boundary:** The system prompt instructs the AI to never invent medical information.
- **User review:** The user sees the source evidence and can reject any incorrect extraction.
- **No fabrication:** Empty states are truthful. Failed requests show error messages, not fake data.

## 8. How is personal data isolated?

- **Anonymous sessions:** Each user gets a unique anonymous Supabase identity
- **Row-level security:** Every database table has RLS policies that check `auth.uid()`
- **Private storage:** Documents are stored in user-scoped paths (`{user_id}/{document_id}/`)
- **Signed URLs:** Document previews use short-lived expiring tokens (1 hour)
- **No cross-user queries:** All API routes query using the authenticated user's session
- **No service-role in browser:** Administrative keys never reach the browser

## 9. What is Supabase RLS?

Row-Level Security (RLS) is a PostgreSQL feature that filters rows based on the current database user. In Healthfolio:

- Every user-data table has `ENABLE ROW LEVEL SECURITY`
- Policies check `auth.uid()` to ensure the current user can only access their own rows
- SELECT, INSERT, UPDATE, and DELETE policies are defined for each table
- Even if an API route has a bug, RLS prevents cross-user data access at the database level

## 10. Why is Ollama used instead of cloud AI?

- **Privacy:** Medical data never leaves the local machine for AI processing
- **Cost:** No API fees for document processing
- **Offline capability:** Core features work without internet (except Supabase sync)
- **Control:** No dependency on external AI service availability or pricing changes
- **Models:** qwen2.5:3b and qwen3:8b run locally on consumer hardware

## 11. Which models are used?

| Model | Size | Purpose |
|---|---|---|
| `qwen2.5:3b` | 3B parameters | Document classification, structured extraction, intent classification |
| `qwen3:8b` | 8B parameters | Ask Healthfolio conversational chat |
| `nomic-embed-text` | — | Text embeddings for similarity search |

## 12. What happens when Ollama fails?

- **Ollama stopped:** The AI check (`npm run ai:check`) reports failure. In-app queries show "AI service unavailable. Please ensure Ollama is running."
- **Model not found:** The system reports which model is missing and suggests the pull command
- **Timeout:** After `AI_REQUEST_TIMEOUT_MS` milliseconds, the request fails with a safe error message
- **Malformed response:** One repair attempt is made; if it fails, the request is rejected with a safe error
- **No data loss:** Failed AI requests do not corrupt existing data

## 13. What happens when OCR confidence is low?

The agent detects low confidence through the OCR output scores. It then:

1. Attempts orientation correction (if the image appears rotated)
2. Retries OCR with corrected orientation
3. If confidence remains below the threshold, pauses for user review
4. The user sees the source image and extracted text side by side
5. The user confirms, corrects, or rejects the extraction

## 14. How are agent states persisted?

Each agent run is stored in the `agent_runs` table with:
- Current state
- User goal
- Document ID
- Run status (running, complete, blocked, failed)

Each step is stored in the `agent_steps` table with:
- State before the step
- Tool selected
- Input parameters
- Output result
- Execution status

After every step, the database is updated before the agent proceeds. This means:
- Browser refresh → resume from last persisted state
- Server restart → resume from last persisted step
- Network interruption → agent continues server-side

## 15. How does the system resume after interruption?

When a user returns to an agent run page:
1. The UI reads the current state from the database
2. If the agent is still processing, it shows the live activity
3. If the agent was interrupted, it shows the last completed step
4. The user can trigger a retry or continue from the persisted state

No work is lost. No steps are repeated unnecessarily.

## 16. How are medicine facts verified?

Medicine information comes from authoritative sources:
- **RxNorm/RxNav:** Drug identity, formulation, and ingredient matching
- **DailyMed:** Official drug labels and descriptions
- **openFDA:** Additional drug information

The AI may simplify retrieved information for user comprehension, but it may not generate:
- Dose recommendations
- Age-specific dosing
- Treatment recommendations
- Diagnosis from medicine history

## 17. Why does Healthfolio not diagnose?

Healthfolio is a record-organization and preparation tool. It:
- Extracts information from documents
- Organizes records chronologically
- Compares values against printed reference ranges
- Tracks verified measurements over time
- Explains authoritative medicine information

It does not:
- Identify conditions from test results
- Correlate symptoms with diseases
- Recommend treatment
- Determine whether a result is "good" or "bad" in a clinical context
- Replace a healthcare professional's judgment

## 18. How are API keys protected?

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the publishable anonymous key — intended for browser use, protected by RLS
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — never imported into client components
- `AI_PROVIDER`, `OLLAMA_BASE_URL`, and model names are server-only
- `APP_ENCRYPTION_KEY` is server-only
- The `npm run secrets:scan` script checks for accidentally committed credentials
- `.env.local` is in `.gitignore` and must never be committed

## 19. What are the current limitations?

- **Local AI only:** Requires Ollama running locally; no cloud AI fallback
- **OCR quality:** Depends on document image resolution and scan quality
- **English only:** No multi-language support
- **No EHR integration:** No live connection to electronic health records
- **No real-time chat:** No clinician communication channel
- **Single user role:** Patient/caregiver only
- **No offline processing:** Document processing requires server connectivity
- **Background notifications:** Require Web Push configuration
- **Storage bucket creation:** Requires service-role key or manual Supabase Dashboard setup

## 20. What would be upgraded for public production?

- **Cloud AI option:** Add cloud AI provider (OpenAI, Anthropic) as fallback when Ollama is unavailable
- **Multi-language OCR:** Support Hindi, Odia, and other regional languages
- **EHR integration:** HL7 FHIR integration for electronic health records
- **Real-time clinician chat:** Secure messaging with healthcare providers
- **Mobile app:** Native iOS/Android with offline document capture
- **Push notifications:** Background Web Push for medication reminders
- **Multi-user roles:** Clinician, pharmacist, and caregiver roles
- **HIPAA compliance:** Audit logging, encryption at rest, BAA with Supabase
- **Document versioning:** Track document revisions and corrections
- **Batch processing:** Upload and process multiple documents simultaneously
