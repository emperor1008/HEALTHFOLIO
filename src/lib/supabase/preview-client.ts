/**
 * Preview data provider — the Supabase-shaped client used when the
 * application runs on the LOCAL database (preview mode or local development
 * without a configured remote project).
 *
 * It answers the exact call surface `@/lib/supabase/user-context.ts` hands to
 * the rest of the app (`from`, `rpc`, `storage`, `channel`, `removeChannel`),
 * backed by real SQL through `src/lib/db/postgrest-shim.ts` — the same code
 * path the Phase 6 integration tests execute. Nothing is fabricated: if a
 * query fails, the caller receives the real error.
 *
 * The one deliberate difference from a hosted client: `.auth.*` is no longer
 * Supabase's. Supabase Auth is not the identity provider any more, so the
 * adapter resolves identity through the application's centralized session
 * service (src/lib/auth-helpers). That keeps any legacy `supabase.auth.getUser()`
 * call site honest (it sees the same user as every other guard) instead of
 * returning a permanent 401 against a GoTrue host that does not exist.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SqlExecutor } from "@/lib/db/sql";
import { createSupabaseShim, type SupabaseShim } from "@/lib/db/postgrest-shim";
import { getUser } from "@/lib/auth-helpers";

const NOT_AUTHENTICATED = {
  message: "Not authenticated",
  code: "401",
  details: null,
  hint: null,
} as const;

function authAdapter() {
  return {
    async getUser() {
      const user = await getUser();
      if (!user)
        return { data: { user: null }, error: { ...NOT_AUTHENTICATED } };
      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        },
        error: null,
      };
    },
    async getSession() {
      const user = await getUser();
      if (!user)
        return { data: { session: null }, error: { ...NOT_AUTHENTICATED } };
      return {
        data: {
          session: {
            user: { id: user.id, email: user.email },
            access_token: "",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
        error: null,
      };
    },
    async signOut() {
      return { error: null };
    },
  };
}

/**
 * Build the preview client over a local SQL executor. `storage` and
 * `channel` come from the shared shim (metadata + in-process stand-ins).
 */
export function createPreviewSupabase(sql: SqlExecutor): SupabaseClient {
  const shim: SupabaseShim = createSupabaseShim(sql);
  const client = {
    ...shim,
    auth: authAdapter(),
    // Nothing in the app calls Postgres RPCs through `functions`; present so
    // an unexpected call fails loudly with a typed error rather than a crash.
    functions: {
      invoke: async (name: string) => ({
        data: null,
        error: {
          message: `Edge function "${name}" is not available in preview mode`,
          code: "PREVIEW",
        },
      }),
    },
  };
  return client as unknown as SupabaseClient;
}
