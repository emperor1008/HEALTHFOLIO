#!/usr/bin/env node
/**
 * staff:bootstrap — secure, local-only, first-admin/staff provisioning.
 *
 * SECURITY CONTRACT
 * - Runs ONLY on a trusted machine. Reads SUPABASE_SERVICE_ROLE_KEY from
 *   .env.local and never sends it anywhere except the project's own Supabase
 *   URL. Never prints any secret value.
 * - Writes only via the service-role REST API. The browser has no path to
 *   these tables (user_roles has no RLS policies for clients).
 * - Requires an explicit --confirm flag to write anything; without it the
 *   script prints the plan and exits (dry-run).
 * - Idempotent: re-running with the same arguments produces the same state.
 * - Logs only safe identifiers (truncated user id, role, outcome) — never
 *   emails, tokens, or keys.
 *
 * Usage:
 *   node scripts/staff-bootstrap.mjs --role platform_admin --user <uuid> --confirm
 *   node scripts/staff-bootstrap.mjs --role clinician --email <email> \
 *        --scope <facility-uuid> [--actor <admin-uuid>] --confirm
 *
 * Roles: platform_admin | facility_coordinator | clinician |
 *        pharmacy_manager | pharmacy_operator
 * (platform_admin must exist before any scoped role can be granted from the
 *  web console; use this script for the first platform_admin only.)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local not found next to the project root. Refusing to run.");
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

const ASSIGNABLE = [
  "platform_admin",
  "facility_coordinator",
  "clinician",
  "pharmacy_manager",
  "pharmacy_operator",
];
const SCOPED = {
  clinician: { table: "facility_memberships", role: "clinician", column: "facility_id" },
  facility_coordinator: { table: "facility_memberships", role: "coordinator", column: "facility_id" },
  pharmacy_operator: { table: "pharmacy_memberships", role: "operator", column: "pharmacy_id" },
  pharmacy_manager: { table: "pharmacy_memberships", role: "manager", column: "pharmacy_id" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") args.confirm = true;
    else if (a === "--user") args.user = argv[++i];
    else if (a === "--email") args.email = argv[++i];
    else if (a === "--scope") args.scope = argv[++i];
    else if (a === "--actor") args.actor = argv[++i];
    else if (a === "--role") args.role = argv[++i];
  }
  return args;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    fail(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must both be set in .env.local. Refusing to run."
    );
  }

  const args = parseArgs(process.argv.slice(2));

  if (!args.role || !ASSIGNABLE.includes(args.role)) {
    fail(`--role must be one of: ${ASSIGNABLE.join(", ")}`);
  }
  if (!args.user && !args.email) {
    fail("Provide the target with --user <uuid> or --email <email>.");
  }
  if (args.user && !UUID_RE.test(args.user)) {
    fail("--user must be a UUID.");
  }
  if (args.actor && !UUID_RE.test(args.actor)) {
    fail("--actor must be a UUID.");
  }

  const scoped = SCOPED[args.role];
  if (scoped) {
    if (!args.scope || !UUID_RE.test(args.scope)) {
      fail(`--role ${args.role} requires --scope <${scoped.column}-uuid>.`);
    }
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Resolve target user.
  let userId = args.user ?? null;
  if (!userId) {
    // Find by email via the admin users endpoint (paginated scan; never logs
    // the email back).
    let page = 1;
    let found = null;
    while (found === null && page <= 10) {
      const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
        headers,
      });
      if (!res.ok) fail(`Could not query users directory (HTTP ${res.status}).`);
      const body = await res.json();
      const users = Array.isArray(body?.users) ? body.users : [];
      found = users.find((u) => (u.email ?? "").toLowerCase() === args.email.toLowerCase()) ?? null;
      if (users.length < 200) break;
      page++;
    }
    if (!found?.id) fail("No existing user matches the supplied email. Users must sign in to the app once first.");
    userId = found.id;
  }

  // Verify the target user actually exists.
  const userRes = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers });
  if (!userRes.ok) {
    fail(`No authenticated user with id ${userId.slice(0, 8)}… exists. Users must sign in once first.`);
  }

  const safeUser = `${userId.slice(0, 8)}…`;
  const plan = [
    `role:        ${args.role}`,
    `status:      active`,
    `target user: ${safeUser}`,
    scoped ? `scope:       ${scoped.column} ${args.scope.slice(0, 8)}…` : `scope:       (none)`,
    `mirror row:  ${scoped ? `${scoped.table} (${scoped.role})` : "(none)"}`,
    `write mode:  ${args.confirm ? "CONFIRMED" : "dry-run (add --confirm to write)"}`,
  ].join("\n");
  console.log(`\nBootstrap plan:\n${plan}\n`);

  if (!args.confirm) {
    console.log("Dry-run only. Re-run with --confirm to apply.");
    return;
  }

  // 1. Upsert the registry row (idempotent on user_id+role).
  const registryRow = {
    user_id: userId,
    role: args.role,
    status: "active",
    scope_id: scoped ? args.scope : null,
    assigned_by: args.actor ?? null,
  };
  const regRes = await fetch(
    `${url}/rest/v1/user_roles?on_conflict=user_id,role`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(registryRow),
    }
  );
  if (!regRes.ok) {
    const text = await regRes.text();
    fail(`Registry upsert failed (HTTP ${regRes.status}).${/\b(SIGNATURE|JWT|apikey)\b/i.test(text) ? "" : ""}`);
  }

  // 2. Mirror the scoped membership row so existing RLS scoping keeps working.
  if (scoped) {
    const memberRow = { user_id: userId, [scoped.column]: args.scope, role: scoped.role };
    const unique = scoped.table === "facility_memberships" ? "user_id,facility_id" : "user_id,pharmacy_id";
    const memRes = await fetch(`${url}/rest/v1/${scoped.table}?on_conflict=${unique}`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(memberRow),
    });
    if (!memRes.ok) fail(`Membership mirror failed (HTTP ${memRes.status}).`);
  }

  // 3. Append a safe audit event (actor may be null for script bootstraps).
  await fetch(`${url}/rest/v1/staff_admin_audit_events`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      actor_id: args.actor ?? null,
      action: "assign_role",
      target_user_id: userId,
      details: { role: args.role, source: "local_bootstrap_script" },
    }),
  });

  console.log(`✅ ${args.role} granted to ${safeUser} (active).`);
}

main().catch((e) => fail(e instanceof Error ? e.message : "Unexpected failure."));
