# Healthfolio

> **Offline-first health records and care coordination for communities where connectivity cannot be assumed.**

Healthfolio helps people securely capture medical records, understand verified information, request appropriate care, and stay connected with clinicians and pharmacies—even when the network is slow or temporarily unavailable.

It is designed around one principle: **a weak connection must never mean lost health information.**

---

## The Problem

For many patients, especially in rural and semi-urban communities, healthcare access is fragmented:

* Medical reports, prescriptions, and scan images are scattered across paper files and phones.
* Travel to a hospital may end in a missed consultation, unavailable specialist, or unavailable medicine.
* Internet connectivity is unreliable, making conventional cloud-first healthcare apps impractical.
* Patients with low digital literacy need simple, multilingual flows instead of complicated forms.
* Clinicians and pharmacies need reliable, privacy-safe information—not incomplete or fabricated data.

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
| **Multilingual experience**       | User-facing care flows support English, हिन्दी, and ଓଡ଼ିଆ. Medical source content remains unchanged to preserve accuracy.                                                           |
| **Role-based access**             | Patient, clinician, coordinator, pharmacy, and platform-administrator capabilities are enforced server-side. Clients cannot assign themselves elevated roles.                       |
| **Privacy by design**             | Private storage, row-level database policies, signed document access, audited actions, and server-side authorization boundaries.                                                    |

---

## Safety Commitment

Healthfolio is a health-information and care-coordination platform.

It **does not**:

* diagnose medical conditions
* prescribe medicine
* calculate or change doses
* replace a doctor, pharmacist, emergency service, or hospital
* guarantee medicine availability
* claim that a care request was delivered before acknowledgement

When urgent symptoms are identified, Healthfolio provides clear escalation guidance and encourages immediate contact with local emergency services or a qualified healthcare professional.

---

## Offline-First Architecture

Healthfolio is built for patchy and low-bandwidth conditions.

```text
Patient action
     ↓
Local encrypted queue
     ↓
Network unavailable? ── Yes → Persist safely and retry later
     ↓ No
Secure API acknowledgement
     ↓
Server record created exactly once
     ↓
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

Before every push, run:

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
├── src/
│   ├── app/                  # Pages, layouts, API routes
│   ├── components/           # Reusable interface components
│   ├── lib/
│   │   ├── agent/            # Controlled workflow and tool execution
│   │   ├── ai/               # AI provider adapters, schemas, safety
│   │   ├── documents/        # Upload, OCR, extraction pipeline
│   │   ├── health/           # Measurements, reports, trends
│   │   ├── care/             # Care requests and coordination
│   │   ├── pharmacy/         # Medicine-availability workflow
│   │   ├── offline/          # Queue, sync, retry, idempotency
│   │   ├── auth/             # Authentication and authorization
│   │   └── supabase/         # Database and storage clients
│   └── types/                # Shared TypeScript types
├── supabase/
│   └── migrations/           # Versioned database migrations
├── docs/                     # Architecture, security, operations, demo guides
├── scripts/                  # Verification and maintenance scripts
├── tests/                    # Unit, integration, and E2E tests
└── public/                   # Static assets
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

Healthfolio is built to support real workflows, but some integrations require real participating organizations before they can show live information.

* Clinician queues require authorized clinician accounts.
* Pharmacy availability requires participating pharmacy operators to submit real updates.
* Video consultation quality depends on real WebRTC infrastructure and network conditions; secure text-first coordination is the dependable fallback.
* OCR quality depends on the clarity and resolution of uploaded documents.
* Healthfolio does not replace a hospital information system, emergency response service, or qualified medical professional.
* No dummy medical records, fabricated clinicians, fake pharmacies, or artificial stock data are used in the application.

---




## License

MIT

---

> **Healthfolio makes health information easier to organize, safer to carry, and more practical to use—without pretending to replace professional care.**
