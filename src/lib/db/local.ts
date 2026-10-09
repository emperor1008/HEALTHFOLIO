/**
 * Local development / preview database runtime.
 *
 * The repository's database engine is PostgreSQL (schema + migrations in
 * `supabase/migrations`). When no valid remote database is configured — or
 * when preview mode is on — the app runs the SAME schema, migrations, CHECK
 * constraints, triggers and RLS policies against PGlite (PostgreSQL compiled
 * to WASM), which ships as a devDependency and needs no server.
 *
 * Why this is not a mock: queries are real SQL against the real migration
 * files. The only shimmed part is the Supabase platform (GoTrue auth schema,
 * storage schema, API roles), provided by `SUPABASE_COMPAT_SQL`.
 *
 * Persistence
 *  - Local development: `HF_LOCAL_DB_DIR` (default `.data/healthfolio`), so
 *    accounts and preview edits survive restarts.
 *  - Hosted preview: the same code path. If the preview host has an ephemeral
 *    filesystem the data disappears on redeploy/restart — documented in
 *    `.env.example` and docs/preview-mode.md.
 *
 * Nothing here ever touches a production database: the caller decides the
 * mode (src/lib/db/index.ts), which only selects "local" when the deployment
 * is local development or an explicitly designated preview.
 */
import fs from "node:fs";
import path from "node:path";
import type { SqlExecutor } from "@/lib/db/sql";
import { SUPABASE_COMPAT_SQL } from "@/lib/db/supabase-compat";

export interface LocalDb {
  sql: SqlExecutor;
  /** Where the database files live; "in-memory" when persistence is off. */
  dataDir: string | null;
  /** Migrations that failed to apply (empty on a healthy boot). */
  migrationFailures: string[];
  /** Migration files applied on THIS boot. */
  migrationsApplied: string[];
}

interface CachedDb {
  promise: Promise<LocalDb>;
}

const globalStore = globalThis as unknown as {
  __healthfolioLocalDb?: CachedDb;
};

function migrationsDir(): string {
  return path.join(process.cwd(), "supabase", "migrations");
}

async function applyMigrations(db: LocalDb): Promise<void> {
  await db.sql.exec(
    `create table if not exists hf_local_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     )`
  );
  const { rows } = await db.sql.query<{ filename: string }>(
    "select filename from hf_local_migrations"
  );
  const done = new Set(rows.map((r) => r.filename));
  const files = fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir(), file), "utf8");
    try {
      await db.sql.exec(sql);
      await db.sql.query("insert into hf_local_migrations (filename) values ($1)", [file]);
      db.migrationsApplied.push(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.migrationFailures.push(`${file}: ${message.split("\n")[0]}`);
      // eslint-disable-next-line no-console
      console.warn(`[local-db] migration failed: ${file} — ${message.split("\n")[0]}`);
    }
  }
}

async function open(): Promise<LocalDb> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { uuid_ossp } = await import("@electric-sql/pglite/contrib/uuid_ossp");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");

  const dir = process.env.HF_LOCAL_DB_DIR?.trim() || ".data/healthfolio";
  let pg: InstanceType<typeof PGlite>;
  let dataDir: string | null = dir;
  try {
    fs.mkdirSync(dir, { recursive: true });
    pg = new PGlite(dir, { extensions: { uuid_ossp, pgcrypto } });
  } catch {
    // Read-only or unavailable filesystem (some hosted previews): fall back to
    // an in-memory database. The caller documents that this is ephemeral.
    dataDir = null;
    pg = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  }
  const sql = pg as unknown as SqlExecutor;

  // Supabase platform pieces — only on a fresh database (they are not
  // idempotent: `create role` has no IF NOT EXISTS).
  const compat = await sql.query<{ present: number }>(
    "select case when to_regclass('auth.users') is null then 1 else 0 end::int as present"
  );
  if (compat.rows[0]?.present === 1) {
    await sql.exec(SUPABASE_COMPAT_SQL);
  }
  await sql.exec(`grant usage on schema public to anon, authenticated, service_role;`);

  const db: LocalDb = {
    sql,
    dataDir,
    migrationFailures: [],
    migrationsApplied: [],
  };
  await applyMigrations(db);
  await seedIfPreview(db);
  return db;
}

/**
 * Seed the synthetic preview dataset — ONLY when preview/demo mode is
 * enabled. A plain local-development database stays empty so a real
 * registration flow can be exercised against it.
 */
async function seedIfPreview(db: LocalDb): Promise<void> {
  try {
    const { demoEnvEnabled } = await import("@/lib/preview/gate");
    if (!demoEnvEnabled()) return;
    const { ensurePreviewSeed } = await import("@/lib/db/seed");
    const roles = (process.env.HF_DEMO_ROLES ?? "patient")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    await ensurePreviewSeed(db.sql, roles);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`[local-db] preview seed skipped: ${message.split("\n")[0]}`);
  }
}

/**
 * Boot (or reuse) the process-wide local database. Cached on `globalThis` so
 * Next.js dev-mode module invalidation does not open a second database.
 */
export async function getLocalDb(): Promise<LocalDb> {
  if (!globalStore.__healthfolioLocalDb) {
    globalStore.__healthfolioLocalDb = { promise: open() };
  }
  return globalStore.__healthfolioLocalDb.promise;
}

/** Test helper: drop the cached database. */
export function resetLocalDbCache(): void {
  delete globalStore.__healthfolioLocalDb;
}

/**
 * Close the process-wide database and forget it (used by tests so the WASM
 * runtime does not keep the worker alive after the suite finishes).
 */
export async function closeLocalDb(): Promise<void> {
  const cached = globalStore.__healthfolioLocalDb;
  if (!cached) return;
  delete globalStore.__healthfolioLocalDb;
  try {
    const db = await cached.promise;
    const closeable = db.sql as { close?: () => Promise<void> };
    await closeable.close?.();
  } catch {
    // already closed / never opened
  }
}
