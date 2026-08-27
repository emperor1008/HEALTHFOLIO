import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key.
 * Must NEVER be imported in client components or browser code.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
