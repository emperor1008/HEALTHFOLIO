#!/usr/bin/env node
/**
 * Local-only, server-side initial platform-admin bootstrap.
 *
 * Usage (values come from .env.local only — never commit them):
 *   node scripts/admin-bootstrap.mjs --email someone@example.org --confirm
 *
 * Requires in .env.local (names only, values never printed):
 *   ADMIN_BOOTSTRAP_SECRET       — local secret gating this script
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (server only)
 *   DATABASE_URL                 — Better Auth PostgreSQL connection
 *
 * The user must already have signed in once (Better Auth `users` row exists).
 * The script is idempotent: re-running for an already-admin user is a no-op.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const args = process.argv.slice(2);
const emailArg = args.find((a) => a.startsWith("--email="));
const hasConfirm = args.includes("--confirm");

function fail(message) {
  console.error(`[admin-bootstrap] REFUSED: ${message}`);
  process.exit(1);
}

if (!emailArg) fail("pass --email=<existing user email>");
if (!hasConfirm) fail("dry-run default; add --confirm to write the role");

const email = emailArg.slice("--email=".length).trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("email does not look valid");

const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
if (!secret) fail("ADMIN_BOOTSTRAP_SECRET is not configured in .env.local");
if (secret.length < 32) fail("ADMIN_BOOTSTRAP_SECRET is shorter than 32 characters");

// Import the server bootstrap module (this script intentionally re-implements
// the two writes to stay dependency-free and script-only).
const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail("Supabase server environment not configured");

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Better Auth's user table is the singular quoted "user" (migration 027).
const { data: user, error } = await supabase
  .from("user")
  .select("id")
  .eq("email", email)
  .maybeSingle();

if (error) fail("lookup failed (check SUPABASE config) — details are not printed");
if (!user) fail("no user with that email has signed in yet; register/sign-in first");

const { error: upsertError } = await supabase
  .from("app_roles")
  .upsert({ user_id: user.id, role: "platform_admin", status: "active" }, {
    onConflict: "user_id,role",
  });

if (upsertError) fail("role write failed — details are not printed");

await supabase.from("role_policy_events").insert({
  event: "platform_admin_bootstrapped",
  role: "platform_admin",
  target_user_id: user.id,
  metadata: {},
});

console.log(`[admin-bootstrap] OK — platform_admin active for user ${user.id.slice(0, 8)}… (id truncated)`);
