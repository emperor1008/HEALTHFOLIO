/**
 * Server-side data-access layer — one decision point for "which database?".
 *
 * Mode selection (evaluated from server environment only, never from a
 * browser variable):
 *
 *   1. `local`  — preview/demo mode is enabled, OR no valid remote database
 *                 is configured while running in local development. Uses
 *                 PGlite with the repository's real migrations (src/lib/db/local.ts).
 *   2. `remote` — a valid, configured application database exists (a real
 *                 Supabase URL + service-role key), or this is a production
 *                 deployment. Uses the hosted database exactly as before.
 *
 * Rules this encodes:
 *  - Production NEVER silently switches to a local database: `local` requires
 *    either an explicitly enabled preview deployment or NODE_ENV=development.
 *  - There is no runtime fallback on failure. If a real query fails it
 *    surfaces as an error; we never swap in another database mid-request.
 *  - Credentials stay server-side: nothing here is imported by client code.
 */
import type { SqlExecutor } from "@/lib/db/sql";
import { demoEnvEnabled } from "@/lib/preview/gate";

export type DbMode = "remote" | "local";

/** Values that mean "the operator pasted a template, not a real URL". */
const PLACEHOLDER_MARKERS = ["PASTE_YOUR", "YOUR_", "db..supabase.co", "xxx", "<", "example"];

export function looksLikePlaceholder(value: string | undefined | null): boolean {
  if (!value) return true;
  const v = value.trim();
  if (v.length === 0) return true;
  return PLACEHOLDER_MARKERS.some((m) => v.toUpperCase().includes(m.toUpperCase()));
}

/** A usable remote Supabase project (URL + service-role key) is configured. */
export function isRemoteDataConfigured(): boolean {
  return (
    !looksLikePlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !looksLikePlaceholder(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

/** A usable PostgreSQL connection string is configured. */
export function isDatabaseUrlConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  if (looksLikePlaceholder(url)) return false;
  return /^postgres(ql)?:\/\/\S+$/i.test((url ?? "").trim());
}

/**
 * Whether the application should use the LOCAL database for this process.
 * Exported for diagnostics and tests; `resolveDbMode()` is the normal entry.
 *
 * (Named without a leading `use` so React's hooks lint does not mistake it
 * for a Hook — this is plain server configuration.)
 */
export function localDatabaseEnabled(): boolean {
  if (demoEnvEnabled()) return true; // explicit preview deployment
  if (isRemoteDataConfigured() && isDatabaseUrlConfigured()) return false;
  // No usable remote database: local development gets a real local database;
  // anything else stays on the remote path (and fails honestly if unset).
  return process.env.NODE_ENV === "development";
}

export function resolveDbMode(): DbMode {
  return localDatabaseEnabled() ? "local" : "remote";
}

let pgPool: Promise<SqlExecutor> | null = null;

async function getRemoteSql(): Promise<SqlExecutor> {
  if (!isDatabaseUrlConfigured()) {
    throw new Error(
      "DATABASE_URL is not configured (or is still a placeholder). " +
        "Set a real PostgreSQL connection string, or run in local development / preview mode."
    );
  }
  if (!pgPool) {
    pgPool = (async () => {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
      return {
        async exec(sql: string) {
          await pool.query(sql);
        },
        async query<T>(sql: string, params: unknown[] = []) {
          const res = await pool.query(sql, params);
          return { rows: res.rows as T[], affectedRows: res.rowCount ?? 0 };
        },
      } satisfies SqlExecutor;
    })();
  }
  return pgPool;
}

/**
 * The SQL executor for auth tables and other direct SQL. Async so callers
 * await the boot of the local database (migrations) exactly once.
 */
export async function getSql(): Promise<SqlExecutor> {
  if (resolveDbMode() === "local") {
    const { getLocalDb } = await import("@/lib/db/local");
    return (await getLocalDb()).sql;
  }
  return getRemoteSql();
}
