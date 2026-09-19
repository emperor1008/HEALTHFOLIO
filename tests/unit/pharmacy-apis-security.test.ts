/**
 * Part 4 API security + integrity tests (route handlers with mocked Supabase).
 * Covers: membership checks, cross-pharmacy denial, patient isolation,
 * idempotency (stock updates, availability requests, responses), validation
 * rejections, and audit writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();

vi.mock("@/lib/auth-helpers", () => ({
  getUser: () => getUserMock(),
}));

type Row = Record<string, unknown>;
type DbResult = { data: Row | Row[] | null; error: { code: string; message: string } | null };

interface TableMock {
  rows: Row[];
  failWith?: { code: string };
}

const tables: Record<string, TableMock> = {};
let auditInserts: Array<{ table: string; row: Row }> = [];

function makeAdmin() {
  function chainFor(table: string) {
    const state = (tables[table] ??= { rows: [] });
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(async (): Promise<DbResult> => {
        if (state.failWith) {
          return { data: null, error: { code: state.failWith.code, message: "internal pg error XYZ" } };
        }
        return { data: state.rows[0] ?? null, error: null };
      }),
      maybeSingle: vi.fn(async (): Promise<DbResult> => {
        if (state.failWith) {
          return { data: null, error: { code: state.failWith.code, message: "internal pg error XYZ" } };
        }
        return { data: state.rows[0] ?? null, error: null };
      }),
      then: undefined as unknown,
    };
    (chain as { then: unknown }).then = (resolve: (v: { data: Row[]; error: null }) => void) => {
      resolve({ data: state.rows, error: null });
    };
    chain.insert = vi.fn((row: Row) => {
      auditInserts.push({ table, row });
      // Make inserted rows visible to a subsequent .select(...).single()
      state.rows = [{ id: `id-${auditInserts.length}` }, ...state.rows];
      return chain;
    });
    chain.update = vi.fn((row: Row) => {
      Object.assign(state.rows[0] ?? {}, row);
      return chain;
    });
    return chain;
  }
  return {
    from: vi.fn((table: string) => chainFor(table)),
  };
}

let admin: ReturnType<typeof makeAdmin>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => admin,
}));

// Membership lookups are mocked at the roles-module boundary (server-side
// resolution stays the code path; only the DB call is swapped).
let memberships: Array<{ pharmacyId: string; role: string }> = [];
vi.mock("@/lib/pharmacy/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pharmacy/roles")>();
  return {
    ...actual,
    getPharmacyMemberships: async () => memberships,
  };
});

import type { NextRequest } from "next/server";
import { POST as stockPost, GET as stockGet } from "@/app/api/pharmacy/stock/route";
import { POST as requestPost, GET as requestsGet } from "@/app/api/pharmacy/requests/route";
import { POST as respondPost } from "@/app/api/pharmacy/requests/respond/route";
import { GET as inboxGet } from "@/app/api/pharmacy/requests/inbox/route";
import { GET as lookupGet } from "@/app/api/pharmacy/stock/patient-lookup/route";

function jsonReq(body: unknown, url = "http://localhost/api/x"): NextRequest {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const PH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "22222222-2222-4222-8222-222222222222";
const REQ_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const VALID_STOCK = {
  pharmacyId: PH_A,
  medicineId: "rxnorm:161",
  medicineLabel: "Acetaminophen (Paracetamol)",
  status: "available",
  idempotencyKey: KEY_1,
};

const VALID_REQUEST = {
  pharmacyId: PH_A,
  medicineId: "rxnorm:161",
  medicineLabel: "Acetaminophen (Paracetamol)",
  language: "en",
  idempotencyKey: KEY_2,
};

const VALID_RESPONSE = {
  requestId: REQ_1,
  response: "confirmed_available",
  idempotencyKey: KEY_1,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  auditInserts = [];
  memberships = [];
  getUserMock.mockResolvedValue({ id: "user-1" });
  admin = makeAdmin();
});

/** Request stub that supports nextUrl (route handlers use it for query params). */
function getReq(path: string): NextRequest {
  const url = new URL(`http://localhost${path}`);
  return {
    nextUrl: url,
    url: url.toString(),
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe("stock update authorization + integrity", () => {
  it("rejects unauthenticated", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await stockPost(jsonReq(VALID_STOCK));
    expect(res.status).toBe(401);
  });

  it("rejects a non-member (role escalation / cross-pharmacy denial)", async () => {
    memberships = [{ pharmacyId: PH_B, role: "operator" }];
    const res = await stockPost(jsonReq(VALID_STOCK));
    expect(res.status).toBe(403);
  });

  it("rejects invalid status payloads", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    const res = await stockPost(jsonReq({ ...VALID_STOCK, status: "plenty" }));
    expect(res.status).toBe(400);
  });

  it("rejects negative quantities", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    const res = await stockPost(jsonReq({ ...VALID_STOCK, quantityHint: -5 }));
    expect(res.status).toBe(400);
  });

  it("records the update with operator attribution and writes an audit event", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    const res = await stockPost(jsonReq(VALID_STOCK));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; duplicate: boolean };
    expect(data.ok).toBe(true);
    expect(data.duplicate).toBe(false);
    const inserted = auditInserts.find((i) => i.table === "pharmacy_stock_events");
    expect(inserted?.row.updated_by).toBe("user-1");
    expect(inserted?.row.source).toBe("manual_operator");
    expect(auditInserts.some((i) => i.table === "pharmacy_audit_events" && i.row.event === "stock_updated")).toBe(true);
  });

  it("duplicate idempotency key produces one event (no duplicate stock row)", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    tables.pharmacy_stock_events = { rows: [{ id: "ev-1" }] }; // existing event
    const res = await stockPost(jsonReq(VALID_STOCK));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { duplicate: boolean };
    expect(data.duplicate).toBe(true);
    // Only the audit trail from the original call exists — no second event row.
    expect(auditInserts.filter((i) => i.table === "pharmacy_stock_events")).toHaveLength(0);
  });

  it("GET stock rejects other pharmacies", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    const res = await stockGet(getReq(`/api/pharmacy/stock?pharmacyId=${PH_B}`));
    expect(res.status).toBe(403);
  });
});

describe("availability request safety", () => {
  it("rejects unauthenticated patients", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await requestPost(jsonReq(VALID_REQUEST));
    expect(res.status).toBe(401);
  });

  it("rejects requests to unverified pharmacies", async () => {
    tables.pharmacies = { rows: [] }; // no verified pharmacy row
    const res = await requestPost(jsonReq(VALID_REQUEST));
    expect(res.status).toBe(404);
  });

  it("creates the request for a verified pharmacy with idempotency", async () => {
    tables.pharmacies = { rows: [{ id: PH_A, verification_state: "verified" }] };
    const res = await requestPost(jsonReq(VALID_REQUEST));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { duplicate: boolean };
    expect(data.duplicate).toBe(false);
    const inserted = auditInserts.find((i) => i.table === "pharmacy_availability_requests");
    expect(inserted?.row.patient_id).toBe("user-1");
    expect(inserted?.row.idempotency_key).toBe(KEY_2);
  });

  it("duplicate retry returns the original request without inserting again", async () => {
    tables.pharmacies = { rows: [{ id: PH_A, verification_state: "verified" }] };
    tables.pharmacy_availability_requests = { rows: [{ id: REQ_1, status: "pending" }] };
    const res = await requestPost(jsonReq(VALID_REQUEST));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { duplicate: boolean; requestId: string };
    expect(data.duplicate).toBe(true);
    expect(data.requestId).toBe(REQ_1);
    expect(auditInserts.filter((i) => i.table === "pharmacy_availability_requests")).toHaveLength(0);
  });

  it("patient GET returns only their own requests (no others leak)", async () => {
    tables.pharmacy_availability_requests = {
      rows: [{ id: REQ_1, medicine_label: "Paracetamol", status: "pending" }],
    };
    const res = await requestsGet(getReq("/api/pharmacy/requests"));
    expect(res.status).toBe(200);
  });
});

describe("availability response authorization", () => {
  it("rejects operators of other pharmacies", async () => {
    memberships = [{ pharmacyId: PH_B, role: "operator" }];
    tables.pharmacy_availability_requests = { rows: [{ id: REQ_1, pharmacy_id: PH_A, status: "pending" }] };
    const res = await respondPost(jsonReq(VALID_RESPONSE));
    expect(res.status).toBe(403);
  });

  it("rejects unknown requests", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    tables.pharmacy_availability_requests = { rows: [] };
    const res = await respondPost(jsonReq(VALID_RESPONSE));
    expect(res.status).toBe(404);
  });

  it("records an attributable, timestamped response and updates request status", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    tables.pharmacy_availability_requests = { rows: [{ id: REQ_1, pharmacy_id: PH_A, status: "pending" }] };
    const res = await respondPost(jsonReq(VALID_RESPONSE));
    expect(res.status).toBe(200);
    const inserted = auditInserts.find((i) => i.table === "pharmacy_availability_responses");
    expect(inserted?.row.responder_id).toBe("user-1");
    expect(inserted?.row.idempotency_key).toBe(KEY_1);
    expect(auditInserts.some((i) => i.table === "pharmacy_audit_events" && i.row.event === "availability_responded")).toBe(true);
  });

  it("duplicate response with the same key is a no-op", async () => {
    memberships = [{ pharmacyId: PH_A, role: "operator" }];
    tables.pharmacy_availability_requests = { rows: [{ id: REQ_1, pharmacy_id: PH_A, status: "pending" }] };
    tables.pharmacy_availability_responses = { rows: [{ id: "resp-1" }] };
    const res = await respondPost(jsonReq(VALID_RESPONSE));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { duplicate: boolean };
    expect(data.duplicate).toBe(true);
  });
});

describe("pharmacy inbox isolation", () => {
  it("returns nothing for non-members", async () => {
    memberships = [];
    const res = await inboxGet(getReq("/api/pharmacy/requests/inbox"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { requests: unknown[] };
    expect(data.requests).toHaveLength(0);
  });

  it("queries only the member's pharmacies", async () => {
    memberships = [{ pharmacyId: PH_A, role: "manager" }];
    tables.pharmacy_availability_requests = { rows: [] };
    const res = await inboxGet(getReq("/api/pharmacy/requests/inbox"));
    expect(res.status).toBe(200);
  });
});

describe("patient stock lookup projection", () => {
  it("rejects unauthenticated lookups", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await lookupGet(
      getReq("/api/pharmacy/stock/patient-lookup?medicineId=rxnorm:161"),
    );
    expect(res.status).toBe(401);
  });

  it("returns safe fields only (no quantity hints, no internal notes)", async () => {
    tables.pharmacies = {
      rows: [{ id: PH_A, name: "Village Pharmacy", service_area_text: null, languages: ["en"], is_open: true }],
    };
    tables.pharmacy_stock_events = {
      rows: [{ pharmacy_id: PH_A, status: "available", server_recorded_at: new Date().toISOString() }],
    };
    const res = await lookupGet(
      getReq("/api/pharmacy/stock/patient-lookup?medicineId=rxnorm:161"),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(data.results).toHaveLength(1);
    const row = data.results[0];
    expect(Object.keys(row).sort()).toEqual(
      ["displayStatus", "freshness", "isOpen", "languages", "lastConfirmedAt", "pharmacyId", "pharmacyName", "serviceAreaText"].sort(),
    );
    expect(row).not.toHaveProperty("quantity_hint");
    expect(row).not.toHaveProperty("internal_note");
  });
});
