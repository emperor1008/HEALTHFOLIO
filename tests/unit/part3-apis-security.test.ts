/**
 * Part 3 API security tests (route handlers with mocked Supabase).
 * Covers: staff-role admin-key guard, appointment status authorization +
 * lifecycle validation, cross-user access denial for messages/consents,
 * duplicate idempotency, and no internal-error leakage.
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
    // capture inserts for audit assertions
    chain.insert = vi.fn((row: Row) => {
      auditInserts.push({ table, row });
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

const staffIdentity: { current: unknown } = { current: null };
vi.mock("@/lib/staff/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff/roles")>();
  return {
    ...actual,
    getStaffIdentity: async () => staffIdentity.current,
  };
});

import { POST as assignPOST } from "@/app/api/care-requests/[id]/assign/route";
import { POST as statusPOST } from "@/app/api/appointments/[id]/status/route";
import { POST as messagePOST } from "@/app/api/appointments/[id]/messages/route";
import { POST as consentPOST } from "@/app/api/appointments/[id]/share-consent/route";

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const ROUTE_PARAMS = { id: "appt-1" };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  auditInserts = [];
  staffIdentity.current = null;
  admin = makeAdmin();
  process.env.STAFF_ROLE_ADMIN_KEY = "test-admin-key";
});

describe("staff role assignment guard", () => {
  it("rejects without the admin key even for an authenticated user", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const { POST } = await import("@/app/api/staff/roles/route");
    const res = await POST(
      jsonReq("http://localhost/api/staff/roles", {
        user_id: "11111111-1111-4111-8111-111111111111",
        facility_id: "22222222-2222-4222-8222-222222222222",
        role: "clinician",
      })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("STAFF_ACCESS_NOT_CONFIGURED");
  });

  it("rejects a wrong key and never accepts role from a plain client body", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const { POST } = await import("@/app/api/staff/roles/route");
    const res = await POST(
      jsonReq(
        "http://localhost/api/staff/roles",
        { user_id: "11111111-1111-4111-8111-111111111111", facility_id: "22222222-2222-4222-8222-222222222222", role: "clinician" },
        { "x-staff-admin-key": "wrong" }
      )
    );
    expect(res.status).toBe(403);
  });
});

describe("appointment status transitions", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = {
      rows: [
        {
          id: "appt-1",
          care_request_id: "cr-1",
          clinician_id: "prof-1",
          patient_id: "patient-1",
          state: "appointment_proposed",
          mode: "text",
          proposed_starts_at: "2026-09-20T10:00:00Z",
        },
      ],
    };
  });

  it("patient can confirm a proposed appointment", async () => {
    const res = await statusPOST(
      jsonReq("http://localhost/api/appointments/appt-1/status", { state: "appointment_confirmed" }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).state).toBe("appointment_confirmed");
  });

  it("duplicate confirm is an idempotent 200", async () => {
    await statusPOST(
      jsonReq("http://localhost/api/appointments/appt-1/status", { state: "appointment_confirmed" }),
      { params: ROUTE_PARAMS }
    );
    // Simulate already-confirmed state
    tables.care_appointments.rows[0].state = "appointment_confirmed";
    const res = await statusPOST(
      jsonReq("http://localhost/api/appointments/appt-1/status", { state: "appointment_confirmed" }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(200);
  });

  it("invalid lifecycle jump is rejected", async () => {
    const res = await statusPOST(
      jsonReq("http://localhost/api/appointments/appt-1/status", { state: "in_consultation" }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(409);
  });

  it("a stranger cannot transition someone else's appointment", async () => {
    getUserMock.mockResolvedValue({ id: "stranger", email: "" });
    const res = await statusPOST(
      jsonReq("http://localhost/api/appointments/appt-1/status", { state: "cancelled" }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(403);
  });

  it("accepted transition is audit-logged", async () => {
    await statusPOST(
      jsonReq("http://localhost/api/appointments/appt-1/status", { state: "appointment_confirmed" }),
      { params: ROUTE_PARAMS }
    );
    const event = auditInserts.find((a) => a.table === "appointment_status_events");
    expect(event).toBeTruthy();
    expect(event!.row.next_state).toBe("appointment_confirmed");
  });
});

describe("assignment endpoint authorization", () => {
  it("patients cannot assign (no staff identity)", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_requests = {
      rows: [{ id: "cr-1", user_id: "patient-1", status: "submitted", triage_category: "urgent" }],
    };
    const res = await assignPOST(
      jsonReq("http://localhost/api/care-requests/cr-1/assign", {
        clinician_profile_id: "33333333-3333-4333-8333-333333333333",
      }),
      { params: { id: "cr-1" } }
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("STAFF_ACCESS_NOT_CONFIGURED");
  });

  it("emergency requests are never routed to assignment", async () => {
    getUserMock.mockResolvedValue({ id: "staff-1", email: "" });
    staffIdentity.current = { userId: "staff-1", role: "coordinator", facilityId: "f-1" };
    tables.care_requests = {
      rows: [{ id: "cr-2", user_id: "patient-1", status: "submitted", triage_category: "emergency" }],
    };
    const res = await assignPOST(
      jsonReq("http://localhost/api/care-requests/cr-2/assign", {
        clinician_profile_id: "33333333-3333-4333-8333-333333333333",
      }),
      { params: { id: "cr-2" } }
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("EMERGENCY_NOT_ROUTABLE");
  });
});

describe("consultation messages authorization", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = {
      rows: [
        {
          id: "appt-1",
          patient_id: "patient-1",
          clinician_id: "prof-1",
          state: "appointment_confirmed",
        },
      ],
    };
    tables.consultation_messages = { rows: [] };
  });

  it("thread owner can post; delivery is stamped by the server only", async () => {
    tables.consultation_messages.rows = [];
    // The insert path returns via single(); rows[0] acts as the inserted row.
    tables.consultation_messages.rows = [
      { id: "m1", client_created_at: "2026-09-19T10:00:00Z", delivered_at: "2026-09-19T10:00:01Z" },
    ];
    const res = await messagePOST(
      jsonReq("http://localhost/api/appointments/appt-1/messages", {
        body: "Hello care team",
        client_created_at: "2026-09-19T10:00:00Z",
      }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(201);
    expect((await res.json()).message.delivered_at).toBeTruthy();
  });

  it("a stranger cannot post into someone else's thread", async () => {
    getUserMock.mockResolvedValue({ id: "stranger", email: "" });
    const res = await messagePOST(
      jsonReq("http://localhost/api/appointments/appt-1/messages", {
        body: "intruding",
        client_created_at: "2026-09-19T10:00:00Z",
      }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(403);
  });

  it("oversized or empty bodies are rejected", async () => {
    const long = await messagePOST(
      jsonReq("http://localhost/api/appointments/appt-1/messages", {
        body: "x".repeat(2001),
        client_created_at: "2026-09-19T10:00:00Z",
      }),
      { params: ROUTE_PARAMS }
    );
    expect(long.status).toBe(400);
    const empty = await messagePOST(
      jsonReq("http://localhost/api/appointments/appt-1/messages", {
        body: "   ",
        client_created_at: "2026-09-19T10:00:00Z",
      }),
      { params: ROUTE_PARAMS }
    );
    expect(empty.status).toBe(400);
  });

  it("server errors stay generic", async () => {
    tables.consultation_messages.failWith = { code: "42P01" };
    const res = await messagePOST(
      jsonReq("http://localhost/api/appointments/appt-1/messages", {
        body: "hello",
        client_created_at: "2026-09-19T10:00:00Z",
      }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ code: "SEND_FAILED" });
    expect(JSON.stringify(json)).not.toMatch(/pg_|XYZ/i);
  });
});

describe("share consent", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = {
      rows: [
        { id: "appt-1", care_request_id: "cr-1", patient_id: "patient-1", clinician_id: "prof-1", state: "accepted" },
      ],
    };
  });

  it("grants consent only for owned documents", async () => {
    tables.documents = { rows: [{ id: "doc-1" }] };
    const res = await consentPOST(
      jsonReq("http://localhost/api/appointments/appt-1/share-consent", {
        document_ids: ["44444444-4444-4444-8444-444444444444", "55555555-5555-5555-8555-555555555555"],
      }),
      { params: ROUTE_PARAMS }
    );
    // Only one of the two requested documents exists → ownership rejection.
    expect(res.status).toBe(403);
  });

  it("a stranger cannot grant consent on someone else's appointment", async () => {
    getUserMock.mockResolvedValue({ id: "stranger", email: "" });
    const res = await consentPOST(
      jsonReq("http://localhost/api/appointments/appt-1/share-consent", {
        document_ids: ["44444444-4444-4444-8444-444444444444"],
      }),
      { params: ROUTE_PARAMS }
    );
    expect(res.status).toBe(404);
  });
});
