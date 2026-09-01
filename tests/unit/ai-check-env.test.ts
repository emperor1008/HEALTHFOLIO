import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Tests proving ai-check.js loads .env.local configuration
 * without exposing any secret values.
 */

// process.cwd() is the project root in vitest
const SCRIPT = join(process.cwd(), "scripts", "ai-check.js");
const NODE = process.execPath; // Absolute path to the current node binary

function runScript(): string {
  // Build a clean environment without __NEXT_PROCESSED_ENV
  // so loadEnvConfig actually reads .env.local
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  delete cleanEnv.__NEXT_PROCESSED_ENV;

  const result = spawnSync(NODE, [SCRIPT], {
    cwd: process.cwd(),
    timeout: 15000,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: cleanEnv,
  });

  return result.stdout || "";
}

describe("ai-check.js loads .env.local", () => {
  it("reads AI_PROVIDER from .env.local (not just defaults)", () => {
    const output = runScript();
    expect(output).toContain("Provider:");
    // Should show the real provider from .env.local, not MISSING
    expect(output).not.toContain("Provider:     MISSING");
  });

  it("reads AI_REQUEST_TIMEOUT_MS from .env.local (not default 30000)", () => {
    const output = runScript();
    // Should show 120000ms (from .env.local), not 30000ms (the hardcoded default)
    expect(output).toContain("120000ms");
    expect(output).not.toContain("Timeout:      30000ms");
  });

  it("does not print any secret values in output", () => {
    const output = runScript();

    // Should not contain any secret-looking strings
    expect(output).not.toMatch(/sk-[a-zA-Z0-9]{20,}/); // OpenAI keys
    expect(output).not.toMatch(/service_role/i);
    expect(output).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(output).not.toMatch(/APP_ENCRYPTION_KEY/);
    expect(output).not.toMatch(/password/i);
    expect(output).not.toMatch(/token/i);
  });

  it("script file uses loadEnvConfig from @next/env", () => {
    const scriptContent = readFileSync(SCRIPT, "utf-8");
    expect(scriptContent).toContain('require("@next/env")');
    expect(scriptContent).toContain("loadEnvConfig(process.cwd())");
  });

  it("script reads process.env AFTER loadEnvConfig", () => {
    const scriptContent = readFileSync(SCRIPT, "utf-8");
    const loadEnvPos = scriptContent.indexOf("loadEnvConfig(process.cwd())");
    const firstEnvRead = scriptContent.indexOf("process.env.AI_PROVIDER");

    // loadEnvConfig must come before any process.env reads
    expect(loadEnvPos).toBeGreaterThan(-1);
    expect(firstEnvRead).toBeGreaterThan(loadEnvPos);
  });
});
