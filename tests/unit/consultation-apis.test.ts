/**
 * Consultation API security tests (route handlers with mocked Supabase).
 *
 * Covers the Phase 1 authorization seam:
 * - 401 without a Better Auth session on every route;
 * - GET /api/consultations/[id]: patient owner OR assigned clinician only
 *   (403 for outsiders), 404 for missing appointments, room capability
 *   issued ONLY in a joinable state, reason snippet bounded;
 * - GET /api/consultations: rows strictly scoped to me, room capability
 *   never disclosed by the list endpoint;
 * - POST signal: Zod-validated event vocabulary (400 on unknown), 404/403/
 *   409 gating, audit row + privacy-safe metric only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({ getUser: () => getUserMock() }));

const recordMetricMock = vi.fn();
vi.mock("@/lib/metrics/service", () => ({ recordMetric: (input: unknown) => recordMetricMock(input) }));

type Row = Record<string, unknown>;
type DbResult = { data: Row | Row[] | null; error: { code: string; message: string } | null };

interface TableMock {
  rows: Row[];
  failWith?: { code: string };
}

const tables: Record<string, TableMock> = {};
let auditInserts: Array<{ table: string; row: Row }> = [];
let updates: Array<{ table: string; row: Row }> = [];

function makeAdmin() {
  function chainFor(table: string) {
    const state = (tables[table] ??= { rows: [] });
    const filters: Array<[string, unknown]> = [];
    const applyFilters = (rows: Row[]) =>
      rows.filter((r) => filters.every(([col, val]) => r[col] === val));
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn((row: Row) => {
        auditInserts.push({ table, row });
        return chain;
      }),
      update: vi.fn((row: Row) => {
        updates.push({ table, row });
        return chain;
      }),
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
      single: vi.fn(async (): Promise<DbResult> => {
        if (state.failWith) {
          return { data: null, error: { code: state.failWith.code, message: "internal pg error XYZ" } };
        }
        return { data: applyFilters(state.rows)[0] ?? null, error: null };
      }),
      maybeSingle: vi.fn(async (): Promise<DbResult> => {
        if (state.failWith) {
          return { data: null, error: { code: state.failWith.code, message: "internal pg error XYZ" } };
        }
        return { data: applyFilters(state.rows)[0] ?? null, error: null };
      }),
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
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

import { GET as getSessionGET } from "@/app/api/consultations/[id]/route";
import { GET as listGET } from "@/app/api/consultations/route";
import { POST as signalPOST } from "@/app/api/consultations/[id]/signal/route";

const ROUTE_PARAMS = Promise.resolve({ id: "appt-1" });

function appointment(overrides: Row = {}): Row {
  return {
    id: "appt-1",
    patient_id: "patient-1",
    clinician_id: "clin-1",
    state: "appointment_confirmed",
    mode: "text",
    room_id: null,
    care_request_id: null,
    proposed_starts_at: null,
    confirmed_starts_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  auditInserts = [];
  updates = [];
  admin = makeAdmin();
});

// ── GET /api/consultations/[id] ───────────────────────────────────────────

describe("GET consultation session detail", () => {
  it("401 without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await getSessionGET(new Request("http://localhost/api/consultations/appt-1"), {
      params: ROUTE_PARAMS,
    });
    expect(res.status).toBe(401);
  });

  it("404 for a missing appointment", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = { rows: [] };
    const res = await getSessionGET(new Request("http://localhost/api/consultations/appt-1"), {
      params: ROUTE_PARAMS,
    });
    expect(res.status).toBe(404);
  });

  it("403 for a non-participant (neither patient nor assigned clinician)", async () => {
    getUserMock.mockResolvedValue({ id: "outsider-1", email: "" });
    tables.care_appointments = { rows: [appointment()] };
    tables.clinician_profiles = { rows: [{ id: "clin-other", user_id: "outsider-1" }] };
    const res = await getSessionGET(new Request("http://localhost/api/consultations/appt-1"), {
      params: ROUTE_PARAMS,
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("patient owner in a joinable state receives the room capability once", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = { rows: [appointment()] };
    tables.care_requests = {
      rows: [
        {
          id: "cr-1",
          reason: "Fever for two days",
          triage_category: "routine",
        },
      ],
    };
    // reason comes from the linked care request:
    tables.care_appointments.rows[0].care_request_id = "cr-1";

    const res = await getSessionGET(new Request("http://localhost/api/consultations/appt-1"), {
      params: ROUTE_PARAMS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.role).toBe("patient");
    expect(body.session.roomChannel).toMatch(/^consultation:/);
    expect(typeof body.session.participantId).toBe("string");
    expect(body.session.reason).toBe("Fever for two days");
    // Room capability was minted server-side.
    expect(updates.some((u) => u.table === "care_appointments" && typeof u.row.room_id === "string")).toBe(
      true
    );
    // No medical records ever ride this endpoint.
    expect(JSON.stringify(body)).not.toContain("documents");
  });

  it("assigned clinician receives the session with role=clinician", async () => {
    getUserMock.mockResolvedValue({ id: "doctor-user-1", email: "" });
    tables.care_appointments = { rows: [appointment()] };
    tables.clinician_profiles = { rows: [{ id: "clin-1", user_id: "doctor-user-1" }] };

    const res = await getSessionGET(new Request("http://localhost/api/consultations/appt-1"), {
      params: ROUTE_PARAMS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.role).toBe("clinician");
  });

  it("no room capability outside a joinable state (even if one was minted before)", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = {
      rows: [appointment({ state: "proposed", room_id: "11111111-2222-4333-8444-555555555555" })],
    };

    const res = await getSessionGET(new Request("http://localhost/api/consultations/appt-1"), {
      params: ROUTE_PARAMS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.roomChannel).toBeNull();
    expect(updates).toHaveLength(0); // nothing re-minted either
  });

  it("bounds the reason snippet to 300 characters", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = { rows: [appointment({ care_request_id: "cr-1" })] };
    tables.care_requests = {
      rows: [{ id: "cr-1", reason: "x".repeat(500), triage_category: "routine" }],
    };

    const res = await getSessionGET(new Request("http://localhost/api/consultations/appt-1"), {
      params: ROUTE_PARAMS,
    });
    const body = await res.json();
    expect(body.session.reason).toHaveLength(300);
  });
});

// ── GET /api/consultations (list) ─────────────────────────────────────────

describe("GET consultation list", () => {
  it("401 without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await listGET();
    expect(res.status).toBe(401);
  });

  it("returns only rows scoped to me, and never the room capability", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = {
      rows: [
        appointment({ id: "appt-mine", patient_id: "patient-1", care_request_id: "cr-1", room_id: "secret-room" }),
        appointment({ id: "appt-other", patient_id: "someone-else" }),
      ],
    };
    tables.clinician_profiles = { rows: [] };
    tables.care_requests = {
      rows: [{ id: "cr-1", reason: "Cough", triage_category: "urgent" }],
    };

    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe("appt-mine");
    expect(body.sessions[0].roomChannel).toBeNull();
    expect(body.sessions[0].reason).toBe("Cough");
    expect(JSON.stringify(body)).not.toContain("secret-room");
  });
});

// ── POST /api/consultations/[id]/signal ───────────────────────────────────

describe("POST consultation signal events", () => {
  function signalReq(body: unknown) {
    return new Request("http://localhost/api/consultations/appt-1/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("401 without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await signalPOST(signalReq({ event: "join" }), { params: ROUTE_PARAMS });
    expect(res.status).toBe(401);
  });

  it("400 for unknown or malformed events (closed vocabulary)", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    const unknown = await signalPOST(signalReq({ event: "diagnosis_made" }), { params: ROUTE_PARAMS });
    expect(unknown.status).toBe(400);
    const malformed = await signalPOST(signalReq({ event: 42 }), { params: ROUTE_PARAMS });
    expect(malformed.status).toBe(400);
    const notJson = await signalPOST(
      new Request("http://localhost/api/consultations/appt-1/signal", { method: "POST", body: "nope" }),
      { params: ROUTE_PARAMS }
    );
    expect(notJson.status).toBe(400);
    expect(recordMetricMock).not.toHaveBeenCalled();
  });

  it("404 missing appointment, 403 outsider, 409 when the room is not joinable", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = { rows: [] };
    const missing = await signalPOST(signalReq({ event: "join" }), { params: ROUTE_PARAMS });
    expect(missing.status).toBe(404);

    tables.care_appointments = { rows: [appointment()] };
    getUserMock.mockResolvedValue({ id: "outsider-1", email: "" });
    tables.clinician_profiles = { rows: [] };
    const forbidden = await signalPOST(signalReq({ event: "join" }), { params: ROUTE_PARAMS });
    expect(forbidden.status).toBe(403);

    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = { rows: [appointment({ state: "proposed" })] };
    const conflict = await signalPOST(signalReq({ event: "join" }), { params: ROUTE_PARAMS });
    expect(conflict.status).toBe(409);
    expect(auditInserts).toHaveLength(0);
  });

  it("authorized join → audit row + privacy-safe metric, structured success", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = { rows: [appointment()] };

    const res = await signalPOST(signalReq({ event: "join" }), { params: ROUTE_PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("SIGNALLED");
    expect(typeof body.realtimeAvailable).toBe("boolean");

    // Audit row carries the event name only — no free-form patient content.
    expect(auditInserts.some((a) => a.table === "consultation_audit_events")).toBe(true);
    // Metric uses the closed vocabulary.
    expect(recordMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "consultation_started" })
    );
  });

  it("bounded detail is the only free-form field accepted", async () => {
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.care_appointments = { rows: [appointment()] };

    const tooLong = await signalPOST(
      signalReq({ event: "join", detail: "x".repeat(201) }),
      { params: ROUTE_PARAMS }
    );
    expect(tooLong.status).toBe(400);

    const ok = await signalPOST(signalReq({ event: "leave", role: "patient" }), {
      params: ROUTE_PARAMS,
    });
    expect(ok.status).toBe(200);
    expect(recordMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "consultation_completed" })
    );
  });
});
