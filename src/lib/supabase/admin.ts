import { getServerSupabase } from "@/lib/supabase/user-context";

/**
 * Server-only Supabase client using the service-role key.
 *
 * Under Better Auth there is no Supabase session to fall back to: this client
 * is exclusively for server code that has ALREADY resolved a Better Auth
 * session and applied explicit ownership/role/consent filters to its queries.
 * Must NEVER be imported in client components or browser code.
 */
export async function createAdminClient() {
  return getServerSupabase();
}
