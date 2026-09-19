/**
 * API tests for Part 2 packet submission via /api/care-requests.
 * Covers: auth, packet validation (invented rule IDs, missing ack, closed
 * concept set), linked-document ownership, idempotent duplicate-safe retries,
 * and no internal-error leakage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const lookupMock = vi.fn();
const storeMock = vi.fn();

vi.mock("@/lib/auth-helpers", () => ({
  getUser: () => getUserMock(),
}));

vi.mock("@/lib/api/idempotency", () => ({
  lookupIdempotentResponse: (...a: unknown[]) => lookupMock(...a),
  storeIdempotentResponse: (...a: unknown[]) => storeMock(...a),
}));

type Row = Record<string, unknown>;
type DbResult = { data: Row | Row[] | null; error: { code: string; message: string } | null };

const chainState: {
  rows: Row[];
  failWith?: { code: string };
  ownedDocumentIds: string[];
} = {
  rows: [],
  ownedDocumentIds: [],
};

function makeAdmin() {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(async (): Promise<DbResult> => {
      if (chainState.failWith) {
        return { data: null, error: { code: chainState.failWith.code, message: "internal pg error XYZ" } };
      }
      const [row] = chainState.rows;
      return { data: row ?? null, error: null };
    }),
    maybeSingle: vi.fn(async (): Promise<DbResult> => {
      const [row] = chainState.rows;
      return { data: row ?? null, error: null };
    }),
    in: vi.fn().mockImplementation(() => chain),
  };
  // Awaiting the chain (ownership check does `.select().eq().in()` then await)
  // resolves with the documents the server would find for this user.
  (chain as { then: (resolve: (v: { data: Row[]; error: null }) => void) => void }).then = (
    resolve: (v: { data: Row[]; error: null }) => void
  ) => {
    resolve({ data: chainState.ownedDocumentIds.map((id) => ({ id })), error: null });
  };
  return {
    from: vi.fn(() => chain),
    __chain: chain,
  };
}

let admin: ReturnType<typeof makeAdmin>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => admin,
}));

import { POST, GET } from "@/app/api/care-requests/route";
import { evaluateTriage } from "@/lib/triage/red-flags";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/care-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  chainState.rows = [];
  chainState.failWith = undefined;
  chainState.ownedDocumentIds = [];
  admin = makeAdmin();
});

function urgentPacketBody() {
  const t = evaluateTriage({ concepts: ["fever"], followUps: { fever_three_days_or_more: true } });
  return {
    language: "en",
    packet: {
      packet_id: "11111111-1111-4111-8111-111111111111",
      language: "en",
      symptom_text_original: "fever for four days",
      symptom_concepts: ["fever"],
      body_area: "whole_body",
      symptom_category: "fever_or_infection",
      follow_up_answers: { fever_three_days_or_more: true },
      age_group: null,
      triage_category: t.category,
      triage_rules_version: t.rulesVersion,
      triage_rule_ids: t.triggered.map((x) => x.id),
      linked_document_ids: [] as string[],
      created_at: "2026-09-18T10:00:00.000Z",
      acknowledged_emergency_guidance: true,
      summary: "Concerns: fever. Suggested urgency: Urgent.",
    },
  };
}

describe("auth", () => {
  it("401 without a session, no internals", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest(urgentPacketBody()));
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toMatch(/pg_|supabase|stack/i);
  });

  it("401 on GET without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/care-requests"));
    expect(res.status).toBe(401);
  });
});

describe("packet validation", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    lookupMock.mockResolvedValue(null);
  });

  it("accepts a valid urgent packet (201 CREATED)", async () => {
    chainState.rows = [
      { id: "cr-1", status: "draft", created_at: "2026-09-18T10:00:00Z", packet_id: "p1", triage_category: "urgent" },
    ];
    const res = await POST(makeRequest(urgentPacketBody(), { "Idempotency-Key": "k1" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.code).toBe("CREATED");
    expect(json.careRequest.packet_id).toBe("p1");
    expect(storeMock).toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/care-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invented rule ID", async () => {
    const b = urgentPacketBody();
    b.packet.triage_rule_ids = ["DENGUE-01"];
    const res = await POST(makeRequest(b));
    expect(res.status).toBe(400);
  });

  it("rejects emergency without acknowledgement", async () => {
    const t = evaluateTriage({ concepts: ["severe_bleeding"] });
    const b = urgentPacketBody();
    b.packet.triage_category = t.category;
    b.packet.triage_rule_ids = t.triggered.map((x) => x.id);
    b.packet.acknowledged_emergency_guidance = false;
    const res = await POST(makeRequest(b));
    expect(res.status).toBe(400);
  });

  it("rejects a concept outside the closed set", async () => {
    const b = urgentPacketBody();
    b.packet.symptom_concepts = ["dengue"];
    const res = await POST(makeRequest(b));
    expect(res.status).toBe(400);
  });
});

describe("linked-document ownership", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    lookupMock.mockResolvedValue(null);
  });

  it("403 when a linked document belongs to another user", async () => {
    chainState.ownedDocumentIds = []; // server finds none of the requested ids
    const b = urgentPacketBody();
    b.packet.linked_document_ids = ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"];
    const res = await POST(makeRequest(b));
    expect(res.status).toBe(403);
  });

  it("passes when all linked documents are owned", async () => {
    chainState.ownedDocumentIds = ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"];
    chainState.rows = [{ id: "cr-2", status: "draft", created_at: "2026-09-18T10:00:00Z" }];
    const b = urgentPacketBody();
    b.packet.linked_document_ids = ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"];
    const res = await POST(makeRequest(b));
    expect(res.status).toBe(201);
  });
});

describe("idempotency", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    lookupMock.mockResolvedValue(null);
  });

  it("replays the stored response on retry (no duplicate row)", async () => {
    const storedResp = {
      code: "CREATED",
      careRequest: { id: "cr-original", status: "draft", created_at: "2026-09-18T10:00:00Z", packet_id: null, triage_category: "urgent" },
    };
    lookupMock.mockResolvedValue({ replayed: true, response: storedResp });
    const res = await POST(makeRequest(urgentPacketBody(), { "Idempotency-Key": "key-1" }));
    expect(res.status).toBe(201);
    expect((await res.json()).careRequest.id).toBe("cr-original");
  });

  it("returns the original row on concurrent duplicate (23505)", async () => {
    chainState.failWith = { code: "23505" };
    chainState.rows = [{ id: "cr-original" }];
    const res = await POST(makeRequest(urgentPacketBody(), { "Idempotency-Key": "key-2" }));
    expect(res.status).toBe(201);
    expect((await res.json()).careRequest.id).toBe("cr-original");
  });

  it("stores the response after success for future replays", async () => {
    chainState.rows = [
      { id: "cr-new", status: "draft", created_at: "2026-09-18T10:00:00Z", packet_id: "p1", triage_category: "urgent" },
    ];
    const res = await POST(makeRequest(urgentPacketBody(), { "Idempotency-Key": "key-3" }));
    expect(res.status).toBe(201);
    expect(storeMock).toHaveBeenCalledWith(
      "u1",
      "care-requests:POST",
      "key-3",
      201,
      expect.anything()
    );
  });

  it("500 errors are generic and leak nothing", async () => {
    chainState.failWith = { code: "42P01" };
    const res = await POST(makeRequest(urgentPacketBody()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ code: "SAVE_FAILED" });
    expect(JSON.stringify(json)).not.toMatch(/pg_|XYZ/i);
  });
});
