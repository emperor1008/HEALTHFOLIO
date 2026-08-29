# Healthfolio

**Your health history, clearly organized.**

Agentic medical record intelligence and consultation preparation platform.

---

## What is Healthfolio?

Healthfolio is a responsive web application that helps patients organize scattered medical records—prescriptions, lab reports, discharge summaries, and scan images—into a verified chronological timeline, then prepare for upcoming appointments with a consultation brief, checklist, and calendar export.

### Key Features

- **Secure Document Upload** — PDF, PNG, JPEG, WEBP with validation, private storage, and duplicate detection
- **Real OCR** — Tesseract.js for images, pdf-parse for text PDFs, scanned-PDF image fallback
- **Local AI Processing** — Ollama-powered document classification and structured extraction
- **Confidence Review** — Every extracted fact shows confidence level; uncertain items require user confirmation
- **Verified Health Timeline** — Chronological events with source citations and verification status
- **Agentic Processing** — Observable agent loop with explicit states, tool allowlist, and failure recovery
- **Ask Healthfolio** — Chat assistant that answers questions using your uploaded records with citations
- **Consultation Brief** — Appointment-focused summary with verified events, questions, and checklist
- **PDF Export** — Download a professional consultation brief as PDF
- **Calendar Export** — Download a standards-compliant `.ics` calendar event
- **Privacy First** — Private storage, row-level security, signed URLs, no data sharing

### Medical Safety Boundary

Healthfolio organizes medical information and helps you prepare for consultations. **It does not diagnose conditions, recommend treatment, or replace a healthcare professional.**

---

## Local Setup

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works) with Anonymous Sign-In enabled
- [Ollama](https://ollama.com) installed locally

### 1. Clone and install

```bash
git clone <repository-url>
cd healthfolio
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your own values:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TEXT_MODEL=qwen2.5:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
AI_REQUEST_TIMEOUT_MS=120000
```

**Never commit `.env.local`.** It is already in `.gitignore`.

### 3. Install Ollama models

```bash
ollama pull qwen2.5:3b
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
   - `supabase/migrations/003_agent_extensions.sql`
   - `supabase/migrations/004_performance_indexes.sql`
4. Go to **Authentication → URL Configuration** and add redirect URLs:
   ```
   http://localhost:3000/auth/callback
   http://localhost:3000/update-password
   http://localhost:3000/**
   ```

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
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run format` | Format with Prettier |
| `npm run secrets:scan` | Scan tracked files for committed secrets |

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
- **OCR:** Tesseract.js for images, pdf-parse for text PDFs
- **PDF Export:** jsPDF with jspdf-autotable
- **Calendar:** ics library
- **Testing:** Vitest + React Testing Library + Playwright

### Project Structure

```
healthfolio/
├── src/
│   ├── app/           # Next.js App Router pages and API routes
│   │   ├── (marketing)/  # Public landing page
│   │   ├── (auth)/       # Sign-up, sign-in, password reset
│   │   ├── (app)/        # Authenticated app pages
│   │   ├── auth/         # Session bootstrap, callback
│   │   └── api/          # Server API routes
│   ├── components/    # React components
│   │   ├── ui/            # Reusable UI primitives
│   │   ├── navigation/    # Sidebar, TopBar, MobileNav
│   │   └── branding/      # Splash screen, logo
│   ├── lib/           # Core business logic
│   │   ├── agent/         # Agent controller and state machine
│   │   ├── ai/            # AI provider adapter (Ollama), schemas, safety
│   │   ├── documents/     # Document ingestion and OCR pipeline
│   │   ├── tools/         # Tool registry and allowlist
│   │   └── supabase/      # Supabase client configuration
│   └── types/         # TypeScript type declarations
├── supabase/
│   └── migrations/    # SQL database migrations
├── scripts/
│   └── scan-secrets.js  # Pre-commit secret scanner
├── tests/
│   ├── unit/          # Unit tests
│   └── e2e/           # End-to-end tests
└── public/            # Static assets (branding, images)
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
- **Rotate exposed secrets** — If any credential was previously pushed to a public repository, rotate it immediately

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
| `OLLAMA_TEXT_MODEL` | Text model name | Server-only | Yes |
| `OLLAMA_EMBEDDING_MODEL` | Embedding model name | Server-only | Optional |
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

## Testing

### Unit Tests

```bash
npm test
```

Tests cover:
- Medical safety boundaries
- Tool registry allowlist and state permissions
- AI output schema validation
- ICS calendar generation
- Input validation
- OCR file signature validation
- Demo mode disabled in production

### Secret Scanner

```bash
npm run secrets:scan
```

Scans all tracked files for likely API keys, connection strings, private keys, and hardcoded credentials. Run before every commit.

### E2E Tests (Playwright)

```bash
npm run test:e2e
```

---

## Limitations

- Requires Ollama running locally for AI features
- OCR quality depends on document image resolution
- Single user role (patient/caregiver)
- One agent per workflow
- No live EHR integration
- No real-time clinician chat
- AI is not a medical professional
- Requires internet for Supabase; local for Ollama

---

## License

MIT

---

*Healthfolio organizes medical information and helps you prepare for consultations. It does not diagnose conditions, recommend treatment, or replace a healthcare professional.*
