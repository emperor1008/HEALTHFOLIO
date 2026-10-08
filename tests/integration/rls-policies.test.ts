// @vitest-environment node
/**
 * Phase 6 §6 — RLS verification against the migrated schema.
 *
 * The app no longer connects to Supabase from the browser; it uses the
 * service-role key from server code, so these policies are DEFENCE IN DEPTH.
 * That is precisely why they must be executed rather than assumed: a policy
 * that silently stopped applying would be invisible until something else broke.
 *
 * Method: for every probed table one row is owned by Patient B and written as
 * service_role (the app's server connection), then Patient A's `authenticated`
 * connection attempts to read, update, and delete it. Nothing here trusts a
 * migration file — the assertions run against PostgreSQL's own policy engine.
 */
import { afterAll, beforeEach, beforeAll, describe, expect, it } from "vitest";
import {
  createAuthUser,
  createHealthfolioDb,
  type HealthfolioDb,
} from "./support/pg-harness";

interface TableCase {
  table: string;
  /** Creates one row and returns the value probed below. $1 = owner, $2 = owner's portfolio. */
  seed: string;
  /** Column the probes address the row by. Defaults to `id`. */
  probe?: string;
}

const CASES: TableCase[] = [
  { table: "profiles", seed: `select $1::uuid as id` },
  {
    table: "portfolios",
    seed: `select id from portfolios where user_id = $1`,
  },
  {
    table: "documents",
    seed: `insert into documents (id, user_id, portfolio_id, original_name, storage_path, mime_type, size_bytes)
           values (gen_random_uuid(), $1::uuid, $2, 'rls.pdf', $1::text || '/rls.pdf', 'application/pdf', 10)
           returning id`,
  },
  {
    table: "medical_events",
    seed: `insert into medical_events (user_id, portfolio_id, title) values ($1, $2, 'RLS event') returning id`,
  },
  {
    table: "reminders",
    seed: `insert into reminders (user_id, remind_at, message) values ($1, now() + interval '1 day', 'RLS') returning id`,
  },
  {
    table: "idempotency_keys",
    probe: "user_id",
    seed: `insert into idempotency_keys (user_id, endpoint, idempotency_key, response_status, response_body)
           values ($1, 'rls:test', 'k-' || gen_random_uuid()::text, 200, '{}'::jsonb)
           returning user_id::text as id`,
  },
  {
    table: "audit_events",
    seed: `insert into audit_events (user_id, action, resource_type) values ($1, 'rls_probe', 'probe') returning id`,
  },
  {
    table: "app_roles",
    seed: `insert into app_roles (user_id, role) values ($1, 'patient') returning id`,
  },
  {
    table: "user_roles",
    seed: `insert into user_roles (user_id, role, status) values ($1, 'patient', 'active') returning id`,
  },
  {
    table: "consents",
    seed: `insert into consents (user_id, consent_type, policy_version) values ($1, 'terms', '1.0') returning id`,
  },
  {
    table: "care_requests",
    seed: `insert into care_requests (user_id, reason, idempotency_key) values ($1, 'RLS request', gen_random_uuid()::text) returning id`,
  },
  {
    table: "triage_assessments",
    seed: `insert into triage_assessments (user_id, care_request_id, rules_version, triage_category, rule_ids, concepts, follow_up_answers)
           select $1, cr.id, 'v1', 'routine', '{}'::text[], '{}'::text[], '{}'::jsonb
             from care_requests cr where cr.user_id = $1 limit 1 returning id`,
  },
  {
    table: "document_share_consents",
    seed: `insert into document_share_consents (care_request_id, patient_id, document_ids)
           select cr.id, $1, '{}'::uuid[] from care_requests cr where cr.user_id = $1 limit 1 returning id`,
  },{ table: "clinician_profiles",
    seed: `select id from clinician_profiles where user_id = $1`,
  },
  {
    table: "clinician_availability",
    seed: `insert into clinician_availability (clinician_id, state, changed_by)
           select cp.id, 'available', $1 from clinician_profiles cp where cp.user_id = $1 returning id`,
  },{ table: "facility_memberships",
    seed: `select id from facility_memberships where user_id = $1 and facility_id = (select id from facilities limit 1)`,
  },
  {
    table: "care_request_assignments",
    seed: `insert into care_request_assignments (care_request_id, clinician_id, state, assigned_by)
           select cr.id, cp.id, 'assigned', $1 from care_requests cr, clinician_profiles cp
            where cr.user_id = $1 and cp.user_id = $1 limit 1 returning id`,
  },
  {
    table: "care_appointments",
    seed: `insert into care_appointments (care_request_id, clinician_id, patient_id, mode, state)
           select cr.id, cp.id, $1, 'text', 'assigned' from care_requests cr, clinician_profiles cp
            where cr.user_id = $1 and cp.user_id = $1 limit 1 returning id`,
  },
  {
    table: "appointment_status_events",
    seed: `insert into appointment_status_events (appointment_id, actor_id, next_state)
           select a.id, $1, 'assigned' from care_appointments a where a.patient_id = $1 limit 1 returning id`,
  },
  {
    table: "consultation_messages",
    seed: `insert into consultation_messages (appointment_id, sender_id, sender_role, body, client_created_at)
           select a.id, $1, 'patient', 'hello', now() from care_appointments a where a.patient_id = $1 limit 1 returning id`,
  },
  {
    table: "consultation_audit_events",
    seed: `insert into consultation_audit_events (appointment_id, actor_id, event)
           select a.id, $1, 'signal:join' from care_appointments a where a.patient_id = $1 limit 1 returning id`,
  },
  {
    table: "clinician_document_access",
    seed: `insert into clinician_document_access (care_request_id, clinician_profile_id)
           select cr.id, cp.id from care_requests cr, clinician_profiles cp
            where cr.user_id = $1 and cp.user_id = $1 limit 1 returning id`,
  },
  {
    table: "clinician_document_access_audit",
    seed: `insert into clinician_document_access_audit (care_request_id, clinician_profile_id, document_id, event)
           select cr.id, cp.id, d.id, 'access_granted'
             from care_requests cr, clinician_profiles cp, documents d
            where cr.user_id = $1 and cp.user_id = $1 and d.user_id = $1 limit 1 returning id`,
  },
  {
    table: "pharmacy_stock_events",
    seed: `insert into pharmacy_stock_events (pharmacy_id, medicine_id, medicine_label, status, updated_by, idempotency_key)
           select p.id, 'med-rls', 'RLS medicine', 'available', $1, gen_random_uuid()::text
             from pharmacies p limit 1 returning id`,
  },
  {
    table: "pharmacy_availability_requests",
    seed: `insert into pharmacy_availability_requests (patient_id, pharmacy_id, medicine_id, medicine_label, idempotency_key)
           select $1, p.id, 'med-rls', 'RLS medicine', gen_random_uuid()::text
             from pharmacies p limit 1 returning id`,
  },{ table: "pharmacy_memberships",
    seed: `select id from pharmacy_memberships where user_id = $1 and pharmacy_id = (select id from pharmacies limit 1)`,
  },
  {
    table: "health_card_facts",
    probe: "user_id",
    seed: `insert into health_card_facts (user_id) values ($1) returning user_id::text as id`,
  },
];

describe("Phase 6 §6 — RLS on the migrated schema", () => {
  let db: HealthfolioDb;
  let patientA: string;
  let patientB: string;
  let portfolioA: string;
  let portfolioB: string;

  beforeEach(async () => {
    // Fresh PGlite per test case: beforeAll ran once per test file and PGlite
    // retains its schema+data across the 7 cases, so the Patient B chain was
    // inserted twice and collided with the UNIQUE constraints the migrations
    // carry. A fresh DB makes every probe deterministic.
    db = await createHealthfolioDb({ quiet: true });
    expect(db.migrationFailures).toEqual([]);

    patientA = await createAuthUser(db, "rls-a@example.test");
    patientB = await createAuthUser(db, "rls-b@example.test");

    // Explicit `id` on every user-owned row. These tables have no default and
    // no `auth.uid()` default, so both identities get their own row.
    await db.sql.query(
      "insert into profiles (id, display_name) values ($1, 'RLS A')",
      [patientA]
    );
    await db.sql.query(
      "insert into profiles (id, display_name) values ($1, 'RLS B')",
      [patientB]
    );

    // Better Auth's canonical table, needed by app_roles/health_card_facts.
    await db.sql.query(
      'insert into "user" (id, name, email) values ($1::uuid, $2, $3)',
      [patientA, "RLS A", "rls-a@example.test"]
    );
    await db.sql.query(
      'insert into "user" (id, name, email) values ($1::uuid, $2, $3)',
      [patientB, "RLS B", "rls-b@example.test"]
    );

    await db.sql.query("insert into facilities (name) values ('RLS Facility')");
    await db.sql.query(
      `insert into pharmacies (name, verification_state) values ('RLS Pharmacy', 'verified')`
    );

    // Full Patient B chain: every table that probes reference an existing B row
    // (care_requests, documents, clinician_profiles, pharmacies, facilities).
    // Full Patient B chain: every table that probes reference an existing B row
    // (care_requests, documents, clinician_profiles, pharmacies, facilities).
    // Self-contained for $1 (owner UUID) so a single insert cannot leak B's rows.
    await db.asRole("service_role");
    const a = await db.sql.query<{ id: string }>(
      "insert into portfolios (user_id, label) values ($1, 'A') returning id",
      [patientA]
    );
    const b = await db.sql.query<{ id: string }>(
      "insert into portfolios (user_id, label) values ($1, 'B') returning id",
      [patientB]
    );
    portfolioA = a.rows[0].id;
    portfolioB = b.rows[0].id;

    await db.sql.query(
      `insert into care_requests (user_id, reason, idempotency_key) values ($1, 'A request', 'a-key')`,
      [patientA]
    );
    await db.sql.query(
      `insert into care_requests (user_id, reason, idempotency_key) values ($1, 'B request', 'b-key')`,
      [patientB]
    );
    await db.sql.query(
      `insert into documents (id, user_id, portfolio_id, original_name, storage_path, mime_type, size_bytes)
       values (gen_random_uuid(), $1, $2, 'a.pdf', 'a/a.pdf', 'application/pdf', 10)`,
      [patientA, portfolioA]
    );
    await db.sql.query(
      `insert into documents (id, user_id, portfolio_id, original_name, storage_path, mime_type, size_bytes)
       values (gen_random_uuid(), $1, $2, 'b.pdf', 'b/b.pdf', 'application/pdf', 10)`,
      [patientB, portfolioB]
    );
    await db.sql.query(
      `insert into clinician_profiles (user_id, display_name) values ($1, 'RLS Clinician')`,
      [patientB]
    );
    await db.sql.query(
      `insert into clinician_availability (clinician_id, state, changed_by)
       select cp.id, 'available', $1 from clinician_profiles cp where cp.user_id = $1`,
      [patientB]
    );
    await db.sql.query(
      `insert into care_request_assignments (care_request_id, clinician_id, state, assigned_by)
       select cr.id, cp.id, 'assigned', $1 from care_requests cr, clinician_profiles cp
        where cr.user_id = $1 and cp.user_id = $1`,
      [patientB]
    );
    await db.sql.query(
      `insert into care_appointments (care_request_id, clinician_id, patient_id, mode, state)
       select cr.id, cp.id, $1, 'text', 'assigned' from care_requests cr, clinician_profiles cp
        where cr.user_id = $1 and cp.user_id = $1`,
      [patientB]
    );
    await db.sql.query(
      `insert into facility_memberships (user_id, facility_id, role)
       select $1, f.id, 'clinician' from facilities f limit 1`,
      [patientB]
    );
    await db.sql.query(
      `insert into clinician_document_access (care_request_id, clinician_profile_id)
       select cr.id, cp.id from care_requests cr, clinician_profiles cp
        where cr.user_id = $1 and cp.user_id = $1`,
      [patientB]
    );
    await db.sql.query(
      `insert into clinician_document_access_audit (care_request_id, clinician_profile_id, document_id, event)
       select cr.id, cp.id, d.id, 'access_granted'
         from care_requests cr, clinician_profiles cp, documents d
        where cr.user_id = $1 and cp.user_id = $1 and d.user_id = $1`,
      [patientB]
    );
    await db.sql.query(
      `insert into pharmacy_stock_events (pharmacy_id, medicine_id, medicine_label, status, updated_by, idempotency_key)
       select p.id, 'med-rls', 'RLS medicine', 'available', $1, gen_random_uuid()::text
         from pharmacies p`,
      [patientB]
    );
    await db.sql.query(
      `insert into pharmacy_availability_requests (patient_id, pharmacy_id, medicine_id, medicine_label, idempotency_key)
       select $1, p.id, 'med-rls', 'RLS medicine', gen_random_uuid()::text
         from pharmacies p`,
      [patientB]
    );
    await db.sql.query(
      `insert into pharmacy_memberships (user_id, pharmacy_id, role)
       select $1, p.id, 'operator' from pharmacies p
       on conflict (user_id, pharmacy_id) do nothing`,
      [patientB]
    );
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  it("hides and protects every cross-user row from another authenticated patient", async () => {
    const failures: string[] = [];

    for (const { table, seed, probe: probeColumn } of CASES) {
      // Patient B's row is written as service_role (the app's server
      // connection) so any owner-bypass bug is caught. Probing MUST go through
      // patient A's authenticated connection, never service_role.
      await db.asRole("service_role");
      let rowId: string;
      try {
        const params = seed.includes("$2") ? [patientB, portfolioB] : [patientB];
        const seeded = await db.sql.query<{ id: string }>(seed, params);
        rowId = seeded.rows[0]?.id;
        if (!rowId) throw new Error("seed returned no rows");
      } catch (error) {
        failures.push(`${table}: seed failed — ${(error as Error).message.split("\n")[0]}`);
        continue;
      }

      // Patient A (authenticated) may read B's row ONLY where the actual
      // policy allows it (pharmacy_stock_events: every verified pharmacy's
      // events are visible to any authenticated user). Everything else must be
      // invisible to A. The invariant is integrity: A can never MODIFY or
      // DELETE another patient's row.
      const probe = probeColumn ?? "id";
      const readAllowedByPolicy = table === "pharmacy_stock_events";
      if (!readAllowedByPolicy) {
        await db.asUser(patientA);
        const visible = await db.sql.query<{ count: number }>(
          `select count(*)::int as count from ${table} where ${probe}::text = $1`,
          [rowId]
        );
        if (visible.rows[0].count !== 0) {
          failures.push(`${table}: A can READ B's row`);
        }
      }

      // …nor modify or delete it.
      await db.asUser(patientA);
      const updated = await db.sql.query(
        `update ${table} set ${probe} = ${probe} where ${probe}::text = $1`,
        [rowId]
      );
      if ((updated.affectedRows ?? 0) !== 0) {
        failures.push(`${table}: A can UPDATE B's row`);
      }
      const deleted = await db.sql.query(`delete from ${table} where ${probe}::text = $1`, [
        rowId,
      ]);
      if ((deleted.affectedRows ?? 0) !== 0) {
        failures.push(`${table}: A can DELETE B's row`);
      }

      // anon must not see it either (or must be denied outright).
      await db.asAnon();
      try {
        const anon = await db.sql.query<{ count: number }>(
          `select count(*)::int as count from ${table} where ${probe}::text = $1`,
          [rowId]
        );
        if (anon.rows[0].count !== 0) {
          failures.push(`${table}: anon can READ the row`);
        }
      } catch {
        // denied by privilege — acceptable
      }

      // The row is untouched for the server.
      await db.asRole("service_role");
      const still = await db.sql.query<{ count: number }>(
        `select count(*)::int as count from ${table} where ${probe}::text = $1`,
        [rowId]
      );
      if (still.rows[0].count !== 1) {
        failures.push(`${table}: row vanished after the probes`);
      }
    }

    expect(failures).toEqual([]);
  }, 120_000);

  it("rejects an insert that claims another user's ownership", async () => {
    const failures: string[] = [];
    const attempts: [string, string][] = [
      [
        "profiles",
        `insert into profiles (id, display_name) values ($1, 'stolen')`,
      ],
      ["portfolios", `insert into portfolios (user_id, label) values ($1, 'stolen')`],
      [
        "documents",
        `insert into documents (id, user_id, portfolio_id, original_name, storage_path, mime_type, size_bytes)
         values (gen_random_uuid(), $1, $2, 'stolen.pdf', 'stolen.pdf', 'application/pdf', 1)`,
      ],
      [
        "care_requests",
        `insert into care_requests (user_id, reason, idempotency_key) values ($1, 'stolen', gen_random_uuid()::text)`,
      ],
      [
        "consents",
        `insert into consents (user_id, consent_type, policy_version) values ($1, 'privacy', '1.0')`,
      ],
      ["reminders", `insert into reminders (user_id, remind_at, message) values ($1, now(), 'stolen')`],
      ["audit_events", `insert into audit_events (user_id, action, resource_type) values ($1, 'x', 'y')`],
    ];

    for (const [label, sql] of attempts) {
      await db.asUser(patientA);
      let rejected = false;
      let insertedWithStolenOwner = false;
      try {
        const res = await db.sql.query(sql, sql.includes("$2") ? [patientB, portfolioA] : [patientB]);
        insertedWithStolenOwner = (res.affectedRows ?? res.rows.length) > 0;
      } catch {
        rejected = true;
      }
      if (!rejected && insertedWithStolenOwner) {
        failures.push(`${label}: A inserted a row owned by B (WITH CHECK missing)`);
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it("service_role bypasses RLS — why every call site must scope its own queries", async () => {
    await db.asRole("service_role");
    const { rows } = await db.sql.query<{ count: number }>(
      "select count(*)::int as count from profiles"
    );
    expect(rows[0].count).toBeGreaterThanOrEqual(2);
  });

  it("enables RLS on every table in the public schema", async () => {
    const { rows } = await db.sql.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
        order by c.relname`
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("keeps the policy-less (server-only) table set to a reviewed allow-list", async () => {
    const { rows } = await db.sql.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
        order by c.relname`
    );
    // RLS enabled with zero policies: anon/authenticated cannot read a single
    // row, and the server reaches them with the service-role key. Reviewed
    // 2026-10-05 — adding a table here is a deliberate security decision.
    expect(rows.map((r) => r.relname)).toEqual([
      "account",
      "app_roles",
      "doctor_applications",
      "facility_assignments",
      "health_card_facts",
      "ownership_transfer_events",
      "patient_share_grants",
      "role_policy_events",
      "session",
      "staff_admin_audit_events",
      "user",
      "user_roles",
      "verification",
    ]);
  });

  it("does not expose Better Auth credentials or sessions to the API roles", async () => {
    // Regression test for the Phase 6 finding: before migration 031 these four
    // tables had RLS disabled while holding Supabase's default grants to
    // anon/authenticated, so the public anon key could read session tokens,
    // credential hashes and user PII.
    await db.asRole("service_role");
    await db.sql.query(
      `insert into "user" (id, name, email) values ($1, 'Victim', 'victim@example.test')`,
      ["22222222-2222-4222-8222-222222222222"]
    );
    await db.sql.query(
      `insert into "session" ("expiresAt", token, "userId") values (now() + interval '1 day', $1, $2)`,
      ["SECRET-SESSION-TOKEN", "22222222-2222-4222-8222-222222222222"]
    );
    await db.sql.query(
      `insert into "account" ("accountId", "providerId", "userId", password) values ($1, 'credential', $2, $3)`,
      [
        "victim@example.test",
        "22222222-2222-4222-8222-222222222222",
        "$2b$10$HASHED",
      ]
    );

    for (const role of ["anon", "authenticated"] as const) {
      if (role === "anon") await db.asAnon();
      else await db.asUser(patientA);
      for (const table of ["user", "session", "account", "verification"] as const) {
        let rows: number | "denied";
        try {
          const res = await db.sql.query<{ count: number }>(
            `select count(*)::int as count from "${table}"`
          );
          rows = res.rows[0].count;
        } catch {
          rows = "denied";
        }
        expect(`${role}:${table}=${rows}`).toBe(`${role}:${table}=denied`);
      }
    }

    // Better Auth itself connects over DATABASE_URL as the table owner, and a
    // table owner bypasses its own RLS — so auth still works.
    await db.asRole("service_role");
    const owner = await db.sql.query<{ count: number }>(
      'select count(*)::int as count from "session"'
    );
    expect(owner.rows[0].count).toBeGreaterThanOrEqual(1);
    await db.sql.query(
      'update "session" set token = $1 where token = $2',
      ["ROTATED-TOKEN", "SECRET-SESSION-TOKEN"]
    );
    await db.sql.query('delete from "session" where token = $1', ["ROTATED-TOKEN"]);
  });

  it("protects private storage objects by folder ownership", async () => {
    await db.asRole("service_role");
    await db.sql.query(
      "insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)",
      [ `${patientB}/private/secret.pdf`, patientB]
    );

    await db.asUser(patientB);
    const own = await db.sql.query<{ count: number }>(
      "select count(*)::int as count from storage.objects where name like $1",
      [`${patientB}/%`]
    );
    expect(own.rows[0].count).toBe(1);

    await db.asUser(patientA);
    const foreign = await db.sql.query<{ count: number }>(
      "select count(*)::int as count from storage.objects where name like $1",
      [`${patientB}/%`]
    );
    expect(foreign.rows[0].count).toBe(0);
  });
});
