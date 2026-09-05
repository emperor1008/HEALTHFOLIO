# Healthfolio — Problem and Solution Brief

## Problem Statement

Millions of patients navigate fragmented healthcare journeys with no single, reliable source of truth for their medical records. Prescriptions sit in pharmacy bags, lab reports arrive as printouts, discharge summaries get filed in desk drawers, and imaging CDs collect dust. When a patient visits a new specialist, they either carry a stack of papers or simply describe their history from memory — leading to incomplete consultations, repeated tests, and missed connections between conditions, medications, and results.

## Target Users

- Patients managing chronic conditions who see multiple specialists
- Caregivers organizing records for family members
- Individuals preparing for a medical consultation and wanting to present their history clearly
- Anyone transitioning between healthcare providers or insurance plans

## Current Workflow Friction

| Step | Current Reality |
|---|---|
| Finding records | Scattered across paper, phone photos, email attachments, hospital portals |
| Organizing records | Manual folder creation, inconsistent naming, no timeline |
| Extracting information | Re-reading dense lab reports, interpreting abbreviations, tracking reference ranges |
| Preparing for consultation | Writing notes from memory, forgetting questions, missing recent results |
| Tracking health trends | No systematic way to compare values across visits |

## Why Ordinary Document Storage Is Insufficient

Cloud storage and note-taking apps preserve files but do not understand them. A scanned lab report is an image, not a data point. A prescription PDF is a file, not a medication schedule. The gap between *storing* a document and *understanding* its contents requires intelligent extraction, structured organization, and evidence-backed presentation — capabilities that generic tools do not provide.

## Why Autonomous Multi-Step Decision-Making Is Necessary

Medical document processing requires sequential decisions that depend on outcomes:

1. Is this a text PDF or a scanned image? → Choose extraction method.
2. Did OCR succeed with sufficient confidence? → Accept or retry with orientation correction.
3. Are extracted values verified against reference ranges printed on the report? → Mark as verified or request review.
4. Does this prescription match an existing medicine record? → Link or create new entry.

No single AI call can reliably perform this entire chain. An agent architecture — with explicit states, tool selection, evaluation gates, and human review checkpoints — is necessary to handle the variety and uncertainty of real medical documents.

## Healthfolio Solution

Healthfolio is an intelligent personal health-record platform that securely organizes medical documents, extracts verifiable information, tracks health trends, and helps users prepare for informed healthcare conversations.

### Core Capabilities

- **Secure Document Ingestion** — Upload PDFs, prescriptions, lab reports, and scan images with validation, private storage, and duplicate detection
- **Intelligent Extraction** — AI-powered OCR and structured extraction with confidence scoring and evidence locators
- **Verified Health Timeline** — Chronological events with source citations and verification status
- **Health Tracking** — Track verified measurements over time with graphs and trend indicators
- **Medicine Intelligence** — Look up authoritative medicine information from official sources
- **Medication Routine** — Convert verified prescriptions into user-confirmed reminder schedules
- **Test Report Intelligence** — Understand lab results with reference ranges and verification status
- **Ask Healthfolio** — Conversational assistant that answers questions using verified records with citations
- **Consultation Brief** — Appointment-focused summary with verified events, questions, and checklist
- **Agentic Processing** — Observable agent loop with explicit states, tool allowlist, and failure recovery

## Expected Impact

- **Reduced preparation time** — From hours of manual organization to minutes of guided upload
- **Better-informed consultations** — Patients present verified facts rather than vague recollections
- **Trend visibility** — Health measurements are tracked and graphed automatically
- **Medication clarity** — Prescription instructions are structured and reminder-enabled
- **Reduced duplicate testing** — Prior results are organized and accessible

## Medical-Safety Boundaries

Healthfolio enforces strict boundaries to ensure patient safety:

- **Never prescribes** — No medicine recommendations, dose calculations, or treatment suggestions
- **Never diagnoses** — No condition identification from medicine history or test results
- **Never shames** — Missed medications are handled without judgment or moral language
- **Always evidences** — Every extracted fact links to its source document and page
- **Always confirms** — Uncertain extractions require user review before entering the verified timeline
- **Always disclaims** — Clear statements that Healthfolio is not a medical professional

## Privacy Safeguards

- **Anonymous sessions** — No personal email required to start; anonymous Supabase authentication
- **Private storage** — Documents stored in user-scoped private buckets with no public URLs
- **Row-level security** — Database policies prevent cross-user access at the database level
- **Signed URLs** — Document previews use short-lived expiring tokens
- **Server-side AI** — AI processing occurs on the server; API keys never reach the browser
- **No medical data in logs** — Audit events are redacted; raw medical text is never logged
- **Local AI** — Ollama runs locally; no medical data is sent to external cloud AI services
- **Consent enforcement** — AI processing requires explicit user consent before document analysis

## Current Limitations

- Requires Ollama running locally for AI features (no cloud AI fallback)
- OCR quality depends on document image resolution and scan quality
- No live EHR integration or real-time clinician communication
- No multi-language support beyond English
- Background push notifications require Web Push configuration
- Single user role (patient/caregiver)
- No offline document processing
