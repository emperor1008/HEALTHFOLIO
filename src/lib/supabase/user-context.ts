/**
 * Server-side Supabase context for Better Auth sessions.
 *
 * Better Auth owns authentication now; Supabase auth no longer issues sessions.
 * Supabase remains the database and private-storage engine. Data access keeps
 * the same guarantees it had under RLS with auth.uid():
 *
 *  - Every user-context query is scoped by an explicit `ownerId` filter that
 *    the server resolves from the Better Auth session — client input can never
 *    choose the owner.
 *  - The connection uses the service-role key but ONLY inside server code
 *    (this module is imported exclusively by route handlers), and only after
 *    the Better Auth session was resolved (`getUser()` / `getSessionUser()`).
 *    THIS MODULE PROVIDES NO SCOPING HELPERS: every call site is individually
 *    responsible for adding the session-derived owner filter (`.eq("user_id",
 *    user.id)`) to every query, because the service-role connection bypasses
 *    RLS. New queries here must be reviewed for that filter.
 *  - RLS policies that reference auth.uid() remain in place for defense in
 *    depth (they simply no longer match browser connections, which are gone —
 *    the browser never talks to Supabase directly).
 *
 * NEVER import this from a client component.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let cached: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (cached) return cached;
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
