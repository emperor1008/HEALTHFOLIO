# Healthfolio — Product Walkthrough Script

**Target duration:** 4 minutes 15 seconds
**Presenter:** Solo demonstration
**Environment:** Local development with Ollama running, Supabase connected, non-sensitive test document ready

---

## 0:00–0:25 — Problem

> Medical records are scattered. Prescriptions sit in pharmacy bags. Lab reports arrive as printouts. Discharge summaries get filed in drawers. When you visit a specialist, you either carry a stack of papers or describe your history from memory. Important details get lost, questions go unasked, and tests get repeated because no one can find the previous results.
>
> The problem isn't that records don't exist — it's that they're not organized, not connected, and not available when you need them most.

**Screen:** Show a desktop with scattered files — a PDF prescription, a photo of a lab report, a Word document discharge summary. Do not show any real patient information.

---

## 0:25–0:45 — Healthfolio Introduction

> Healthfolio is a personal health-record platform that organizes your medical documents, extracts verified information, tracks health trends, and helps you prepare for informed healthcare conversations.
>
> It runs locally on your machine with Ollama for AI processing. Your documents stay private — nothing leaves your computer except the Supabase database, which uses anonymous sessions and row-level security.

**Screen:** Open Healthfolio at localhost:3000. Show the marketing landing page with "Turn scattered medical records into one clear health story."

---

## 0:45–1:05 — User Goal

> Let me show you what it looks like to organize a medical record. I'll upload a lab report and let Healthfolio process it.

**Screen:** Click "Create my Healthfolio" or navigate to the dashboard. Show the welcome page with "Start your Healthfolio." Click "Add medical record."

> The welcome screen greets me and offers to add my first record. I'll click "Add medical record" to start.

---

## 1:05–1:35 — Agent Decision and Action

> I'm selecting a non-sensitive lab report from my test files. Healthfolio uploads it to private storage and starts the agent.

**Screen:** Show the upload process. File is selected, upload progress bar, then the agent run page appears.

> The agent inspects the file. It detects a text PDF — no OCR needed. It extracts text from each page, classifies the document as a laboratory report, and begins structured extraction.

**Screen:** Show the agent activity timeline with steps appearing in sequence:
- "Processed document upload"
- "Extracted text from 1 page"
- "Classified document as laboratory report"
- "Extracted structured values"

> Notice the activity panel — each step is visible. The agent selects tools from a predefined allowlist. It cannot prescribe medicine, calculate doses, or diagnose conditions. Those actions are architecturally impossible.

---

## 1:35–2:10 — Evaluation

> After extraction, the agent evaluates every value. Some are confident — they pass automatically. Others fall below the verification threshold and require my review.

**Screen:** Show the review page with extracted values. Show the confidence indicators. Highlight one value that requires review.

> Here's a blood glucose result. The agent extracted the value, the unit, and the reference range — all from the document. But confidence is below the threshold, so it's asking me to verify.

**Screen:** Show the source evidence — the exact page and text excerpt where the value was found.

> I can see the source page right here. The evidence links directly to the original document. This isn't the AI making things up — it's pointing to exactly where it found the information.

---

## 2:10–2:40 — Adaptation

> I'll confirm this value. The agent stores my confirmation with a revision history entry and resumes processing.

**Screen:** Click "Confirm" on the uncertain value. Show the agent resuming.

> If I had found an error, I could correct it. The correction would be stored with the original value preserved — nothing is silently overwritten.

> If the OCR had been unclear — say, a rotated scan — the agent would have detected the low confidence, corrected the orientation, and retried automatically. The activity timeline would show: "Corrected page orientation and retried extraction."

**Screen:** Show the agent completing. Status changes to "Complete."

---

## 2:40–3:10 — Verified Outcome

> The document is now organized. Let me check the results.

**Screen:** Navigate to Records → show the document in the list with category "Laboratory Report."

> The document appears in my records with the correct category and date.

**Screen:** Navigate to Health Tracking → show the graph with the newly added measurement.

> My verified measurement appears in Health Tracking. The graph shows only confirmed values — rejected and unverified data points are excluded.

**Screen:** Click on a data point → show source evidence drawer.

> Every data point traces back to its source document and page. I can open the original evidence at any time.

---

## 3:10–3:40 — Ask Healthfolio

> Let me ask Healthfolio a question about what I just uploaded.

**Screen:** Navigate to Ask Healthfolio. Type "What are my latest blood test results?"

> Healthfolio searches my verified records and returns the results with source citations.

**Screen:** Show the response with the answer and evidence links.

> Now let me try a misspelling. "What is hemoglobine alc?"

**Screen:** Type the misspelled query. Show the correction.

> The system corrects "hemoglobine alc" to "HbA1c" — Hemoglobin A1c. It shows the correction transparently: "You searched for 'hemoglobine alc'." If I had uploaded an HbA1c result, it would show my verified value with the source evidence.

**Screen:** Show the medicine lookup. Type "What is metformine?"

> Similarly, "metformine" corrects to "Metformin" using RxNorm authoritative data. The system doesn't guess — it uses verified drug databases.

---

## 3:40–4:05 — Architecture

> Behind the scenes, Healthfolio uses a controlled agent architecture. The agent controller is a persistent state machine — it stores its state after every step, so if I refresh the browser or the server restarts, processing resumes from where it left off.

> All AI processing runs locally through Ollama — no medical data is sent to external cloud services. The models used are qwen2.5:3b for extraction and classification, qwen3:8b for conversational queries, and nomic-embed-text for similarity matching.

> Documents are stored in a private Supabase bucket with user-scoped paths. Row-level security ensures that one user can never access another user's data. Signed URLs expire after one hour — there are no permanent public links.

> Every extracted fact links to its source document and page. The agent cannot prescribe, diagnose, or calculate doses — those capabilities are not in the tool registry.

---

## 4:05–4:15 — Closing

> Healthfolio organizes medical information and helps you prepare for healthcare conversations. It does not diagnose conditions, recommend treatment, or replace a healthcare professional. Every fact is evidence-backed, every uncertain value requires your confirmation, and your data stays private on your own machine.

> That's Healthfolio.

---

## Recording Checklist

Before recording, verify:

- [ ] Notifications are hidden (Do Not Disturb)
- [ ] Environment files are not visible on screen
- [ ] Using a non-sensitive, redacted medical document (no real patient data)
- [ ] No personal information is visible in the browser
- [ ] Ollama is running (`ollama serve`)
- [ ] Supabase project is accessible (check Settings page)
- [ ] Browser console has no errors
- [ ] Application is at the correct starting route
- [ ] Screen recording resolution is at least 1080p
- [ ] Text is readable at the recording resolution
- [ ] No unexplained waiting periods (trim dead air)
- [ ] Agent activity timeline is visible during processing
- [ ] Real failure recovery is shown if possible (e.g., low-confidence review)
- [ ] Source evidence drawer is opened at least once
- [ ] Ask Healthfolio correction is demonstrated
- [ ] Closing statement matches the medical-safety boundary

## Sensitive Data Handling

- Use only test documents with invented or redacted values
- Never show real patient names, dates of birth, or medical record numbers
- Blur or redact any accidental personal information
- Do not commit test documents to the repository
- Do not show database contents with real data
