/**
 * Part 5 API security tests (mocked Supabase):
 * - /api/metrics/summary is staff-only (patients and anonymous → 401/403)
 * - region config writes are coordinator-only; patients and clinicians are refused
 * - no internal error details leak in any response
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  getUser: () => getUserMock(),
}));

type Row = Record<string, unknown>;
type DbResult = { data: Row | Row[] | null; error: { code: string; message: string } | null };

const tables: Record<string, { rows: Row[]; failWith?: { code: string } }> = {};

function makeAdmin() {
  function chainFor(table: string) {
    const state = (tables[table] ??= { rows: [] });
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(async (): Promise<DbResult> => {
        if (state.failWith) return { data: null, error: { code: state.failWith.code, message: "internal pg error SECRET-TABLE" } };
        return { data: state.rows[0] ?? null, error: null };
      }),
      maybeSingle: vi.fn(async (): Promise<DbResult> => {
        if (state.failWith) return { data: null, error: { code: state.failWith.code, message: "internal pg error SECRET-TABLE" } };
        return { data: state.rows[0] ?? null, error: null };
      }),
      then: undefined as unknown,
    };
    (chain as { then: unknown }).then = (resolve: (v: { data: Row[]; error: null }) => void) => {
      resolve({ data: state.rows, error: null });
    };
    return chain;
  }
  return { from: vi.fn((table: string) => chainFor(table)) };
}

let admin: ReturnType<typeof makeAdmin>;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => admin,
}));

let staffIdentity: { userId: string; role: string; facilityId: string } | null = null;
let pharmacyMemberships: Array<{ pharmacyId: string; role: string }> = [];

vi.mock("@/lib/staff/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff/roles")>();
  return {
    ...actual,
    getStaffIdentity: async () => staffIdentity,
  };
});

vi.mock("@/lib/pharmacy/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pharmacy/roles")>();
  return {
    ...actual,
    getPharmacyMemberships: async () => pharmacyMemberships,
  };
});

import { GET as metricsGET } from "@/app/api/metrics/summary/route";
import { upsertRegionConfig } from "@/lib/region/service";
import { getMetricSummary } from "@/lib/metrics/service";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  getUserMock.mockResolvedValue({ id: "user-1" });
  staffIdentity = null;
  pharmacyMemberships = [];
  admin = makeAdmin();
});

describe("metrics summary access control", () => {
  it("rejects anonymous callers", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await metricsGET();
    expect(res.status).toBe(401);
  });

  it("refuses ordinary patient sessions", async () => {
    const res = await metricsGET();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("forbidden"); // safe error, no internals
  });

  it("allows clinician staff", async () => {
    staffIdentity = { userId: "user-1", role: "clinician", facilityId: "f1" };
    const res = await metricsGET();
    expect(res.status).toBe(200);
  });

  it("allows pharmacy staff", async () => {
    pharmacyMemberships = [{ pharmacyId: "p1", role: "manager" }];
    const res = await metricsGET();
    expect(res.status).toBe(200);
  });
});

describe("metrics aggregation truthfulness", () => {
  it("returns zeroed summary with no events (no fabricated numbers)", async () => {
    tables.reliability_metrics = { rows: [] };
    const s = await getMetricSummary();
    expect(s.totalEvents).toBe(0);
    expect(s.byEvent).toEqual({});
    expect(s.syncReliability).toBeNull();
    expect(s.fallbackRate).toBeNull();
    expect(s.medianTimeToClinicianActionMs).toBeNull();
  });

  it("computes sync reliability only from real recorded events", async () => {
    tables.reliability_metrics = {
      rows: [
        { event: "queue_item_created", metadata: {} },
        { event: "queue_item_created", metadata: {} },
        { event: "queue_item_created", metadata: {} },
        { event: "queue_item_synced", metadata: {} },
      ],
    };
    const s = await getMetricSummary();
    expect(s.syncReliability).toEqual({ attempted: 3, acknowledged: 1 });
  });

  it("DB failures return a zeroed summary instead of throwing details", async () => {
    tables.reliability_metrics = { rows: [], failWith: { code: "XX000" } };
    const s = await getMetricSummary();
    expect(s.totalEvents).toBe(0);
  });
});

describe("region config authorization", () => {
  const VALID_CONFIG = {
    region: "north-block",
    languages: ["en" as const, "or" as const],
    serviceAreaText: "North block area",
    emergencyGuidance: { instruction: "Go to the nearest facility", phoneNumber: null },
    appointmentHours: { openHour: 9, closeHour: 17 },
    freshness: { freshHours: 24, staleHours: 72, expiredHours: 168 },
    consultationModes: { text: true, audio: false, video: false },
    helpContact: null,
    features: { videoConsultation: false, voiceNotes: false, pharmacyConfirmation: true, staffPortal: false },
  };

  it("refuses patients", async () => {
    const r = await upsertRegionConfig("user-1", VALID_CONFIG);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("forbidden");
  });

  it("refuses clinicians (coordinator-only)", async () => {
    staffIdentity = { userId: "user-1", role: "clinician", facilityId: "f1" };
    const r = await upsertRegionConfig("user-1", VALID_CONFIG);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("forbidden");
  });

  it("allows coordinators with a valid config", async () => {
    staffIdentity = { userId: "user-1", role: "coordinator", facilityId: "f1" };
    const r = await upsertRegionConfig("user-1", VALID_CONFIG);
    expect(r.ok).toBe(true);
  });

  it("rejects invalid configs even from coordinators", async () => {
    staffIdentity = { userId: "user-1", role: "coordinator", facilityId: "f1" };
    const r = await upsertRegionConfig("user-1", { region: "" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid");
  });
});
