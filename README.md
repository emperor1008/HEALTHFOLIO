# Healthfolio

**Your health history, clearly organized.**

Agentic medical record intelligence and consultation preparation platform.

---

## What is Healthfolio?

Healthfolio is a responsive web application that helps patients organize scattered medical records—prescriptions, lab reports, discharge summaries, and scan images—into a verified chronological timeline, then prepare for upcoming appointments with a consultation brief, checklist, and calendar export.

### Key Features

- **Secure Document Upload** — PDF, PNG, JPEG with validation, private storage, and duplicate detection
- **AI Document Intelligence** — Text extraction, OCR, and structured classification with evidence links
- **Confidence Review** — Every extracted fact shows confidence level; uncertain items require user confirmation
- **Verified Health Timeline** — Chronological events with source citations and verification status
- **Agentic Processing** — Observable agent loop with explicit states, tool allowlist, and failure recovery
- **Consultation Brief** — Appointment-focused summary with verified events, questions, and checklist
- **PDF Export** — Download a professional consultation brief as PDF
- **Calendar Export** — Download a standards-compliant `.ics` calendar event
- **Privacy First** — Private storage, row-level security, signed URLs, no data sharing

### Medical Safety Boundary

Healthfolio organizes medical information and helps you prepare for consultations. **It does not diagnose conditions, recommend treatment, or replace a healthcare professional.**

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- An OpenAI API key (or compatible provider)

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

Edit `.env.local` with your values:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AI_PROVIDER=openai
AI_API_KEY=your-openai-api-key
AI_MODEL_TEXT=gpt-4o-mini
AI_MODEL_VISION=gpt-4o
APP_ENCRYPTION_KEY=generate-a-random-32-byte-key
```

### 3. Set up Supabase database

1. Go to your Supabase project dashboard
2. Open the SQL Editor
3. Run `supabase/migrations/001_initial_schema.sql`
4. Run `supabase/migrations/002_storage_bucket.sql`

### 4. Start the development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### 5. Create an account

1. Click **Create my Healthfolio**
2. Enter email and password
3. Verify your email (check spam folder)
4. Sign in and accept the privacy/AI processing consent

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

---

## Architecture

### Tech Stack

- **Framework:** Next.js 14 App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **Validation:** Zod
- **Auth:** Supabase Auth (email/password)
- **Database:** Supabase PostgreSQL with RLS
- **Storage:** Supabase private bucket
- **AI:** OpenAI through provider adapter
- **PDF:** pdf-parse + jsPDF
- **OCR:** Tesseract.js
- **Calendar:** ics library
- **Testing:** Vitest + React Testing Library

### Project Structure

```
healthfolio/
├── src/
│   ├── app/           # Next.js App Router pages and API routes
│   │   ├── (marketing)/  # Public landing page
│   │   ├── (auth)/       # Sign-up, sign-in, password reset
│   │   ├── (app)/        # Authenticated app pages
│   │   └── api/          # Server API routes
│   ├── components/    # React components
│   │   ├── ui/            # Reusable UI primitives
│   │   └── navigation/    # Navigation components
│   ├── lib/           # Core business logic
│   │   ├── agent/         # Agent controller and state machine
│   │   ├── ai/            # AI provider adapter and schemas
│   │   ├── documents/     # Document processing pipeline
│   │   ├── tools/         # Tool registry and allowlist
│   │   └── supabase/      # Supabase client configuration
│   └── types/         # TypeScript type declarations
├── supabase/
│   └── migrations/    # SQL database migrations
├── tests/
│   └── unit/          # Unit tests
└── public/            # Static assets
```

### Agent Loop

Healthfolio uses a controlled agent loop:

```
INTAKE → INGEST → EXTRACT → REVIEW_REQUIRED → PLAN
       → EXECUTE → VERIFY → ADAPT → COMPLETE | BLOCKED
```

The agent:
- Maintains user goal and explicit state
- Selects actions from a server-controlled tool allowlist
- Executes one bounded action at a time
- Validates all inputs and outputs
- Detects failures and uncertainty
- Resumes after user resolves blocked steps
- Stops after configurable maximum steps

### Allowed Tools

| Tool | Purpose |
|---|---|
| `document.ingest` | Process newly uploaded documents |
| `document.extract` | Extract structured data from documents |
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
- **File validation** — Extension, MIME type, size, and magic byte checking
- **Agent allowlist** — Only registered tools can be invoked
- **Safety policy** — Blocks diagnosis, treatment, and medication changes
- **Redacted audit events** — No raw medical data in logs
- **No dummy data** — Empty states for new accounts

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Application URL | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | Yes |
| `AI_PROVIDER` | AI provider name (`openai`) | Yes |
| `AI_API_KEY` | AI provider API key (server-only) | Yes |
| `AI_MODEL_TEXT` | Text model identifier | Yes |
| `AI_MODEL_VISION` | Vision model identifier | Yes |
| `DOCUMENT_MAX_BYTES` | Max file size (default: 10485760) | No |
| `AGENT_MAX_STEPS` | Max agent steps (default: 12) | No |
| `AGENT_MAX_RETRIES` | Max retries (default: 2) | No |
| `EXTRACTION_CONFIDENCE_THRESHOLD` | Review threshold (default: 0.85) | No |
| `APP_ENCRYPTION_KEY` | Encryption key (server-only) | Yes |

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

### E2E Tests (Playwright)

```bash
npm run test:e2e
```

---

## Limitations

- Single user role (patient/caregiver)
- One agent per workflow
- No live EHR integration
- No real-time clinician chat
- AI not a replacement for medical professionals
- Requires internet for AI processing
- No offline document processing

---

## License

MIT

---

*Healthfolio organizes medical information and helps you prepare for consultations. It does not diagnose conditions, recommend treatment, or replace a healthcare professional.*
