/**
 * API tests for the care-requests route (Part 1 foundation).
 * Verifies authorization, validation, idempotency replay (duplicate-safe
 * retries), and that responses never leak database internals.
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
type DbResult = { data: Row | null; error: { code: string; message: string } | null };

const chainState: {
  rows: Row[];
  failWith?: { code: string };
} = { rows: [] };

function makeAdmin() {
  const chain = {
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

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/care-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  language: "en",
  reason: "I need help understanding my latest report",
  contact_method: "in_app",
  linked_document_ids: [],
  client_created_at: "2026-09-01T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  chainState.rows = [];
  chainState.failWith = undefined;
  admin = makeAdmin();
});

describe("authorization", () => {
  it("returns 401 without leaking internals when no session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ code: "UNAUTHENTICATED" });
    expect(JSON.stringify(json)).not.toMatch(/postgres|pg_|supabase|stack/i);
  });
});

describe("validation", () => {
  it("rejects invalid language", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const res = await POST(makeRequest({ ...VALID_BODY, language: "fr" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_BODY");
  });

  it("rejects an empty reason and an over-long reason", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const empty = await POST(makeRequest({ ...VALID_BODY, reason: "   " }));
    expect(empty.status).toBe(400);

    const long = await POST(makeRequest({ ...VALID_BODY, reason: "x".repeat(1001) }));
    expect(long.status).toBe(400);
  });

  it("rejects invalid contact method and malformed JSON", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const badContact = await POST(makeRequest({ ...VALID_BODY, contact_method: "fax" }));
    expect(badContact.status).toBe(400);

    const malformed = new Request("http://localhost/api/care-requests", {
      method: "POST",
      body: "{not json",
    });
    const res = await POST(malformed);
    expect(res.status).toBe(400);
  });
});

describe("idempotency (duplicate-safe retries)", () => {
  it("replays the stored response instead of creating a duplicate row", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const stored = { code: "CREATED", careRequest: { id: "cr-1", status: "draft", created_at: "2026-09-01T10:00:00Z" } };
    lookupMock.mockResolvedValue({ replayed: true, response: stored });

    const res = await POST(makeRequest(VALID_BODY, { "Idempotency-Key": "key-abc" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.careRequest.id).toBe("cr-1");
    expect(lookupMock).toHaveBeenCalledWith("u1", "care-requests:POST", "key-abc");
    // No insert happened — the replay short-circuits.
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("handles a concurrent duplicate via the unique constraint and returns the original row", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    lookupMock.mockResolvedValue(null);
    // First insert hits the unique-constraint error...
    chainState.failWith = { code: "23505" };
    const chain = admin.__chain;
    // ...and the follow-up lookup returns the original row.
    let call = 0;
    chain.maybeSingle.mockImplementation(async () => {
      call += 1;
      if (call === 1) return { data: { id: "cr-original" }, error: null };
      return { data: null, error: null };
    });

    const res = await POST(makeRequest(VALID_BODY, { "Idempotency-Key": "key-dup" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.careRequest.id).toBe("cr-original");
    expect(storeMock).toHaveBeenCalled();
  });

  it("stores the response after a successful create for future replays", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    lookupMock.mockResolvedValue(null);
    chainState.rows = [{ id: "cr-new", status: "draft", created_at: "2026-09-01T10:00:00Z" }];

    const res = await POST(makeRequest(VALID_BODY, { "Idempotency-Key": "key-new" }));
    expect(res.status).toBe(201);
    expect((await res.json()).careRequest.id).toBe("cr-new");
    expect(storeMock).toHaveBeenCalledWith("u1", "care-requests:POST", "key-new", 201, expect.anything());
  });

  it("server errors are generic and never leak internals", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    lookupMock.mockResolvedValue(null);
    chainState.failWith = { code: "42P01" }; // e.g. table missing — not user-fixable

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ code: "SAVE_FAILED" });
    expect(JSON.stringify(json)).not.toMatch(/pg_|postgres|XYZ/i);
  });
});

describe("ownership", () => {
  it("lists only the session user's requests (GET)", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const chain = admin.__chain;
    let eqArgs: unknown[] = [];
    chain.eq.mockImplementation((...args: unknown[]) => {
      eqArgs = args;
      return chain;
    });
    chain.limit.mockResolvedValue({ data: [{ id: "cr-1", user_id: "u1" }], error: null });

    const res = await GET(new Request("http://localhost/api/care-requests"));
    expect(res.status).toBe(200);
    expect(eqArgs).toEqual(["user_id", "u1"]);
    expect(((await res.json()) as { careRequests: unknown[] }).careRequests).toHaveLength(1);
  });

  it("returns 401 on GET without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/care-requests"));
    expect(res.status).toBe(401);
  });
});
