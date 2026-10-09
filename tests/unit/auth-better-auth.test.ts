/**
 * Auth role/authentication regression tests (Firebase migration P1).
 *
 * Covers the auth migration's security contract without a live database:
 * - redirect allowlisting (no open redirects, no off-origin steering);
 * - registration/doctor-application Zod validation (role can never be chosen
 *   by the client; public admin actions reject platform_admin);
 * - page-guard area policy (patient cannot reach doctor/admin areas;
 *   doctor_pending cannot reach doctor records; cross-area denial);
 * - API guard helpers (401/403 semantics, role filtering);
 * - in-memory rate limiting (bounded, window reset);
 * - offline queue ownership (items never sync under the wrong account,
 *   pre-auth markers are never claimed by a different user);
 * - lazy Firebase configuration gate (no import-time crash; the session
 *   route answers 503 when FIREBASE_SERVICE_ACCOUNT_KEY is absent);
 * - migration 027 compatibility (Better Auth canonical columns, no
 *   destructive statements, role policy wiring present — P1-TEMP identity
 *   bridge until P5).
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";

import { sanitizeRedirect } from "@/lib/auth/redirect";
import {
  RegisterSchema,
  DoctorApplicationSchema,
  AdminRoleActionSchema,
} from "@/lib/auth/schemas";

/* ─────────────────────────── redirect safety ─────────────────────────── */

describe("redirect allowlisting", () => {
  it("accepts same-origin relative paths", () => {
    expect(sanitizeRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect("/records")).toBe("/records");
  });

  it("rejects absolute URLs, protocol-relative, and backslash tricks", () => {
    expect(sanitizeRedirect("https://evil.example")).toBeNull();
    expect(sanitizeRedirect("//evil.example")).toBeNull();
    expect(sanitizeRedirect("/\\evil.example")).toBeNull();
    expect(sanitizeRedirect("javascript:alert(1)")).toBeNull();
    expect(sanitizeRedirect(null)).toBeNull();
    expect(sanitizeRedirect("")).toBeNull();
  });

  it("never redirects into API routes or the platform-admin area", () => {
    expect(sanitizeRedirect("/api/portfolios")).toBeNull();
    expect(sanitizeRedirect("/admin/platform")).toBeNull();
    expect(sanitizeRedirect("/admin/platform/anything")).toBeNull();
  });
});

/* ─────────────────────── registration validation ─────────────────────── */

describe("registration & doctor application schemas", () => {
  it("requires consent for patient registration", () => {
    const base = {
      name: "Test Patient",
      dob: "1990-06-01",
      email: "patient.test@example.test",
      password: "longenoughpass1",
      consent: false,
    };
    expect(RegisterSchema.safeParse(base).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...base, consent: true }).success).toBe(true);
  });

  it("computed-age gate rejects impossible ages", () => {
    const base = {
      name: "Test Patient",
      email: "patient.test@example.test",
      password: "longenoughpass1",
      consent: true,
    };
    // 10 years old → below the 13+ gate
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    expect(RegisterSchema.safeParse({ ...base, dob: d.toISOString().slice(0, 10) }).success).toBe(false);
  });

  it("rejects short passwords", () => {
    const result = RegisterSchema.safeParse({
      name: "Test Patient",
      dob: "1990-06-01",
      email: "patient.test@example.test",
      password: "short",
      consent: true,
    });
    expect(result.success).toBe(false);
  });

  it("doctor application requires licence, specialty, region, attestation", () => {
    const base = {
      name: "Dr Test",
      email: "dr.test@example.test",
      licenceNumber: "REG-123456",
      specialty: "General Medicine",
      facilityName: "Community Health Centre",
      region: "Test Region",
      attestation: true,
    };
    expect(DoctorApplicationSchema.safeParse(base).success).toBe(true);
    expect(DoctorApplicationSchema.safeParse({ ...base, attestation: false }).success).toBe(false);
    expect(DoctorApplicationSchema.safeParse({ ...base, licenceNumber: "ab" }).success).toBe(false);
  });

  it("admin actions can never assign or target platform_admin from the client", () => {
    expect(
      AdminRoleActionSchema.safeParse({
        action: "assign",
        email: "x@example.test",
        role: "platform_admin",
      }).success
    ).toBe(false);
    // doctor / facility_admin assignments are the only client-reachable ones
    expect(
      AdminRoleActionSchema.safeParse({
        action: "assign",
        email: "x@example.test",
        role: "doctor",
      }).success
    ).toBe(true);
  });
});

/* ─────────────────────────── page guards ─────────────────────────────── */

const SESSION_STATE = vi.hoisted(() => ({
  user: null as null | { id: string },
  roles: [] as string[],
}));

vi.mock("@/lib/auth-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-session")>();
  return {
    ...actual,
    getSessionUser: vi.fn(async () => SESSION_STATE.user),
    getActiveRoles: vi.fn(async () => SESSION_STATE.roles as never),
  };
});

import { requireArea } from "@/lib/auth/page-guard";
import { hasRole } from "@/lib/auth-session";

describe("role area guards", () => {
  beforeEach(() => {
    SESSION_STATE.user = null;
    SESSION_STATE.roles = [];
  });

  it("unsigned users are redirected to sign-in, never shown content", async () => {
    const result = await requireArea("patient");
    expect(result).toEqual({ kind: "redirect", to: "/sign-in" });
  });

  it("patient cannot access doctor or admin areas", async () => {
    SESSION_STATE.user = { id: "11111111-1111-4111-8111-111111111111" };
    SESSION_STATE.roles = ["patient"];
    expect((await requireArea("doctor")).kind).toBe("denied");
    expect((await requireArea("facility_admin")).kind).toBe("denied");
    expect((await requireArea("platform_admin")).kind).toBe("denied");
    expect((await requireArea("patient")).kind).toBe("ok");
  });

  it("doctor_pending cannot reach doctor records — honest pending state only", async () => {
    SESSION_STATE.user = { id: "22222222-2222-4222-8222-222222222222" };
    SESSION_STATE.roles = ["doctor_pending"];
    expect((await requireArea("doctor")).kind).toBe("denied");
    expect((await requireArea("doctor_pending_or_doctor")).kind).toBe("ok");
  });

  it("doctor reaches the doctor area but not admin areas", async () => {
    SESSION_STATE.user = { id: "33333333-3333-4333-8333-333333333333" };
    SESSION_STATE.roles = ["doctor"];
    expect((await requireArea("doctor")).kind).toBe("ok");
    expect((await requireArea("facility_admin")).kind).toBe("denied");
    expect((await requireArea("platform_admin")).kind).toBe("denied");
  });

  it("facility_admin cannot manage the platform area", async () => {
    SESSION_STATE.user = { id: "44444444-4444-4444-8444-444444444444" };
    SESSION_STATE.roles = ["facility_admin"];
    expect((await requireArea("facility_admin")).kind).toBe("ok");
    expect((await requireArea("platform_admin")).kind).toBe("denied");
    expect((await requireArea("facility_or_platform_admin")).kind).toBe("ok");
  });

  it("suspended/revoked roles disappear from the registry read → denial", async () => {
    SESSION_STATE.user = { id: "55555555-5555-4555-8555-555555555555" };
    SESSION_STATE.roles = []; // getActiveRoles only returns active rows
    expect((await requireArea("doctor")).kind).toBe("denied");
  });
});

describe("hasRole", () => {
  it("grants only listed active roles", () => {
    expect(hasRole(["doctor"], "doctor")).toBe(true);
    expect(hasRole(["doctor"], "doctor", "facility_admin")).toBe(true);
    expect(hasRole(["patient"], "doctor")).toBe(false);
    expect(hasRole([], "patient")).toBe(false);
  });
});

/* ────────────────────────── API guards ───────────────────────────────── */

describe("API guard helpers", () => {
  it("401 and 403 carry generic codes only — no internals", async () => {
    const { unauthorized, forbidden } = await import("@/lib/api/auth-guard");
    const u = await unauthorized();
    const f = await forbidden();
    expect(u.status).toBe(401);
    expect(f.status).toBe(403);
    const body = await f.json();
    expect(body.code).toBe("FORBIDDEN");
    expect(JSON.stringify(body)).not.toMatch(/supabase|database|stack/i);
  });

  it("requireSession returns null when signed out (caller sends 401)", async () => {
    SESSION_STATE.user = null;
    const { requireSession } = await import("@/lib/api/auth-guard");
    expect(await requireSession()).toBeNull();
  });

  it("requireSession exposes roles resolved from the registry", async () => {
    SESSION_STATE.user = { id: "66666666-6666-4666-8666-666666666666" };
    SESSION_STATE.roles = ["patient"];
    const { requireSession } = await import("@/lib/api/auth-guard");
    const s = await requireSession();
    expect(s).toMatchObject({ roles: ["patient"] });
  });
});

/* ───────────────────────── rate limiting ─────────────────────────────── */

describe("credential rate limiting", () => {
  beforeEach(async () => {
    const { resetRateLimiter } = await import("@/lib/api/rate-limit");
    resetRateLimiter();
  });

  it("blocks after the configured attempts and reports retry delay", async () => {
    const { hit } = await import("@/lib/api/rate-limit");
    const key = "sign-in:test-user";
    for (let i = 0; i < 5; i++) {
      expect(hit(key, 5, 60).allowed).toBe(true);
    }
    const blocked = hit(key, 5, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("limits are per-key (another identity is unaffected)", async () => {
    const { hit } = await import("@/lib/api/rate-limit");
    for (let i = 0; i < 5; i++) hit("sign-in:a@example.test", 5, 60);
    expect(hit("sign-in:a@example.test", 5, 60).allowed).toBe(false);
    expect(hit("sign-in:b@example.test", 5, 60).allowed).toBe(true);
  });

  it("signed-URL endpoint applies its own limit per user", async () => {
    const { hit } = await import("@/lib/api/rate-limit");
    for (let i = 0; i < 60; i++) hit("signed-url:user-1", 60, 60);
    expect(hit("signed-url:user-1", 60, 60).allowed).toBe(false);
    expect(hit("signed-url:user-2", 60, 60).allowed).toBe(true);
  });
});

/* ─────────────────── offline queue ownership ─────────────────────────── */

describe("offline queue ownership (session-scoped items)", () => {
  it("items sync only under the owning account", async () => {
    const { canSyncItem } = await import("@/lib/offline/ownership");
    const owned = { ownerId: "user-A", id: "q1" } as never;
    expect(canSyncItem(owned, "user-A")).toBe(true);
    // The classic failure: next user on a shared device must never inherit.
    expect(canSyncItem(owned, "user-B")).toBe(false);
  });

  it("pre-auth items stay local until explicitly claimed", async () => {
    const { canSyncItem } = await import("@/lib/offline/ownership");
    const item = { ownerId: "pre-auth:abc", id: "q2" } as never;
    expect(canSyncItem(item, "user-A")).toBe(false);
    expect(canSyncItem({ ownerId: null, id: "q3" } as never, "user-A")).toBe(false);
    expect(canSyncItem({ ownerId: null, id: "q4" } as never, null)).toBe(false);
  });

  it("bindItemsToOwner stamps unclaimed items with the session owner", async () => {
    const { bindItemsToOwner } = await import("@/lib/offline/ownership");
    const items = [
      { id: "q1", ownerId: "user-A" },
      { id: "q2", ownerId: null },
    ] as never[];
    const stamped = bindItemsToOwner(items, "user-A");
    expect(stamped[0].ownerId).toBe("user-A");
    expect(stamped[1].ownerId).toBe("user-A");
  });

  it("pre-auth markers never resemble a real user id", async () => {
    const { preAuthMarker } = await import("@/lib/offline/ownership");
    const marker = preAuthMarker();
    expect(marker.startsWith("pre-auth:")).toBe(true);
    expect(/^[0-9a-f-]{36}$/.test(marker)).toBe(false);
  });
});

/* ─────────────────── Firebase configuration & route gate ────────────── */

describe("Firebase configuration gate", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  });

  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("importing the admin module never throws — even with no environment", async () => {
    await expect(import("@/lib/firebase/admin")).resolves.toBeTruthy();
  });

  it("isFirebaseAdminConfigured() reflects the environment", async () => {
    const mod = await import("@/lib/firebase/admin");
    expect(mod.isFirebaseAdminConfigured()).toBe(false);
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id":"placeholder-invalid"}';
    expect(mod.isFirebaseAdminConfigured()).toBe(true);
  });

  it("session exchange answers 503 when unconfigured — no internals", async () => {
    const { POST } = await import("@/app/api/auth/session/route");
    const res = await POST(
      new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "x".repeat(32) }),
      })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("SERVER_NOT_CONFIGURED");
    expect(JSON.stringify(body)).not.toMatch(/private_key|BEGIN PRIVATE|postgres/i);
  });

  it("admin init error names the missing variable, never any value", async () => {
    const mod = await import("@/lib/firebase/admin");
    expect(() => mod.getAdminAuth()).toThrow(/FIREBASE_SERVICE_ACCOUNT_KEY/);
    await expect(Promise.resolve().then(() => mod.getAdminAuth())).rejects.not.toThrow(
      /postgres(ql)?:\/\/[^\s"]+/i
    );
  });
});

/* ─────────────────────── migration 027 compatibility ─────────────────── */

describe("migration 027 (Better Auth identity) contract", () => {
  let sql = "";
  beforeAll(async () => {
    const fs = await import("fs");
    sql = await fs.promises.readFile("supabase/migrations/027_better_auth_identity.sql", "utf8");
  });

  it("creates Better Auth canonical tables with camelCase columns", () => {
    for (const table of ["user", "session", "account", "verification"]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE[^(]*\\b${table}\\b`, "i"));
    }
    // Better Auth 1.7.x queries camelCase — matching columns are essential.
    for (const col of ["accountId", "providerId", "userId", "expiresAt", "ipAddress", "userAgent"]) {
      expect(sql).toContain(col);
    }
  });

  it("user ids are UUID — identical format to medical-table user_id FKs", () => {
    expect(sql).toMatch(/CREATE TABLE[^(]*\buser\b[^;]*\bid UUID/i);
  });

  it("adds the role registry with the full role policy", () => {
    for (const role of ["patient", "doctor_pending", "doctor", "facility_admin", "platform_admin"]) {
      expect(sql).toContain(`'${role}'`);
    }
    expect(sql).toMatch(/CREATE TABLE[^(]*\bapp_roles\b/i);
    expect(sql).toMatch(/CREATE TABLE[^(]*\bdoctor_applications\b/i);
  });

  it("is forward-only: no drops of legacy data, no auth.users destruction", () => {
    // Statements only — "--" comment lines may legitimately mention these words.
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/DROP TABLE\s+(auth\.|documents|care_requests|portfolios|medical_events)/i);
    expect(statements).not.toMatch(/TRUNCATE|DELETE FROM auth\./i);
    expect(statements).not.toMatch(/ALTER TABLE\s+auth\.users/i);
  });

  it("role registry is locked down (no client-writable policy)", () => {
    const appRolesBlock = sql.slice(sql.indexOf("app_roles"));
    expect(appRolesBlock).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(appRolesBlock).not.toMatch(/TO authenticated[^\n]*USING/i);
  });
});

/* ───────────────────────────── route proxy ───────────────────────────── */

describe("route proxy (Next 16) auth gating", () => {
  let src = "";
  beforeAll(async () => {
    const fs = await import("fs");
    src = await fs.promises.readFile("src/proxy.ts", "utf8");
  });

  it("gates pages on the Firebase session cookie", () => {
    expect(src).toContain("SESSION_COOKIE");
    expect(src).toContain("/sign-in");
  });

  it("never redirects API routes — they answer JSON for themselves", () => {
    // Regression: proxying /api/* to an HTML sign-in page broke the offline
    // sync engine and the session-exchange endpoint (307 instead of
    // 401/503 JSON). API routes enforce sessions server-side.
    expect(src).toMatch(/pathname\.startsWith\(["']\/api\/["']\)/);
  });

  it("keeps the platform-admin area out of post-auth redirect targets", async () => {
    const { sanitizeRedirect } = await import("@/lib/auth/redirect");
    expect(sanitizeRedirect("/admin/platform")).toBeNull();
  });
});
