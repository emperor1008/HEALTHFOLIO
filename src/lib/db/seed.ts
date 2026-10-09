/**
 * Preview demo seed — a small, obviously synthetic dataset owned entirely by
 * the reserved preview identity.
 *
 * Rules honoured here:
 *  - Idempotent: guarded by a marker row, and every insert is
 *    `ON CONFLICT DO NOTHING`, so re-running (or a crashed first run) can
 *    never duplicate or corrupt anything.
 *  - Isolated: every row is owned by DEMO_USER_ID, so preview reads and
 *    writes can only ever touch preview data — never a real account.
 *  - Obviously fake: names, document titles, report numbers and evidence text
 *    are all prefixed with "DEMO", and the UI shows a DEMO DATA banner while
 *    preview mode is on.
 *  - Real schema: the rows satisfy the actual migrations (FKs, NOT NULLs,
 *    CHECKs), so pages render through their normal queries with no special
 *    casing.
 *
 * Only runs when preview/demo mode is enabled (see ensurePreviewSeed).
 */
import type { SqlExecutor } from "@/lib/db/sql";
import { DEMO_USER_ID, DEMO_EMAIL, DEMO_NAME } from "@/lib/preview/identity";

const SEED_VERSION = "preview-seed-v2";

const DEMO_PORTFOLIO = "00000000-0000-4000-8000-00000000de10";
const DOC_LAB = "00000000-0000-4000-8000-00000000de11";
const DOC_RX = "00000000-0000-4000-8000-00000000de12";
const MEASURE_HB = "00000000-0000-4000-8000-00000000de21";
const MEASURE_GLU = "00000000-0000-4000-8000-00000000de22";
const MEASURE_CREAT = "00000000-0000-4000-8000-00000000de23";

/** Roles the app recognises (mirrors APP_ROLES in src/lib/auth-session.ts). */
const ALLOWED_ROLES = [
  "patient",
  "doctor_pending",
  "doctor",
  "facility_admin",
  "platform_admin",
];

function roleList(roles: string[]): string[] {
  const filtered = roles.filter((r) => ALLOWED_ROLES.includes(r));
  return filtered.length > 0 ? filtered : ["patient"];
}

/**
 * Insert the preview dataset if it is not there yet.
 * Returns true when the seed is present afterwards.
 */
export async function ensurePreviewSeed(
  sql: SqlExecutor,
  roles: string[]
): Promise<boolean> {
  await sql.exec(
    `create table if not exists hf_preview_seed (
       id text primary key,
       applied_at timestamptz not null default now()
     )`
  );
  const existing = await sql.query<{ id: string }>(
    "select id from hf_preview_seed where id = $1",
    [SEED_VERSION]
  );

  const u = DEMO_USER_ID;
  const p = DEMO_PORTFOLIO;
  const rl = roleList(roles);

  const appRolesSql = `insert into app_roles (user_id, role, status)
            select $1, r, 'active' from unnest($2::text[]) as r
            on conflict (user_id, role) do nothing`;

  if (existing.rows.length > 0) {
    // Already seeded — but HF_DEMO_ROLES may have changed since the first
    // run, so keep the demo role rows in sync (idempotent, no data touched).
    await sql.query(appRolesSql, [u, rl]);
    return true;
  }

  const statements: Array<{ sql: string; params: unknown[] }> = [
    // ── identity ─────────────────────────────────────────────────────────
    // The Better Auth-era identity table mirrors into auth.users via the
    // migration-027 trigger, which is what every medical FK points at.
    {
      sql: `insert into "user" (id, email, name, "emailVerified")
            values ($1, $2, $3, true) on conflict do nothing`,
      params: [u, DEMO_EMAIL, DEMO_NAME],
    },
    {
      sql: `insert into auth.users (
              instance_id, id, aud, role, email, encrypted_password,
              email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
              created_at, updated_at, confirmation_token, recovery_token,
              email_change_token_new, email_change_token_current
            ) values (
              '00000000-0000-0000-0000-000000000000', $1, 'authenticated',
              'authenticated', $2, '', now(),
              '{"provider":"preview","providers":["preview"]}'::jsonb,
              '{"demo":true}'::jsonb, now(), now(), '', '', '', ''
            ) on conflict (id) do nothing`,
      params: [u, DEMO_EMAIL],
    },
    {
      sql: `insert into profiles (id, display_name) values ($1, $2)
            on conflict (id) do nothing`,
      params: [u, DEMO_NAME],
    },
    {
      sql: appRolesSql,
      params: [u, rl],
    },

    // ── portfolio ────────────────────────────────────────────────────────
    {
      sql: `insert into portfolios (id, user_id, label, subject_relationship)
            values ($1, $2, 'DEMO Healthfolio (synthetic)', 'self')
            on conflict do nothing`,
      params: [p, u],
    },

    // ── documents ────────────────────────────────────────────────────────
    {
      sql: `insert into documents
              (id, user_id, portfolio_id, original_name, storage_path, mime_type,
               size_bytes, sha256, document_type, status, page_count)
            values
              ($1, $2, $3, 'DEMO-lab-report-2026-09.pdf',
               'demo/lab-report-2026-09.pdf', 'application/pdf', 184320,
               'demo000000000000000000000000000000000000000000000000000000000001',
               'lab_report', 'processed', 2),
              ($4, $2, $3, 'DEMO-prescription-2026-09.pdf',
               'demo/prescription-2026-09.pdf', 'application/pdf', 96240,
               'demo000000000000000000000000000000000000000000000000000000000002',
               'prescription', 'processed', 1)
            on conflict (id) do nothing`,
      params: [DOC_LAB, u, p, DOC_RX],
    },

    // ── laboratory report + measurements ─────────────────────────────────
    {
      sql: `insert into laboratory_reports
              (user_id, portfolio_id, document_id, report_number, laboratory_name,
               patient_name, collection_date, report_date, specimen,
               overall_confidence, measurement_count, public_summary)
            values
              ($1, $2, $3, 'DEMO-LR-001', 'DEMO Synthetic Laboratory',
               'DEMO Patient', now() - interval '10 days',
               now() - interval '9 days', 'blood', 0.94, 3,
               'DEMO DATA — synthetic report generated for preview mode.')
            on conflict (document_id) do nothing`,
      params: [u, p, DOC_LAB],
    },
    {
      sql: `insert into medical_measurements
              (id, user_id, portfolio_id, document_id, original_test_name,
               normalized_test_name, test_key, value_numeric, original_unit,
               normalized_unit, reference_low, reference_high, report_flag,
               calculated_status, observed_at, page_number, evidence_text,
               confidence, verification_status, source_fingerprint)
            values
              ($1, $2, $3, $4, 'Haemoglobin', 'Haemoglobin', 'haemoglobin',
               13.2, 'g/dL', 'g/dL', 12, 16, 'normal', 'within_range',
               now() - interval '9 days', 1,
               'DEMO synthetic evidence: Haemoglobin 13.2 g/dL', 0.93,
               'verified', 'demo-fp-hb'),
              ($5, $2, $3, $4, 'Fasting Glucose', 'Glucose, fasting',
               'glucose_fasting', 96, 'mg/dL', 'mg/dL', 70, 99, 'normal',
               'within_range', now() - interval '9 days', 1,
               'DEMO synthetic evidence: Glucose 96 mg/dL', 0.91,
               'verified', 'demo-fp-glu'),
              ($6, $2, $3, $4, 'Creatinine', 'Creatinine', 'creatinine',
               0.9, 'mg/dL', 'mg/dL', 0.6, 1.1, 'normal', 'within_range',
               now() - interval '9 days', 2,
               'DEMO synthetic evidence: Creatinine 0.9 mg/dL', 0.9,
               'verified', 'demo-fp-creat')
            on conflict (id) do nothing`,
      params: [MEASURE_HB, u, p, DOC_LAB, MEASURE_GLU, MEASURE_CREAT],
    },

    // ── timeline ─────────────────────────────────────────────────────────
    {
      sql: `insert into medical_events (user_id, portfolio_id, event_date, event_type, title, description)
            values
              ($1, $2, (current_date - interval '9 days')::date, 'lab_result',
               'DEMO: blood panel uploaded',
               'DEMO DATA — synthetic timeline entry for preview mode.'),
              ($1, $2, (current_date - interval '8 days')::date, 'consultation',
               'DEMO: routine consultation',
               'DEMO DATA — synthetic timeline entry for preview mode.'),
              ($1, $2, (current_date - interval '2 days')::date, 'medication',
               'DEMO: medicine course started',
               'DEMO DATA — synthetic timeline entry for preview mode.')
            on conflict do nothing`,
      params: [u, p],
    },

    // ── reminders + appointment ──────────────────────────────────────────
    {
      sql: `insert into reminders (user_id, remind_at, channel, status, message)
            values
              ($1, now() + interval '1 day', 'in_app', 'scheduled',
               'DEMO: take DEMO medicine with breakfast'),
              ($1, now() + interval '3 days', 'in_app', 'scheduled',
               'DEMO: follow-up appointment reminder')
            on conflict do nothing`,
      params: [u],
    },
    {
      sql: `insert into appointments (user_id, portfolio_id, starts_at, specialty, clinician_name, location, status)
            values ($1, $2, now() + interval '5 days', 'General Medicine',
                    'DEMO Clinician', 'DEMO Clinic — Preview', 'planned')
            on conflict do nothing`,
      params: [u, p],
    },

    // ── health card ──────────────────────────────────────────────────────
    {
      sql: `insert into health_card_facts (user_id, allergies, conditions)
            values ($1, array['DEMO: pollen'], array['DEMO: none recorded'])
            on conflict (user_id) do nothing`,
      params: [u],
    },

    // ── prescription + routine ───────────────────────────────────────────
    {
      sql: `insert into prescription_items
              (user_id, document_id, raw_medicine_text, medicine_name, strength,
               dose_text, route, frequency_text, duration_text, instruction_text,
               confidence, verification_status)
            values
              ($1, $2, 'DEMO: take one tablet twice daily after food',
               'DEMO Medicine Alpha', '10 mg', '1 tablet', 'oral',
               'twice daily', '5 days', 'DEMO DATA — synthetic instruction',
               0.9, 'verified'),
              ($1, $3, 'DEMO: take one tablet at night',
               'DEMO Medicine Beta', '5 mg', '1 tablet', 'oral',
               'once daily', '7 days', 'DEMO DATA — synthetic instruction',
               0.88, 'pending')
            on conflict do nothing`,
      params: [u, DOC_RX, DOC_RX],
    },
    {
      sql: `insert into medication_plans
              (user_id, portfolio_id, prescription_item_id, document_id,
               display_name, source_instruction, plan_type, status, start_date,
               confidence, requires_review, activated_at)
            select $1, $2, pi.id, $3,
                   'DEMO Medicine Alpha',
                   'DEMO: take one tablet twice daily after food',
                   'times_per_day', 'active', (current_date - interval '3 days')::date,
                   0.9, false, now() - interval '3 days'
              from prescription_items pi
             where pi.user_id = $1 and pi.medicine_name = 'DEMO Medicine Alpha'
             limit 1
            on conflict do nothing`,
      params: [u, p, DOC_RX],
    },

    // ── care requests + triage ───────────────────────────────────────────
    {
      sql: `insert into care_requests
              (user_id, portfolio_id, preferred_language, reason, status,
               idempotency_key, triage_category, summary)
            values ($1, $2, 'en',
                    'DEMO: persistent cough for a few days',
                    'submitted', 'demo-care-request-1', 'routine',
                    'DEMO DATA — synthetic care request for preview mode.')
            on conflict (user_id, idempotency_key) do nothing`,
      params: [u, p],
    },
    // ── consent ──────────────────────────────────────────────────────────
    // The dashboard gates on these three exact types at the CURRENT version
    // (src/app/api/consent/status/route.ts) — seeding them lets preview land
    // on the dashboard instead of the consent screen.
    {
      sql: `insert into consents (user_id, consent_type, policy_version, granted_at)
            select $1, t, '1.0', now()
              from unnest(array['terms', 'privacy', 'ai_processing']) as t
            on conflict (user_id, consent_type) do nothing`,
      params: [u],
    },
  ];

  for (const statement of statements) {
    await sql.query(statement.sql, statement.params);
  }

  await sql.query("insert into hf_preview_seed (id) values ($1) on conflict do nothing", [
    SEED_VERSION,
  ]);
  return true;
}
