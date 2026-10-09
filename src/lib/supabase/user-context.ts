/**
 * Server-side Supabase context for application sessions.
 *
 * Authentication (the centralized session service in `src/lib/auth-session.ts`)
 * owns identity; Supabase remains the database and private-storage engine.
 * Data access keeps the same guarantees it had under RLS with auth.uid():
 *
 *  - Every user-context query is scoped by an explicit `ownerId` filter that
 *    the server resolves from the session — client input can never choose the
 *    owner.
 *  - The connection uses the service-role key but ONLY inside server code
 *    (this module is imported exclusively by route handlers), and only after
 *    the session was resolved (`getUser()` / `getSessionUser()`).
 *    THIS MODULE PROVIDES NO SCOPING HELPERS: every call site is individually
 *    responsible for adding the session-derived owner filter (`.eq("user_id",
 *    user.id)`) to every query, because the service-role connection bypasses
 *    RLS. New queries here must be reviewed for that filter.
 *  - RLS policies that reference auth.uid() remain in place for defense in
 *    depth (they simply no longer match browser connections, which are gone —
 *    the browser never talks to Supabase directly).
 *
 * LOCAL / PREVIEW MODE
 *  - When `resolveDbMode()` says "local" (preview mode enabled, or local
 *    development with no valid remote project configured) the same call
 *    surface is served by the local database through `createPreviewSupabase`,
 *    which executes real SQL against the repository's real migrations.
 *  - The switch comes from server environment configuration only — never from
 *    a request value, never from a browser variable, and never as a fallback
 *    after a real query fails.
 *
 * NEVER import this from a client component.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveDbMode } from "@/lib/db";
import type { SqlExecutor } from "@/lib/db/sql";
import { createPreviewSupabase } from "@/lib/supabase/preview-client";

let cached: SupabaseClient | null = null;

/**
 * A SQL executor whose calls wait for the local database to finish booting
 * (open + compat schema + migrations) exactly once. Returning a promise from
 * every method is all the shim needs, so `getServerSupabase()` can stay
 * synchronous for its 80+ call sites.
 */
function deferredLocalSql(): SqlExecutor {
  return {
    exec: (sql: string) =>
      import("@/lib/db/local")
        .then((m) => m.getLocalDb())
        .then((db) => db.sql.exec(sql)),
    query: <T>(sql: string, params: unknown[] = []) =>
      import("@/lib/db/local")
        .then((m) => m.getLocalDb())
        .then((db) => db.sql.query<T>(sql, params)),
  };
}

export function getServerSupabase(): SupabaseClient {
  if (cached) return cached;

  if (resolveDbMode() === "local") {
    cached = createPreviewSupabase(deferredLocalSql());
    return cached;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase server environment is not configured");
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/** Test helper: drop the cached client (used when the mode changes). */
export function resetServerSupabaseCache(): void {
  cached = null;
}
