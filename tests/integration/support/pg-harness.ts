/**
 * Phase 6 integration harness — real PostgreSQL engine.
 *
 * Boots PGlite (PostgreSQL 18 compiled to WASM) and applies the repository's
 * REAL migration files in order, so integration tests exercise the actual
 * schema, constraints, triggers, and RLS policies rather than a hand-written
 * mock. A small Supabase-compatibility shim provides the pieces that only
 * exist inside a hosted Supabase project:
 *
 *   - `auth.users`, `auth.uid()`, `auth.role()`, `auth.jwt()`
 *   - `storage.buckets`, `storage.objects`, `storage.foldername()`
 *   - the `anon`, `authenticated`, `service_role` roles and Supabase's default
 *     table grants (service_role additionally gets BYPASSRLS, as in Supabase)
 *
 * Why PGlite: it is a local, zero-cost, deterministic Postgres. It lets the
 * Phase 6 RLS verification execute real policies. It is NOT the hosted
 * Supabase project — results from here are labelled
 * "NOT VERIFIED — EXTERNAL ENVIRONMENT" for anything that depends on hosted
 * infrastructure (hosted Postgres settings, PostgREST/GoTrue/Realtime/Storage
 * services, network auth). See docs/phase6-live-verification.md.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_COMPAT_SQL } from "@/lib/db/supabase-compat";

export interface SqlResult<T> {
  rows: T[];
  affectedRows?: number;
}

export interface SqlExecutor {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlResult<T>>;
}

/** Databases for the Phase 6 harness. `role` selects the RLS identity. */
export interface HealthfolioDb {
  sql: SqlExecutor;
  /** Switch the connection role: service_role (app), authenticated, or anon. */
  asRole(role: "anon" | "authenticated" | "service_role"): Promise<void>;
  /** Become an authenticated end user (sets the JWT claims auth.uid() reads). */
  asUser(userId: string, extraClaims?: Record<string, unknown>): Promise<void>;
  /** Clear JWT claims (anonymous request). */
  asAnon(): Promise<void>;
  close(): Promise<void>;
  /** Migrations that failed to apply — must be empty for a healthy harness. */
  migrationFailures: string[];
}

/**
 * Boot a database, apply the Supabase shim, then every migration in
 * `supabase/migrations` sorted by filename. Failures are collected (not
 * thrown) so a test can assert that the whole migration set applies.
 */
export async function createHealthfolioDb(options?: {
  migrationsDir?: string;
  quiet?: boolean;
}): Promise<HealthfolioDb> {
  const pg = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  const sql = pg as unknown as SqlExecutor;

  await sql.exec(SUPABASE_COMPAT_SQL);

  const dir =
    options?.migrationsDir ??
    path.join(process.cwd(), "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migrationFailures: string[] = [];
  for (const file of files) {
    const contents = fs.readFileSync(path.join(dir, file), "utf8");
    try {
      await sql.exec(contents);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      migrationFailures.push(`${file}: ${message.split("\n")[0]}`);
      if (!options?.quiet) {
        // eslint-disable-next-line no-console
        console.warn(
          `[pg-harness] migration failed: ${file} — ${message.split("\n")[0]}`,
        );
      }
    }
  }

  // RLS decides row visibility on top of the Supabase-style default
  // privileges installed by the shim.
  await sql.exec(
    `grant usage on schema public to anon, authenticated, service_role;`,
  );

  let closed = false;
  const db: HealthfolioDb = {
    sql,
    migrationFailures,
    async asRole(role) {
      await sql.exec(`set role ${role}`);
    },
    async asUser(userId, extraClaims) {
      await sql.exec("set role authenticated");
      await sql.query("select set_config('request.jwt.claim.sub', $1, false)", [
        userId,
      ]);
      await sql.query(
        "select set_config('request.jwt.claim.role', $1, false)",
        ["authenticated"],
      );
      const claims = JSON.stringify({
        sub: userId,
        role: "authenticated",
        ...extraClaims,
      });
      await sql.query("select set_config('request.jwt.claims', $1, false)", [
        claims,
      ]);
    },
    async asAnon() {
      await sql.exec("set role anon");
      await sql.exec("select set_config('request.jwt.claim.sub', '', false)");
      await sql.exec("select set_config('request.jwt.claims', '', false)");
    },
    async close() {
      if (closed) return;
      closed = true;
      await pg.close();
    },
  };

  return db;
}

/** Insert an auth.users row (GoTrue identity) and return its UUID. */
export async function createAuthUser(
  db: HealthfolioDb,
  email: string,
): Promise<string> {
  const { rows } = await db.sql.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0].id;
}
