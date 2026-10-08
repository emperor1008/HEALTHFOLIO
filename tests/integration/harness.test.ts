// @vitest-environment node
/**
 * Harness self-check. If this file fails, every other Phase 6 integration
 * test is built on a broken foundation — so it asserts the strongest
 * available ground truth: every real migration applies, and RLS actually
 * denies cross-user reads on the migrated schema.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createHealthfolioDb, type HealthfolioDb } from "./support/pg-harness";

describe("Phase 6 harness: real Postgres + real migrations", () => {
  let db: HealthfolioDb;

  beforeAll(async () => {
    db = await createHealthfolioDb({ quiet: true });
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  it("applies every migration in supabase/migrations", () => {
    expect(db.migrationFailures).toEqual([]);
  });

  it("creates the Better Auth identity tables and the medical schema", async () => {
    const { rows } = await db.sql.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('user','session','account','app_roles','profiles','documents','care_requests','consents')
        order by table_name`
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "account",
      "app_roles",
      "care_requests",
      "consents",
      "documents",
      "profiles",
      "session",
      "user",
    ]);
  });

  it("enforces RLS: patient A cannot read patient B's profile", async () => {
    const patientA = await createAuthUser(db, "harness-a@example.test");
    const patientB = await createAuthUser(db, "harness-b@example.test");
    await db.sql.query("insert into profiles (id, display_name) values ($1, $2)", [
      patientA,
      "Harness A",
    ]);
    await db.sql.query("insert into profiles (id, display_name) values ($1, $2)", [
      patientB,
      "Harness B",
    ]);

    await db.asUser(patientA);
    const { rows } = await db.sql.query<{ id: string }>("select id from profiles");
    expect(rows.map((r) => r.id)).toEqual([patientA]);

    await db.asUser(patientB);
    const { rows: rowsB } = await db.sql.query<{ id: string }>("select id from profiles");
    expect(rowsB.map((r) => r.id)).toEqual([patientB]);
  });

  it("denies the anon role entirely", async () => {
    await db.asAnon();
    const { rows } = await db.sql.query("select id from profiles");
    expect(rows).toEqual([]);
  });

  it("lets service_role bypass RLS (the app's server connection)", async () => {
    await db.asRole("service_role");
    const { rows } = await db.sql.query<{ count: number }>(
      "select count(*)::int as count from profiles"
    );
    expect(rows[0].count).toBeGreaterThanOrEqual(2);
  });
});
