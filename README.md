# Healthfolio

**Your health history, clearly organized.**

An intelligent personal health-record platform that securely organizes medical documents, extracts verifiable information, tracks health trends, and helps users prepare for informed healthcare conversations.



---

## What is Healthfolio?

Healthfolio is a responsive web application that helps patients organize scattered medical records — prescriptions, lab reports, discharge summaries, and scan images — into a verified chronological timeline. It extracts structured information using local AI, tracks health trends over time, manages medication routines, and prepares users for upcoming appointments with evidence-backed consultation briefs.

### Core Features

- **Secure Document Upload** — PDF, PNG, JPEG, WEBP with validation, private storage, and duplicate detection
- **Real OCR** — Tesseract.js for images, pdf-parse for text PDFs, scanned-PDF image fallback
- **Local AI Processing** — Ollama-powered document classification and structured extraction
- **Confidence Review** — Every extracted fact shows confidence level; uncertain items require user confirmation
- **Verified Health Timeline** — Chronological events with source citations and verification status
- **Health Tracking** — Track verified measurements over time with graphs, trends, and time-range filtering
- **Test Report Intelligence** — Understand lab results with reference ranges, abnormal flags, and verification status
- **Medicine Intelligence** — Look up authoritative medicine information from RxNorm, DailyMed, and openFDA
- **Medication Routine** — Convert verified prescriptions into user-confirmed reminder schedules
- **Agentic Processing** — Observable agent loop with explicit states, tool allowlist, and failure recovery
- **Ask Healthfolio** — Conversational assistant with typo correction, medicine/test name matching, and record citations
- **Consultation Brief** — Appointment-focused summary with verified events, questions, and checklist
- **PDF Export** — Download a professional consultation brief as PDF
- **Calendar Export** — Download a standards-compliant `.ics` calendar event
- **Privacy First** — Private storage, row-level security, signed URLs, anonymous sessions, local AI

### Medical Safety Boundary

Healthfolio organizes medical information and helps you prepare for consultations. **It does not diagnose conditions, recommend treatment, prescribe medicine, calculate doses, or replace a healthcare professional.**

---

## Public Showcase

A polished, static product website is published to GitHub Pages:

> **https://emperor1008.github.io/HEALTHFOLIO/**

### What GitHub Pages hosts — and what it does not

- Pages serves **only** the static files in `showcase/` (plain HTML/CSS/SVG, no application code, no backend).
- It **never** serves the Next.js application, `.next` output, API routes, database migrations, environment files, or test code.
- No Supabase credentials, service-role keys, tokens, or environment values are referenced by the showcase or embedded in its assets.
- The secure, server-backed application (records, offline queue, triage, care coordination, pharmacy console) requires a real application deployment with a configured Supabase project; it is intentionally not exposed from GitHub Pages. The showcase shows a truthful "Secure application deployment is being prepared" label instead of a fake app link.

### How deployment works

- Workflow: `.github/workflows/deploy-pages.yml`
- Trigger: every push to `main` (and manual `workflow_dispatch`).
- On each run the workflow verifies the whole repository first — secrets scan (`npm run secrets:scan`), lint (`npm run lint`), typecheck (`npm run typecheck`), unit tests (`npm test`), and the production build (`npm run build`) — and publishes `showcase/` to Pages **only if every step passes**.
- Deploys use the official actions (`actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`) with least-privilege permissions (`contents: read`, `pages: write`, `id-token: write`), Node.js 20 with npm caching, and a `pages` concurrency group so an older deployment can never overwrite a newer one.

### One-time repository setting

GitHub Pages must be pointed at the workflow once:

1. Open the repository on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Done. Every subsequent push to `main` verifies and redeploys automatically; CI status for each run is visible under the repository's **Actions** tab.

If the site 404s after the first successful run, confirm this setting was applied and the workflow completed under **Actions**.

---

## Local Setup

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works) with Anonymous Sign-In enabled
- [Ollama](https://ollama.com) installed locally

### 1. Clone and install

```bash
git clone https://github.com/emperor1008/HEALTHFOLIO.git
cd healthfolio
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your own values (see `.env.example` for all available variables):

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TEXT_MODEL=qwen2.5:3b
OLLAMA_CHAT_MODEL=qwen3:8b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
AI_REQUEST_TIMEOUT_MS=120000
```

**Never commit `.env.local`.** It is already in `.gitignore`.

### 3. Install Ollama models

```bash
ollama pull qwen2.5:3b
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

Start the Ollama service if it isn't running:

```bash
ollama serve
```

### 4. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Authentication → Providers** and enable **Anonymous** sign-in
3. Open the SQL Editor and run each migration in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_storage_bucket.sql`
   - `supabase/migrations/003_add_audit_policy_and_constraints.sql`
   - `supabase/migrations/004_performance_indexes.sql`
   - `supabase/migrations/005_portfolio_unique_constraint.sql`
   - `supabase/migrations/006_medical_measurements.sql`
   - `supabase/migrations/007_measurement_review_rpc.sql`
   - `supabase/migrations/008_document_organization.sql`
   - `supabase/migrations/009_medicine_intelligence.sql`
   - `supabase/migrations/010_test_report_intelligence.sql`
   - `supabase/migrations/011_smart_document_capture.sql`
   - `supabase/migrations/012_storage_webp_support.sql`
   - `supabase/migrations/013_medication_routine_agent.sql`
4. Go to **Authentication → URL Configuration** and add redirect URLs:
   ```
   http://localhost:3000/auth/callback
   http://localhost:3000/update-password
   http://localhost:3000/**
   ```

> **Note:** Migration 002 creates the private `documents` storage bucket. If it requires elevated permissions, create the bucket manually in the Supabase Dashboard under **Storage** with the name `documents`, set it to private, and add the policies from the migration file.

### 5. Start the development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). A silent anonymous session is created automatically on first visit.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run Vitest unit tests (491 tests) |
| `npm run test:e2e` | Run Playwright E2E tests (app-shell suite on port 3100) |
| `npm run format` | Format with Prettier |
| `npm run secrets:scan` | Scan tracked files for committed secrets |
| `npm run ai:check` | Verify Ollama connectivity and model availability |
| `npm run verify:all` | Run full verification suite |

---

## Architecture

### Tech Stack

- **Framework:** Next.js 14 App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **Animation:** Framer Motion
- **Validation:** Zod
- **Auth:** Supabase Auth (anonymous sign-in, with email/password available)
- **Database:** Supabase PostgreSQL with Row-Level Security
- **Storage:** Supabase private bucket with signed URLs
- **AI:** Ollama (local, zero-cost) through provider adapter
  - `qwen2.5:3b` — Document classification and structured extraction
  - `qwen3:8b` — Ask Healthfolio conversational chat
  - `nomic-embed-text` — Text embeddings for similarity search
- **OCR:** Tesseract.js for images, pdf-parse for text PDFs
- **PDF Export:** jsPDF with jspdf-autotable
- **Calendar:** ics library
- **Testing:** Vitest + React Testing Library + Playwright

### Project Structure

```
healthfolio/
├── src/
│   ├── app/                # Next.js App Router pages and API routes
│   │   ├── (marketing)/    # Public landing page
│   │   ├── (auth)/         # Sign-up, sign-in, password reset
│   │   ├── (app)/          # Authenticated app pages
│   │   │   ├── dashboard/  # Home dashboard
│   │   │   ├── records/    # Medical records and reports
│   │   │   ├── timeline/   # Verified health timeline
│   │   │   ├── health-tracking/  # Measurement tracking and graphs
│   │   │   ├── medicines/  # Medicine intelligence
│   │   │   ├── routine/    # Medication routine plans
│   │   │   ├── ask/        # Ask Healthfolio chat
│   │   │   ├── review/     # Extraction review queue
│   │   │   ├── preparation/ # Consultation preparation
│   │   │   ├── runs/       # Agent run detail
│   │   │   └── settings/   # Account and settings
│   │   ├── auth/           # Session bootstrap, callback
│   │   └── api/            # Server API routes
│   ├── components/         # React components
│   ├── lib/                # Core business logic
│   │   ├── agent/          # Agent controller and state machine
│   │   ├── ai/             # AI provider adapter (Ollama), schemas, safety
│   │   ├── assistant/      # Ask Healthfolio: intent router, normalizer, matchers
│   │   ├── documents/      # Document ingestion and OCR pipeline
│   │   ├── measurements/   # Health measurement extraction and tracking
│   │   ├── medicines/      # Medicine intelligence (RxNorm, DailyMed, openFDA)
│   │   ├── reports/        # Test report intelligence
│   │   ├── routines/       # Medication routine agent
│   │   ├── tools/          # Tool registry and allowlist
│   │   └── supabase/       # Supabase client configuration
│   └── types/              # TypeScript type declarations
├── supabase/
│   └── migrations/         # SQL database migrations (001–013)
├── scripts/                # Build and verification scripts
├── tests/                  # Unit and integration tests (491 tests)
├── docs/                   # Technical documentation
└── public/                 # Static assets
```

### Agent Loop

Healthfolio uses a controlled agent loop:

```
INTAKE → INGEST → EXTRACT → REVIEW_REQUIRED → PLAN
       → EXECUTE → VERIFY → ADAPT → COMPLETE | BLOCKED
```

The agent maintains user goal and explicit state, selects actions from a server-controlled tool allowlist, validates all inputs and outputs, detects failures and uncertainty, resumes after user resolves blocked steps, and stops after configurable maximum steps.

### Allowed Tools

All tool names are defined in a single authoritative source (`src/lib/tools/tool-names.ts`):

| Tool | Purpose |
|---|---|
| `document.ingest` | Process newly uploaded documents |
| `document.extract` | Extract structured data from documents |
| `document.replace` | Replace a document with clearer copy |
| `timeline.build` | Build verified health timeline |
| `clarification.request` | Request user review or correction |
| `brief.generate` | Generate consultation preparation brief |
| `checklist.generate` | Generate preparation checklist |
| `reminder.create` | Create appointment reminder |
| `calendar.export_ics` | Export calendar event |
| `pdf.export` | Export brief as PDF |

---

## Security

- **Row-Level Security** enabled on every user-data table
- **Private storage** with user-scoped access policies
- **Signed URLs** for document access (no permanent public URLs)
- **Server-side AI** — API keys never exposed to browser
- **Input validation** — Zod schemas for all API inputs
- **File validation** — Extension, MIME type, size, and magic-byte signature verification
- **Account deletion** — Full data removal with typed confirmation
- **Password recovery** — Complete reset flow with resend cooldown
- **Consent enforcement** — Middleware-level consent check before app access
- **Agent allowlist** — Only registered tools can be invoked
- **Safety policy** — Blocks diagnosis, treatment, and medication changes
- **Redacted audit events** — No raw medical data in logs
- **No dummy data** — Empty states for new accounts
- **Secret scanning** — Run `npm run secrets:scan` before committing
- **Never commit credentials** — `.env.local` is gitignored and must never be pushed
- **Local AI** — Medical data stays on your machine; Ollama processes locally
- **Prompt injection protection** — User messages treated as untrusted data

---

## Environment Variables

| Variable | Description | Scope | Required |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Application URL | Public | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Public | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | **Server-only** | Optional* |
| `AI_PROVIDER` | AI provider (`ollama`) | Server-only | Yes |
| `OLLAMA_BASE_URL` | Ollama endpoint URL | Server-only | Yes |
| `OLLAMA_TEXT_MODEL` | Extraction model (`qwen2.5:3b`) | Server-only | Yes |
| `OLLAMA_CHAT_MODEL` | Chat model (`qwen3:8b`) | Server-only | Yes |
| `OLLAMA_EMBEDDING_MODEL` | Embedding model (`nomic-embed-text`) | Server-only | Optional |
| `AI_REQUEST_TIMEOUT_MS` | AI request timeout (ms) | Server-only | No |
| `OCR_PROVIDER` | OCR engine (`tesseract`) | Server-only | No |
| `OCR_LANGUAGES` | OCR languages | Server-only | No |
| `OCR_MIN_CONFIDENCE` | OCR confidence threshold | Server-only | No |
| `DOCUMENT_MAX_BYTES` | Max upload size | Server-only | No |
| `AGENT_MAX_STEPS` | Max agent steps | Server-only | No |
| `AGENT_MAX_RETRIES` | Max retries per step | Server-only | No |
| `EXTRACTION_CONFIDENCE_THRESHOLD` | Review threshold | Server-only | No |
| `APP_ENCRYPTION_KEY` | Encryption key | **Server-only** | Optional |

\* `SUPABASE_SERVICE_ROLE_KEY` is only needed for account deletion. Normal workflows use Row-Level Security with the anonymous session.

**Never prefix secret variables with `NEXT_PUBLIC_`.** Server-only keys must never appear in browser JavaScript bundles.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Ollama not responding | Run `ollama serve` and verify at http://127.0.0.1:11434 |
| Model not found | Run `ollama pull qwen2.5:3b` (or the configured model) |
| AI timeout | Increase `AI_REQUEST_TIMEOUT_MS` or ensure Ollama has sufficient memory |
| Session not persisting | Check Supabase redirect URLs include `http://localhost:3000/**` |
| Upload fails | Verify the `documents` storage bucket exists and is private |
| Database errors | Ensure all migrations (001–013) are applied in the Supabase SQL Editor |
| OCR returns empty text | Ensure image resolution is sufficient (at least 300 DPI recommended) |
| 406 errors on dashboard | Non-critical; caused by empty result on `.single()` queries |

---

## Testing

### Unit Tests

```bash
npm test
```

Tests cover:
- Medical safety boundaries
- Tool registry allowlist and state permissions
- AI output schema validation
- Ask Healthfolio intent classification, normalization, and matching
- ICS calendar generation
- Input validation
- OCR file signature validation
- Medicine intelligence lookups
- Measurement trend calculations
- Safe error mapping

### AI Live Check

```bash
npm run ai:check
```

Verifies:
- Ollama service is reachable
- Configured text model exists
- Configured chat model exists
- Configured embedding model exists
- Structured chat works
- Embedding generation works

### Secret Scanner

```bash
npm run secrets:scan
```

Scans all tracked files for likely API keys, connection strings, private keys, and hardcoded credentials. Run before every commit.

### Full Verification

```bash
npm run verify:all
```

Runs: secrets scan, lint, typecheck, unit tests, build, and AI check.

---

## Limitations

- AI features require Ollama running locally; **the core rural-care workflow (records, offline queue, triage, appointments, pharmacy availability) does NOT depend on AI availability**
- OCR quality depends on document image resolution and scan quality
- Interface languages: English, हिन्दी (Hindi), ଓଡ଼ିଆ (Odia); medical record content is never translated
- Background push notifications require Web Push configuration
- Storage bucket creation may require manual setup via Supabase Dashboard
- AI is not a medical professional

### Rural-care platform limitations (Parts 1–5)

- **Real participation required for live data.** Clinician queues, appointments, and pharmacy availability show honest empty states until genuine clinicians/pharmacy operators register and act. Nothing is simulated.
- **WebRTC video needs real infrastructure.** No TURN/STUN relay is configured by default, so peer-to-peer media cannot be guaranteed — especially on 2G/3G. Secure text and store-and-forward messaging are the dependable fallback paths, fully functional offline. Video/audio only via authorized, confirmed appointments.
- **Not a diagnostic or emergency-response system.** The deterministic triage engine sorts requests by broad urgency signals; it never diagnoses, prescribes, or contacts emergency services. Region emergency guidance is configured by administrators and is informational only.
- **Pharmacy availability is only as current as the pharmacy's last confirmation** — stale statuses are shown as "Not recently confirmed," never as current availability.
- **Staff roles are server-assigned** via the platform-admin console or the local `npm run staff:bootstrap` provisioning script (roles live in the `user_roles` registry, migration 026; see `docs/operations-runbook.md`). There is no self-service clinician signup.
- **Metrics are aggregate-only.** No symptom text, document contents, or identifiers ever enter the metrics layer.

---

## Rural-Care Platform (Parts 1–5)

The repository now includes a complete offline-first rural-care workflow on top of the original record-organization features:

| Part | Capability | Key docs |
|---|---|---|
| 1 | Offline-first PWA, IndexedDB queue, en/hi/or i18n, secure capture | `docs/offline-first-part1.md` |
| 2 | Deterministic triage, care-request packets | `docs/safe-triage-part2.md` |
| 3 | Clinician availability, appointments, consent-based sharing, text-first consultation | `docs/care-coordination-part3.md` |
| 4 | Pharmacist-confirmed medicine availability | `docs/pharmacy-stock-part4.md` |
| 5 | Journey view, metrics, resilience testing, region config, release readiness | `docs/release-readiness-part5.md`, `docs/architecture.md`, `docs/security-privacy.md`, `docs/operations-runbook.md`, `docs/demo-script.md`, `docs/deployment-checklist.md` |

### Patient journey view

The care-requests screen renders a unified journey built ONLY from real queue and server state (see `src/lib/journey/status.ts`). Steps: captured → saved on device → synchronized → submitted → safety routing → review → care-team action → appointment/message → record sharing → medicine availability → completed/needs attention. Each step shows a timestamp when one genuinely exists and a plain-language explanation, in English, Hindi, and Odia.

### Reliability dashboard

`/reliability` (staff-only) shows real recorded operational events with transparent definitions (sync reliability, availability freshness, time-to-clinician-action, consultation-fallback rate). It truthfully shows "No data yet" when nothing has been recorded. Data comes from the privacy-safe `reliability_metrics` table (migration 021) — aggregate counts and durations only, no identifiers.

### Network resilience test mode (development tooling)

Automated tests simulate offline / slow-2G / slow-3G / timeout / mid-sync-drop conditions through the resilience harness in `tests/support/`. The harness is not mounted in the running application and cannot be reached by normal users; production builds contain no test panel, network-profile selector, or debug overlay. Queued actions always follow their real retry path and never fake success.

### Region configuration

Region-specific behavior (languages, emergency guidance text/number, appointment hours, freshness thresholds, consultation modes, feature flags) lives in the `region_config` table (migration 022), managed by coordinators via `src/lib/region/`. No town, hospital, phone number, or language is hard-coded; unconfigured regions show generic safe defaults. See `docs/operations-runbook.md` for adding a region without code changes.

### Staff roles

Clinician/coordinator roles are assigned server-side through the platform-admin console (`/staff/admin`) or the local `npm run staff:bootstrap` provisioning script; role capability requires an active row in the `user_roles` registry (migration 026). Pharmacy operator/manager roles live in `pharmacy_memberships` (migration 020). Clients can never assert a role.

---

## License

MIT

---

## Third-Party Acknowledgements

- [Next.js](https://nextjs.org/) — React framework
- [Supabase](https://supabase.com/) — Database, auth, and storage
- [Ollama](https://ollama.com/) — Local AI inference
- [Tesseract.js](https://tesseract.projectnaptha.com/) — Optical character recognition
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF text extraction
- [Zod](https://zod.dev/) — Schema validation
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS
- [Framer Motion](https://www.framer.com/motion/) — Animation
- [jsPDF](https://www.npmjs.com/package/jspdf) — PDF generation
- [ics](https://www.npmjs.com/package/ics) — Calendar file generation
- [Vitest](https://vitest.dev/) — Unit testing
- [Playwright](https://playwright.dev/) — End-to-end testing

---

*Healthfolio organizes medical information and helps you prepare for consultations. It does not diagnose conditions, recommend treatment, prescribe medicine, calculate doses, or replace a healthcare professional.*
