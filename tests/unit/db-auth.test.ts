// @vitest-environment node
/**
 * Database-backed authentication (migration 032) + preview seed isolation.
 *
 * Runs against the repository's real migrations on a throwaway local
 * PostgreSQL (PGlite) directory, so hashing, uniqueness, session lifecycle and
 * foreign keys are exercised for real — not mocked.
 *
 * The environment is configured exactly as a preview deployment would be:
 * demo flag + preview designation + host allowlist + a local data directory.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(
  process.cwd(),
  ".data",
  `test-auth-${process.pid}-${Date.now()}`,
);

process.env.HF_DEMO_MODE = "true";
process.env.HF_DEPLOYMENT_ENV = "preview";
process.env.HF_PREVIEW_HOSTS = "preview.test";
process.env.HF_LOCAL_DB_DIR = DATA_DIR;

import {
  hashPassword,
  verifyPassword,
  registerAccount,
  verifyCredentials,
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  findAccountById,
} from "@/lib/auth/db-auth";
import { getSql } from "@/lib/db";
import { closeLocalDb } from "@/lib/db/local";
import { ensurePreviewSeed } from "@/lib/db/seed";
import { DEMO_USER_ID, DEMO_EMAIL } from "@/lib/preview/identity";

afterAll(async () => {
  await closeLocalDb();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

beforeAll(async () => {
  // Boot the local database (compat schema + every migration) once, outside
  // any single test's clock — the first migration run costs several seconds.
  await getSql();
}, 180_000);

describe("password hashing", () => {
  it("produces a scrypt hash with a per-password salt and never the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("correct horse battery staple");
    // scrypt$N$r$p$salt$hash
    expect(hash.split("$")).toHaveLength(6);

    const other = await hashPassword("correct horse battery staple");
    expect(other).not.toBe(hash); // fresh random salt every time
  });

  it("verifies the right password and rejects everything else", async () => {
    const hash = await hashPassword("s3cret-passphrase");
    await expect(verifyPassword("s3cret-passphrase", hash)).resolves.toBe(true);
    await expect(verifyPassword("s3cret-passphras", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("returns false (never throws) for malformed or foreign hash formats", async () => {
    for (const malformed of [
      "",
      "not-a-hash",
      "scrypt$1$2$3",
      "bcrypt$1$2$3$a$b",
    ]) {
      await expect(verifyPassword("anything", malformed)).resolves.toBe(false);
    }
  });
});

describe("accounts", () => {
  it("normalizes and lowercases the email, and rejects duplicates case-insensitively", async () => {
    const first = await registerAccount({
      email: "  Person@Example.COM ",
      password: "passphrase-123",
      displayName: "Demo Person",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.account.emailNormalized).toBe("person@example.com");
    expect(first.account.email).toBe("Person@Example.COM");

    const duplicate = await registerAccount({
      email: "PERSON@example.com",
      password: "another-passphrase",
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("EMAIL_TAKEN");
  });

  it("rejects invalid input instead of creating a row", async () => {
    const badEmail = await registerAccount({
      email: "nope",
      password: "passphrase-123",
    });
    expect(badEmail.ok).toBe(false);

    const weak = await registerAccount({
      email: "weak@example.com",
      password: "short",
    });
    expect(weak.ok).toBe(false);
    if (!weak.ok) expect(weak.code).toBe("WEAK_PASSWORD");
  });

  it("never reveals whether an email exists", async () => {
    await registerAccount({
      email: "known@example.com",
      password: "passphrase-123",
    });

    const wrongPassword = await verifyCredentials(
      "known@example.com",
      "wrong-password",
    );
    const unknownEmail = await verifyCredentials(
      "nobody@example.com",
      "wrong-password",
    );

    expect(wrongPassword).toBeNull();
    expect(unknownEmail).toBeNull(); // identical answer — no enumeration
  });

  it("authenticates correct credentials and stores no plaintext", async () => {
    const registered = await registerAccount({
      email: "login@example.com",
      password: "passphrase-123",
      displayName: "Login User",
    });
    expect(registered.ok).toBe(true);

    const account = await verifyCredentials(
      "Login@Example.com",
      "passphrase-123",
    );
    expect(account).not.toBeNull();
    expect(account?.email).toBe("login@example.com");

    const sql = await getSql();
    const { rows } = await sql.query<{ password_hash: string }>(
      "select password_hash from auth_accounts where email_normalized = $1",
      ["login@example.com"],
    );
    expect(rows[0].password_hash).not.toContain("passphrase-123");
    expect(rows[0].password_hash.startsWith("scrypt$")).toBe(true);
  });
});

describe("sessions", () => {
  it("round-trips an opaque token, storing only its hash", async () => {
    const registered = await registerAccount({
      email: "session@example.com",
      password: "passphrase-123",
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;

    const { token } = await createSession(registered.account.id, "vitest");
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/); // CSPRNG, base64url
    expect(token).not.toContain(".");

    const sql = await getSql();
    const { rows } = await sql.query<{ token_hash: string }>(
      "select token_hash from auth_sessions order by created_at desc limit 1",
    );
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex

    const resolved = await resolveSession(token);
    expect(resolved?.id).toBe(registered.account.id);

    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();
    // Revocation is idempotent.
    await expect(revokeSession(token)).resolves.toBeUndefined();
  });

  it("rejects unknown, expired and revoked tokens", async () => {
    const registered = await registerAccount({
      email: "expiry@example.com",
      password: "passphrase-123",
    });
    if (!registered.ok) throw new Error("registration failed");
    const sql = await getSql();

    expect(await resolveSession("does-not-exist")).toBeNull();

    const { token: expired } = await createSession(registered.account.id);
    await sql.query(
      "update auth_sessions set expires_at = now() - interval '1 minute'",
      [],
    );
    expect(await resolveSession(expired)).toBeNull();

    const { token: revoked } = await createSession(registered.account.id);
    await revokeAllSessions(registered.account.id);
    expect(await resolveSession(revoked)).toBeNull();
  });

  it("never resolves a session for a disabled account", async () => {
    const registered = await registerAccount({
      email: "disabled@example.com",
      password: "passphrase-123",
    });
    if (!registered.ok) throw new Error("registration failed");
    const sql = await getSql();
    const { token } = await createSession(registered.account.id);

    await sql.query("update auth_accounts set disabled = true where id = $1", [
      registered.account.id,
    ]);
    expect(await resolveSession(token)).toBeNull();
    expect(await findAccountById(registered.account.id)).toBeNull();
  });

  it("ignores JWT-shaped tokens (the previous provider's cookie)", async () => {
    expect(await resolveSession("header.payload.signature")).toBeNull();
    expect(
      await findAccountById("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});

describe("preview seed", () => {
  it("is idempotent and isolates every row to the reserved demo user", async () => {
    const sql = await getSql();

    await ensurePreviewSeed(sql, ["patient"]);
    const first = await counts(sql);
    await ensurePreviewSeed(sql, ["patient"]);
    const second = await counts(sql);

    expect(second).toEqual(first); // second run adds nothing
    expect(first.medical_events).toBeGreaterThan(0);
    expect(first.documents).toBeGreaterThan(0);

    // Every seeded row belongs to the demo identity — no other owner exists.
    const owners = await sql.query<{ user_id: string }>(
      `select distinct user_id from medical_events`,
    );
    expect(owners.rows.map((r) => r.user_id)).toEqual([DEMO_USER_ID]);

    const demoIdentity = await sql.query<{ id: string; email: string }>(
      `select id, email from auth.users where id = $1`,
      [DEMO_USER_ID],
    );
    expect(demoIdentity.rows[0]?.email).toBe(DEMO_EMAIL);
  }, 120_000);

  it("grants only roles that exist in the application's allowlist", async () => {
    const sql = await getSql();
    await ensurePreviewSeed(sql, [
      "patient",
      "platform_admin",
      "not_a_real_role",
    ]);
    const { rows } = await sql.query<{ role: string }>(
      "select role from app_roles where user_id = $1 order by role",
      [DEMO_USER_ID],
    );
    expect(rows.map((r) => r.role)).toEqual(["patient", "platform_admin"]);
  }, 120_000);
});

async function counts(sql: Awaited<ReturnType<typeof getSql>>) {
  const tables = [
    "portfolios",
    "documents",
    "medical_events",
    "laboratory_reports",
    "medical_measurements",
    "reminders",
    "appointments",
    "consents",
    "prescription_items",
  ];
  const out: Record<string, number> = {};
  for (const table of tables) {
    const { rows } = await sql.query<{ c: number }>(
      `select count(*)::int as c from ${table}`,
    );
    out[table] = rows[0].c;
  }
  return out;
}
