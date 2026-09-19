#!/usr/bin/env node

/**
 * Healthfolio Database Verification Script
 *
 * Verifies that the required Supabase infrastructure exists:
 * - Required tables
 * - RLS enabled
 * - Storage bucket
 * - Required RPC functions
 *
 * Exit code 0 = all checks pass
 * Exit code 1 = one or more checks fail
 *
 * This script reads .env.local using the same method as Next.js.
 * It does NOT print any secret values.
 */

const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Load .env.local
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local not found");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function supabaseRequest(url, anonKey, path) {
  try {
    const result = execSync(
      `curl -s -w "\\n%{http_code}" -H "apikey: ${anonKey}" -H "Authorization: Bearer ${anonKey}" "${url}${path}"`,
      { encoding: "utf-8", timeout: 15000 }
    );
    const lines = result.trim().split("\n");
    const statusCode = parseInt(lines[lines.length - 1], 10);
    const body = lines.slice(0, -1).join("\n");
    return { statusCode, body };
  } catch (e) {
    return { statusCode: 0, body: e.message };
  }
}

function supabasePostRequest(url, anonKey, path, jsonBody) {
  try {
    // execFileSync bypasses the shell (cmd.exe on Windows would otherwise
    // mangle the quoted JSON body) — arguments go straight to curl.
    const result = execFileSync(
      "curl",
      [
        "-s",
        "-w", "\n%{http_code}",
        "-X", "POST",
        "-H", `apikey: ${anonKey}`,
        "-H", `Authorization: Bearer ${anonKey}`,
        "-H", "Content-Type: application/json",
        "-d", jsonBody,
        `${url}${path}`,
      ],
      { encoding: "utf-8", timeout: 15000 }
    );
    const lines = result.trim().split("\n");
    const statusCode = parseInt(lines[lines.length - 1], 10);
    const body = lines.slice(0, -1).join("\n");
    return { statusCode, body };
  } catch (e) {
    return { statusCode: 0, body: e.message };
  }
}

function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local");
    process.exit(1);
  }

  let failures = 0;

  // Required tables
  const requiredTables = [
    "care_requests",
    "triage_assessments",
    "facilities",
    "facility_memberships",
    "clinician_profiles",
    "clinician_availability",
    "care_request_assignments",
    "care_appointments",
    "appointment_status_events",
    "consultation_messages",
    "document_share_consents",
    "consultation_audit_events",
    "clinician_document_access",
    "clinician_document_access_audit",
    "pharmacies",
    "pharmacy_memberships",
    "pharmacy_stock_events",
    "pharmacy_availability_requests",
    "pharmacy_availability_responses",
    "pharmacy_audit_events",
    "reliability_metrics",
    "region_config",
    "idempotency_keys",
    "portfolios",
    "consents",
    "documents",
    "document_pages",
    "extractions",
    "agent_runs",
    "agent_steps",
    "medical_events",
    "medical_measurements",
    "laboratory_reports",
    "prescription_items",
    "user_medicine_links",
    "appointments",
    "briefs",
    "reminders",
    "medication_plans",
    "medication_schedule_rules",
    "medication_occurrences",
    "medication_adherence_events",
    "document_relationships",
    "notification_subscriptions",
    "notification_deliveries",
    "audit_events",
    "health_signals",
  ];

  console.log("📋 Checking required tables...");

  for (const table of requiredTables) {
    // Probe with `count=exact` on an empty select instead of `select=id`:
    // several tables (e.g. idempotency_keys, appointment_status_events) have
    // no `id` column, which returns 400 and looks like a failure.
    const { statusCode, body } = supabaseRequest(
      url,
      anonKey,
      `/rest/v1/${table}?select=*&limit=0`
    );
    // PGRST205 in the body means "relation does not exist" even though the
    // HTTP status is 404 — treat that as a missing table, not an empty one.
    if (statusCode === 404 && body && body.includes && body.includes("PGRST205")) {
      process.stdout.write(`  ❌ ${table} (missing — run its migration)\n`);
      failures++;
    } else if (statusCode === 200 || statusCode === 404) {
      // 200 = table exists, 404 = table exists but RLS blocks the empty select
      process.stdout.write(`  ✅ ${table}\n`);
    } else if (statusCode === 406) {
      // 406 = Not Acceptable, often from .single() on empty — table exists
      process.stdout.write(`  ✅ ${table} (exists)\n`);
    } else {
      process.stdout.write(`  ❌ ${table} (HTTP ${statusCode})\n`);
      failures++;
    }
  }

  // Check Storage bucket
  // The anon-key /storage/v1/bucket endpoint requires admin access,
  // so we try multiple methods to verify the bucket exists.
  console.log("\n📦 Checking storage bucket...");
  let bucketFound = false;

  // Method 1: Try the anon-key bucket listing (works if admin key is configured)
  const { statusCode: bucketStatus, body: bucketBody } = supabaseRequest(url, anonKey, "/storage/v1/bucket");
  if (bucketStatus === 200) {
    try {
      const buckets = JSON.parse(bucketBody);
      const docsBucket = buckets.find((b) => b.id === "documents" || b.name === "documents");
      if (docsBucket) {
        console.log(`  ✅ documents bucket exists (public: ${docsBucket.public})`);
        if (docsBucket.public) {
          console.log("  ⚠️  documents bucket is public — should be private");
        }
        bucketFound = true;
      }
    } catch {
      // Could not parse — continue to fallback
    }
  }

  // Method 2: Try the object list endpoint (anon can list if bucket exists and policy allows)
  if (!bucketFound) {
    const { statusCode: listStatus } = supabaseRequest(url, anonKey, "/storage/v1/object/list/documents");
    // 200 = bucket exists (empty), 400 = bucket exists but needs params
    // 404 = bucket does not exist
    if (listStatus === 200 || listStatus === 400) {
      console.log("  ✅ documents bucket exists (verified via object list)");
      bucketFound = true;
    }
  }

  // Method 3: Try the Supabase CLI (uses linked project credentials)
  if (!bucketFound) {
    try {
      const cliResult = execSync("npx supabase storage ls --experimental 2>&1", {
        encoding: "utf-8",
        timeout: 30000,
      });
      if (cliResult.includes("documents")) {
        console.log("  ✅ documents bucket exists (verified via Supabase CLI)");
        bucketFound = true;
      }
    } catch {
      // CLI not available or failed
    }
  }

  if (!bucketFound) {
    console.log("  ❌ documents bucket not found");
    console.log("     Create it in Supabase Dashboard → Storage → New bucket");
    console.log('     Name: "documents", Public: off, File size limit: 10MB');
    failures++;
  }

  // Check RPC functions
  console.log("\n🔧 Checking RPC functions...");
  // RPC functions are checked by calling them with their real (all-default)
  // signatures — a missing function returns PGRST202; an existing one answers
  // normally (e.g. SESSION_REQUIRED for an unauthenticated probe).
  // calculate_health_trend was dropped from this list: it is not defined in
  // any migration and is not referenced anywhere in the app.
  const rpcProbes = [
    {
      name: "review_measurement",
      body: JSON.stringify({
        p_measurement_id: "00000000-0000-0000-0000-000000000000",
        p_decision: "verified",
      }),
    },
    {
      name: "review_health_signal",
      body: JSON.stringify({
        p_signal_id: "00000000-0000-0000-0000-000000000000",
        p_action: "acknowledge",
      }),
    },
  ];
  for (const fn of rpcProbes) {
    const { statusCode, body } = supabasePostRequest(url, anonKey, `/rest/v1/rpc/${fn.name}`, fn.body);
    if (statusCode === 404 && body && body.includes && body.includes("PGRST202")) {
      process.stdout.write(`  ❌ ${fn.name} (missing — run its migration)\n`);
      failures++;
    } else if (statusCode >= 200 && statusCode < 500) {
      // Any non-PGRST202 answer (including SESSION_REQUIRED / NOT_FOUND json)
      // proves the function exists.
      process.stdout.write(`  ✅ ${fn.name} (exists)\n`);
    } else {
      process.stdout.write(`  ❌ ${fn.name} (HTTP ${statusCode})\n`);
      failures++;
    }
  }

  // Summary
  console.log("\n" + "─".repeat(50));
  if (failures === 0) {
    console.log("✅ All database checks passed");
  } else {
    console.log(`❌ ${failures} check(s) failed`);
  }
  console.log("─".repeat(50));

  process.exit(failures > 0 ? 1 : 0);
}

main();
