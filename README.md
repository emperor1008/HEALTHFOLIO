# Healthfolio

> **Offline-first health records and care coordination for communities where connectivity cannot be assumed.**

Healthfolio helps people securely capture medical records, understand verified information, request appropriate care, and stay connected with clinicians and pharmaciesâ€”even when the network is slow or temporarily unavailable.

It is designed around one principle: **a weak connection must never mean lost health information.**

---

## The Problem

For many patients, especially in rural and semi-urban communities, healthcare access is fragmented:

* Medical reports, prescriptions, and scan images are scattered across paper files and phones.
* Travel to a hospital may end in a missed consultation, unavailable specialist, or unavailable medicine.
* Internet connectivity is unreliable, making conventional cloud-first healthcare apps impractical.
* Patients with low digital literacy need simple, multilingual flows instead of complicated forms.
* Clinicians and pharmacies need reliable, privacy-safe informationâ€”not incomplete or fabricated data.

Healthfolio brings these experiences into one secure, offline-capable care journey.

---

## What Healthfolio Does

### For patients

* Capture prescriptions, lab reports, discharge summaries, and scan images.
* Upload files or use camera-based document capture.
* Keep health records organized in a private, chronological health space.
* Review extracted measurements, reports, medicines, and health trends.
* Create structured care requests that remain safely queued during a network interruption.
* View the true status of a care request, appointment, document review, and medicine-availability response.
* Use English, Hindi, or Odia interfaces designed for clear, low-literacy-friendly interaction.

### For clinicians and care teams

* View authorized patient care requests.
* Manage availability and consultation workflow.
* Review safety-routed requests without relying on unreliable live connectivity.
* Coordinate appointments, text-first consultations, and consent-based record sharing.
* Access an operational reliability view based only on real system events.

### For pharmacy operators

* Update medicine availability from participating pharmacies.
* Show freshness timestamps so patients are never shown stale availability as current information.
* Help reduce unnecessary travel for unavailable medicines.

---

## Core Capabilities

| Capability                        | How it works                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Offline-first care requests**   | Actions are stored locally in an encrypted queue, survive refreshes and network drops, and synchronize automatically once connectivity returns.                                     |
| **No silent data loss**           | Every queued action has an idempotency key, bounded retry strategy, recovery state, and visible status. The interface never claims a request was sent until the server confirms it. |
| **Medical record capture**        | Supports PDF, PNG, JPEG, and WebP uploads with file-size, MIME-type, extension, and signature validation.                                                                           |
| **OCR and structured extraction** | Extracts useful text and structured information from supported medical records, with confidence-aware review for uncertain results.                                                 |
| **Verified health timeline**      | Builds an evidence-linked chronological record of health events, reports, medicines, and measurements.                                                                              |
| **Health tracking**               | Shows verified health measurements over time with trend views, report ranges, and source evidence.                                                                                  |
| **Safe care triage**              | Uses deterministic, non-diagnostic urgency routing to identify when immediate professional help may be needed. It never diagnoses, prescribes, or provides false reassurance.       |
| **Care coordination**             | Supports care requests, clinician availability, appointments, consent-based record sharing, and text-first consultation fallback.                                                   |
| **Pharmacy availability**         | Participating pharmacy operators can provide medicine availability updates with timestamp and freshness indicators.                                                                 |
| **Multilingual experience**       | User-facing care flows support English, à¤¹à¤¿à¤¨à¥à¤¦à¥€, and à¬“à¬¡à¬¼à¬¿à¬†. Medical source content remains unchanged to preserve accuracy.                                                           |
| **Role-based access**             | Patient, clinician, coordinator, pharmacy, and platform-administrator capabilities are enforced server-side. Clients cannot assign themselves elevated roles.                       |
| **Privacy by design**             | Private storage, row-level database policies, signed document access, audited actions, and server-side authorization boundaries.                                                    |

---

## Safety Commitment

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run Vitest unit tests; verify the current test count |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run format` | Format with Prettier |
| `npm run secrets:scan` | Scan tracked files for committed secrets |
| `npm run ai:check` | Check Ollama connectivity and model availability |
| `npm run verify:all` | Run the full verification suite |

Healthfolio is a health-information and care-coordination platform.

It **does not**:

* diagnose medical conditions
* prescribe medicine
* calculate or change doses
* replace a doctor, pharmacist, emergency service, or hospital
* guarantee medicine availability
* claim that a care request was delivered before acknowledgement

When urgent symptoms are identified, Healthfolio provides escalation guidance and encourages immediate contact with local emergency services or a qualified healthcare professional.

---

## Offline-First Architecture

Healthfolio is built for patchy and low-bandwidth conditions.

```text
Patient action
     â†“
Local encrypted queue
     â†“
Network unavailable? â”€â”€ Yes â†’ Persist safely and retry later
     â†“ No
Secure API acknowledgement
     â†“
Server record created exactly once
     â†“
Visible patient journey status
```

### Reliability principles

* Offline actions remain available after page refresh.
* Synchronization retries use bounded backoff.
* Duplicate taps and repeated retries do not create duplicate care requests.
* Failed actions remain visible and can be retried or removed by the user.
* The application displays honest states such as **Saved on this device**, **Waiting to sync**, **Needs attention**, and **Sent**.
* No development overlay, artificial success state, or simulated production record is shown to end users.

---

## Security and Privacy

Healthfolio is designed to minimize exposure of sensitive health information.

* Row-Level Security policies protect user-owned database records.
* Documents are stored privately and accessed through short-lived signed URLs.
* Uploads are validated before processing.
* Server routes verify identity and authorization independently of the client UI.
* Role assignments are resolved server-side.
* Sensitive health content is excluded from aggregate reliability metrics.
* Redirects and external input are validated.
* Audit events are redacted to avoid storing raw health content in logs.
* Secrets are never committed to the repository.
* `.env.local` is ignored by Git and must remain private.

## Environment Variables

Configure `.env.local` using `.env.example`. Healthfolio uses Firebase Authentication alongside existing PostgreSQL and Supabase services that have not yet migrated.

| Variable | Description | Scope |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Application URL | Public |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase client API key | Public |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase authentication domain | Public |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | Public |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket configuration | Public; optional where supported |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Public; optional where supported |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase application ID | Public |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Admin service-account JSON supplied as one environment string | **Server-only** |
| `DATABASE_URL` | PostgreSQL connection string for remaining database services | **Server-only** |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anonymous key for remaining integrations | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-side service-role key | **Server-only** |

Only configure variables required by the feature and deployment environment. Never expose service-account credentials, database credentials, or the Supabase service-role key in client code or commit them to Git.

### Authentication (Firebase)

Firebase Authentication is the application's authentication foundation. The Firebase client configuration is initialized in `src/lib/firebase/config.ts`; server-side Firebase Admin initialization is handled in `src/lib/firebase/admin.ts`.

- The server-side registration endpoint creates Firebase users and provisions the associated identity.
- The session endpoint exchanges a verified Firebase ID token for an HTTP-only session cookie.
- Server endpoints must validate identity and authorization independently of client-side UI.
- Elevated roles must be assigned and checked through trusted server-side logic, never accepted solely from client input.
- Firebase Authentication migration does not, by itself, migrate the existing PostgreSQL data layer, private Supabase document storage, or consultation signalling.

For the current implementation, follow the application's Firebase registration and sign-in flows.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Ollama not responding | Run `ollama serve` and verify the configured local endpoint. |
| Model not found | Pull the configured model with `ollama pull <model-name>`. |
| AI timeout | Check `AI_REQUEST_TIMEOUT_MS` and available system memory. |
| Authentication or session failure | Verify Firebase public configuration, server-only Admin credentials, token exchange responses, and the configured application URL. Never paste credentials into logs or issue reports. |
| Upload fails | Check the storage service currently used by that feature and its access policies. |
| Database errors | Verify `DATABASE_URL`, Supabase configuration where required, and the migrations needed by the existing database layer. |
| OCR returns empty text | Check file quality, supported formats, OCR language configuration, and image resolution. |
| Authorization failure | Verify the authenticated user's identity, server-side role assignment, and resource ownership checks. |

---
## Testing

### Unit Tests

```bash
npm test
```

Tests cover areas such as medical safety boundaries, input validation, AI output validation, document processing, medicine intelligence, and measurement calculations. Use the actual test-runner output for the current test count.

### AI Live Check

```bash
npm run ai:check
```

This checks the configured local AI service and model availability. It requires the relevant Ollama service and models to be available.

### Secret Scanner

Before every push, run:

```bash
npm run secrets:scan
```

Review the result before pushing. Do not commit `.env.local`, service-account JSON, or other credentials.

```bash
npm run secrets:scan
```

---

## Technology Stack

| Layer           | Technology                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Application     | Next.js App Router                                                                              |
| Language        | TypeScript with strict type checking                                                            |
| UI              | Tailwind CSS, Framer Motion                                                                     |
| Validation      | Zod                                                                                             |
| Database        | Supabase PostgreSQL                                                                             |
| Storage         | Supabase private storage with signed URLs                                                       |
| Authentication  | Role-aware authentication and server-side authorization boundaries                              |
| Offline storage | IndexedDB-based action queue                                                                    |
| OCR             | Tesseract.js and PDF text extraction                                                            |
| AI integration  | Provider-adapter architecture for structured document intelligence and health-record assistance |
| Testing         | Vitest, React Testing Library, Playwright                                                       |
| Exports         | jsPDF and ICS calendar generation                                                               |

---

## Roles and Access Model

| Role                       | Primary responsibilities                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **Patient**                | Capture records, submit care requests, review personal health information, manage consent. |
| **Clinician**              | Review authorized requests, manage availability, coordinate care and consultations.        |
| **Coordinator**            | Support facility workflow, region configuration, and operational oversight.                |
| **Pharmacy operator**      | Maintain pharmacy availability updates for participating pharmacies.                       |
| **Platform administrator** | Provision trusted staff roles and manage platform-level controls.                          |

Role checks are performed on the server. A browser client cannot promote itself to clinician, coordinator, or administrator.

---

## Project Structure

```text
healthfolio/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ app/                  # Pages, layouts, API routes
â”‚   â”œâ”€â”€ components/           # Reusable interface components
â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”œâ”€â”€ agent/            # Controlled workflow and tool execution
â”‚   â”‚   â”œâ”€â”€ ai/               # AI provider adapters, schemas, safety
â”‚   â”‚   â”œâ”€â”€ documents/        # Upload, OCR, extraction pipeline
â”‚   â”‚   â”œâ”€â”€ health/           # Measurements, reports, trends
â”‚   â”‚   â”œâ”€â”€ care/             # Care requests and coordination
â”‚   â”‚   â”œâ”€â”€ pharmacy/         # Medicine-availability workflow
â”‚   â”‚   â”œâ”€â”€ offline/          # Queue, sync, retry, idempotency
â”‚   â”‚   â”œâ”€â”€ auth/             # Authentication and authorization
â”‚   â”‚   â””â”€â”€ supabase/         # Database and storage clients
â”‚   â””â”€â”€ types/                # Shared TypeScript types
â”œâ”€â”€ supabase/
â”‚   â””â”€â”€ migrations/           # Versioned database migrations
â”œâ”€â”€ docs/                     # Architecture, security, operations, demo guides
â”œâ”€â”€ scripts/                  # Verification and maintenance scripts
â”œâ”€â”€ tests/                    # Unit, integration, and E2E tests
â””â”€â”€ public/                   # Static assets
```

---

## Local Development

### Prerequisites

* Node.js 20 or later
* npm
* A Supabase project
* Supabase CLI
* Environment values stored only in `.env.local`

### 1. Clone and install

```bash
git clone https://github.com/emperor1008/HEALTHFOLIO.git
cd HEALTHFOLIO
npm install
```

### 2. Create your local environment file

```bash
Copy-Item .env.example .env.local
```

Fill in your own environment values in `.env.local`.

Never commit this file.

### 3. Connect Supabase and apply migrations

```bash
npx supabase link --project-ref YOUR_PROJECT_REFERENCE
npx supabase db push
```

Verify the database setup:

```bash
npm run db:verify
```

### 4. Start the application

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Quality Checks

| Command                | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Start local development                                 |
| `npm run build`        | Create a production build                               |
| `npm run lint`         | Run lint checks                                         |
| `npm run typecheck`    | Run strict TypeScript validation                        |
| `npm test`             | Run unit and integration tests                          |
| `npm run test:e2e`     | Run browser-based end-to-end tests                      |
| `npm run secrets:scan` | Scan tracked files for accidental credentials           |
| `npm run db:verify`    | Verify required tables, storage, and database functions |
| `npm run verify:all`   | Run the full local verification suite                   |

Recommended pre-push check:

```bash
npm run verify:all
```

---

## Documentation

| Document                         | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `docs/problem-solution-brief.md` | Problem, users, value proposition, and safety boundaries    |
| `docs/system-architecture.md`    | Architecture, data flow, and security design                |
| `docs/agent-workflow.md`         | Controlled workflow states, tools, evidence, and recovery   |
| `docs/security-privacy.md`       | Privacy model, access control, and sensitive-data handling  |
| `docs/operations-runbook.md`     | Operational setup, regions, staff provisioning, and support |
| `docs/demo-script.md`            | Demonstration flow based on real functionality              |
| `docs/deployment-checklist.md`   | Deployment and production-readiness checklist               |

---

## Current Scope and Honest Limitations

Healthfolio is designed to support real care workflows, but its usefulness depends on real participating patients, clinicians, coordinators, and pharmacy operators.

- Clinician queues and care coordination require authorized staff accounts and functioning server-side authorization.
- Pharmacy availability is only as current as the latest genuine update from a participating pharmacy. It is not a guarantee of stock.
- Video consultation quality depends on device capabilities, network conditions, and the deployed WebRTC infrastructure. Text-first communication should remain available when video cannot connect.
- OCR results depend on document quality, legibility, and resolution. Extracted medical information must be checked against the source document.
- Triage and AI-generated explanations are informational support, not diagnoses or prescriptions. They must not replace a qualified professional or emergency care.
- Offline queues can preserve supported actions locally, but synchronization and delivery require connectivity. The interface must not claim server receipt before acknowledgement.
- The application does not replace a hospital information system or guarantee that a clinician, medicine, appointment, or emergency service will be available.
- Demonstrations and tests must not be represented as proof of live hospital integration. Do not fabricate clinicians, pharmacies, patient records, or medicine stock.

---
## Implementation Roadmap

| Part | Capability | Key docs |
|---|---|---|
| 1 | Offline-first PWA, IndexedDB queue, English/Hindi/Odia support, secure capture | `docs/offline-first-part1.md` |
| 2 | Deterministic triage and care-request packets | `docs/safe-triage-part2.md` |
| 3 | Clinician availability, appointments, consent-based sharing, text-first consultation | `docs/care-coordination-part3.md` |
| 4 | Pharmacist-confirmed medicine availability | `docs/pharmacy-stock-part4.md` |
| 5 | Patient journey, reliability metrics, resilience testing, regional configuration, release readiness | `docs/release-readiness-part5.md`, `docs/architecture.md`, `docs/security-privacy.md`, `docs/operations-runbook.md`, `docs/demo-script.md`, `docs/deployment-checklist.md` |

### Patient journey view

The care-requests screen presents a journey based on actual queue and server state. Timestamps appear only when recorded. The interface supports English, Hindi, and Odia.

### Reliability dashboard

The staff-only `/reliability` view reports recorded operational events. It must show "No data yet" when there are no recorded events. Metrics should remain aggregate-only and must not expose patient identifiers.

### Network resilience testing

Automated tests exercise offline, slow-network, timeout, and interrupted-sync conditions through `tests/support/`. This development test harness is not a production user interface. Queued actions must follow real retry paths and must not report success before server acknowledgement.

### Regional configuration

Regional settings include languages, emergency guidance, appointment hours, freshness thresholds, consultation modes, and feature flags. Check the deployed schema and `docs/operations-runbook.md` before changing regional settings.

### Staff roles and authorization

Staff permissions must be enforced by trusted server-side authorization checks. Never trust a role supplied by the client. Verify the deployed role-assignment mechanism and resource-ownership checks before granting access to clinician, coordinator, or pharmacy workflows. Firebase Authentication alone does not migrate the existing database or automatically authorize access to its records. Follow `docs/security-privacy.md` and `docs/operations-runbook.md`.

## License

MIT

---

## Third-Party Acknowledgements

- [Next.js](https://nextjs.org/) — React framework
- [Firebase](https://firebase.google.com/) — Authentication and configured Firebase services
- [Supabase](https://supabase.com/) — Existing database, private storage, and integrations not yet migrated
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

> **Healthfolio makes health information easier to organize, safer to carry, and more practical to use—without pretending to replace professional care.**
