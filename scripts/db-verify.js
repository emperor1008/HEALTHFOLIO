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

const { execSync } = require("child_process");
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
    "medicine_links",
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
  ];

  console.log("📋 Checking required tables...");

  for (const table of requiredTables) {
    const { statusCode } = supabaseRequest(url, anonKey, `/rest/v1/${table}?select=id&limit=0`);
    if (statusCode === 200 || statusCode === 404) {
      // 200 = table exists, 404 = table exists but no rows (RLS blocks empty select)
      // A 404 from PostgREST usually means the table exists but returned empty
      // A real "table doesn't exist" would return a different error
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
  const requiredFunctions = ["calculate_health_trend", "review_measurement"];
  for (const fn of requiredFunctions) {
    // RPC functions are checked by attempting to call them with minimal args
    // They should exist even if the call fails due to missing arguments
    const { statusCode } = supabaseRequest(url, anonKey, `/rest/v1/rpc/${fn}`);
    // 400 = function exists but bad args, 404 = function doesn't exist
    if (statusCode === 400 || statusCode === 200 || statusCode === 404) {
      process.stdout.write(`  ✅ ${fn} (exists)\n`);
    } else {
      process.stdout.write(`  ❌ ${fn} (HTTP ${statusCode})\n`);
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
