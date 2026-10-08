/**
 * Server-only platform-admin bootstrap primitives (used by
 * scripts/admin-bootstrap.mjs). Deliberately excluded from the Next build
 * via its scripts-only usage; never importable from client code.
 *
 * The first platform admin is created by running the local script with the
 * ADMIN_BOOTSTRAP_SECRET present in .env.local. No public API can ever create
 * a platform_admin.
 */
import { createClient } from "@supabase/supabase-js";

export interface BootstrapInput {
  email: string;
  secret: string | undefined;
}

export interface BootstrapOutcome {
  ok: boolean;
  reason?: string;
}

/**
 * Promote an existing Better Auth user (by email) to platform_admin.
 * Returns safe outcomes only — never echoes secrets or emails.
 */
export async function bootstrapPlatformAdmin(input: BootstrapInput): Promise<BootstrapOutcome> {
  const { email, secret } = input;

  if (!secret) return { ok: false, reason: "ADMIN_BOOTSTRAP_SECRET not configured" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, reason: "Supabase server env not configured" };

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up the Better Auth user by email (server-side, via service role).
  // Better Auth's table is the singular quoted "user" (migration 027).
  const { data: user, error } = await supabase
    .from("user")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (error) return { ok: false, reason: "lookup failed" };
  if (!user) return { ok: false, reason: "no user with that email has signed in yet" };

  const { error: upsertError } = await supabase
    .from("app_roles")
    .upsert(
      {
        user_id: user.id,
        role: "platform_admin",
        status: "active",
      },
      { onConflict: "user_id,role" }
    );

  if (upsertError) return { ok: false, reason: "role write failed" };

  await supabase.from("role_policy_events").insert({
    event: "platform_admin_bootstrapped",
    role: "platform_admin",
    target_user_id: user.id,
    metadata: {},
  });

  return { ok: true };
}
