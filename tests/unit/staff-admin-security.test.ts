/**
 * Staff identity & platform-role regression tests (release hardening).
 *
 * Proves the migration-026 contract:
 * - staff capability requires an ACTIVE user_roles registry row;
 * - suspended/revoked staff lose access immediately (per-request resolution);
 * - a facility membership alone no longer grants staff access (migration
 *   path: roles must be provisioned via staff:bootstrap / admin console);
 * - platform admin resolution ignores non-active rows;
 * - the browser has no role-writing path: the old admin-key route is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const tables: Record<string, { rows: Row[] }> = {};

function makeAdmin() {
  function chainFor(table: string) {
    const state = (tables[table] ??= { rows: [] });
    const filters: Array<[string, unknown]> = [];
    const applyFilters = (rows: Row[]) =>
      rows.filter((r) => filters.every(([col, val]) => r[col] === val));
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: unknown) => {
        filters.push([col, val]);
        return chain;
      }),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: applyFilters(state.rows)[0] ?? null, error: null })),
      maybeSingle: vi.fn(async () => ({ data: applyFilters(state.rows)[0] ?? null, error: null })),
      then: undefined as unknown,
    };
    (chain as { then: unknown }).then = (resolve: (v: { data: Row[]; error: null }) => void) => {
      resolve({ data: applyFilters(state.rows), error: null });
    };
    return chain;
  }
  return { from: vi.fn((table: string) => chainFor(table)) };
}

let admin: ReturnType<typeof makeAdmin>;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => admin,
}));

import {
  getStaffIdentity,
  isPlatformAdmin,
  getActivePlatformRole,
  getUserRoleStatus,
} from "@/lib/staff/roles";

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  admin = makeAdmin();
});

describe("getStaffIdentity requires an active registry row", () => {
  it("returns the identity for an active clinician", async () => {
    tables.facility_memberships = {
      rows: [{ user_id: "u1", role: "clinician", facility_id: "f1" }],
    };
    tables.user_roles = { rows: [{ user_id: "u1", role: "clinician", status: "active" }] };
    const id = await getStaffIdentity("u1");
    expect(id).toEqual({ userId: "u1", role: "clinician", facilityId: "f1" });
  });

  it("returns null for a suspended clinician (immediate effect)", async () => {
    tables.facility_memberships = {
      rows: [{ user_id: "u1", role: "clinician", facility_id: "f1" }],
    };
    tables.user_roles = { rows: [{ user_id: "u1", role: "clinician", status: "suspended" }] };
    expect(await getStaffIdentity("u1")).toBeNull();
  });

  it("returns null for a revoked coordinator (immediate effect)", async () => {
    tables.facility_memberships = {
      rows: [{ user_id: "u2", role: "coordinator", facility_id: "f1" }],
    };
    tables.user_roles = { rows: [{ user_id: "u2", role: "facility_coordinator", status: "revoked" }] };
    expect(await getStaffIdentity("u2")).toBeNull();
  });

  it("a membership row alone no longer grants staff access", async () => {
    tables.facility_memberships = {
      rows: [{ user_id: "u3", role: "clinician", facility_id: "f1" }],
    };
    tables.user_roles = { rows: [] };
    expect(await getStaffIdentity("u3")).toBeNull();
  });

  it("a registry row for the WRONG role does not unlock the membership", async () => {
    tables.facility_memberships = {
      rows: [{ user_id: "u4", role: "clinician", facility_id: "f1" }],
    };
    tables.user_roles = { rows: [{ user_id: "u4", role: "pharmacy_operator", status: "active" }] };
    expect(await getStaffIdentity("u4")).toBeNull();
  });
});

describe("platform admin resolution", () => {
  it("is true only for an active platform_admin row", async () => {
    tables.user_roles = { rows: [{ user_id: "a1", role: "platform_admin", status: "active" }] };
    expect(await isPlatformAdmin("a1")).toBe(true);
  });

  it("is false for suspended or revoked admins", async () => {
    tables.user_roles = { rows: [{ user_id: "a1", role: "platform_admin", status: "suspended" }] };
    expect(await isPlatformAdmin("a1")).toBe(false);
    tables.user_roles = { rows: [{ user_id: "a2", role: "platform_admin", status: "revoked" }] };
    expect(await isPlatformAdmin("a2")).toBe(false);
  });

  it("is false when the user has no roles at all (plain patient)", async () => {
    tables.user_roles = { rows: [] };
    expect(await isPlatformAdmin("p1")).toBe(false);
    expect(await getActivePlatformRole("p1")).toBeNull();
  });

  it("reports registry status truthfully for a specific role", async () => {
    tables.user_roles = { rows: [{ user_id: "a1", role: "platform_admin", status: "suspended" }] };
    expect(await getUserRoleStatus("a1", "platform_admin")).toBe("suspended");
  });
});

describe("no browser role-writing path", () => {
  it("the legacy admin-key route no longer exists on disk", async () => {
    // The route module must not resolve — the x-staff-admin-key path was
    // removed in favour of session-based platform-admin authorization.
    // The variable specifier keeps Vite from failing at transform time.
    const legacy = "@/app/api/staff/roles/route";
    await expect(import(/* @vite-ignore */ legacy)).rejects.toThrow();
  });
});
