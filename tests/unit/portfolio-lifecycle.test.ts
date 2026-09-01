/**
 * Headless verification script for portfolio creation lifecycle.
 * Tests the real API route handler with mocked Supabase.
 * Traces: session check → existing portfolio → create new → idempotency → error handling
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Mock setup ──────────────────────────────────────────────────────────
let mockMaybeSingle: ReturnType<typeof vi.fn>;
let mockSingle: ReturnType<typeof vi.fn>;
let mockInsert: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: Record<string, any> = {
        select: (..._a: unknown[]) => chain,
        eq: (..._a: unknown[]) => chain,
        limit: (..._a: unknown[]) => chain,
        maybeSingle: () => mockMaybeSingle(table),
        single: () => mockSingle(table),
        insert: (data: unknown) => {
          mockInsert(table, data);
          return {
            select: (..._a: unknown[]) => ({
              single: () => mockSingle(table),
            }),
          };
        },
      };
      return chain;
    },
    auth: {},
  }),
}));

vi.mock("@/lib/auth-helpers", () => ({
  getUser: vi.fn(),
}));

// ─── Tests ───────────────────────────────────────────────────────────────

describe("Portfolio lifecycle (headless)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mockInsert = vi.fn();
  });

  function makePostRequest() {
    return new Request("http://localhost:3000/api/portfolios", {
      method: "POST",
    }) as any;
  }

  async function importRoute() {
    // Reset module cache so each test gets fresh imports
    vi.resetModules();
    const route = await import("@/app/api/portfolios/route");
    const authHelpers = await import("@/lib/auth-helpers");
    return { POST: route.POST, getUser: vi.mocked(authHelpers.getUser) };
  }

  it("LIFECYCLE: new user → no portfolio → create → return created=true", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue({ id: "user-new-001", email: "" });

    // Check: no existing portfolio
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    // Create: returns new portfolio
    mockSingle.mockResolvedValue({
      data: {
        id: "pf-abc",
        label: "My Healthfolio",
        created_at: "2026-08-29T00:00:00Z",
      },
      error: null,
    });

    const res = await POST(makePostRequest());
    const body = await res.json();

    // Assertions
    expect(res.status).toBe(200);
    expect(body.data.created).toBe(true);
    expect(body.data.portfolio.id).toBe("pf-abc");
    expect(body.data.portfolio.label).toBe("My Healthfolio");

    // Verify insert was called with correct data
    expect(mockInsert).toHaveBeenCalledWith("portfolios", {
      user_id: "user-new-001",
      label: "My Healthfolio",
    });

    // Verify the flow: check → create → return
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mockSingle).toHaveBeenCalledTimes(1);
    console.log("✅ LIFECYCLE: new user create flow works");
  });

  it("LIFECYCLE: existing user → portfolio exists → return created=false", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue({ id: "user-existing-001", email: "" });

    // Check: portfolio already exists
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "pf-existing",
        label: "My Healthfolio",
        created_at: "2025-01-01T00:00:00Z",
      },
      error: null,
    });

    const res = await POST(makePostRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.created).toBe(false);
    expect(body.data.portfolio.id).toBe("pf-existing");

    // Insert should NOT be called
    expect(mockInsert).not.toHaveBeenCalled();
    console.log("✅ LIFECYCLE: existing user returns existing portfolio");
  });

  it("LIFECYCLE: no session → 401", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue(null);

    const res = await POST(makePostRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_REQUIRED");
    console.log("✅ LIFECYCLE: unauthenticated returns 401");
  });

  it("LIFECYCLE: race condition → unique violation → recovers", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue({ id: "user-race-001", email: "" });

    // First check: no portfolio
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      // Recovery check: portfolio now exists
      .mockResolvedValueOnce({
        data: {
          id: "pf-race",
          label: "My Healthfolio",
          created_at: "2026-08-29T00:00:00Z",
        },
        error: null,
      });

    // Insert returns unique constraint violation
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "idx_portfolios_user_id_unique"' },
    });

    const res = await POST(makePostRequest());
    const body = await res.json();

    // Should recover gracefully
    expect(res.status).toBe(200);
    expect(body.data.created).toBe(false);
    expect(body.data.portfolio.id).toBe("pf-race");
    console.log("✅ LIFECYCLE: race condition recovery works");
  });

  it("LIFECYCLE: database error → NETWORK_ERROR", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue({ id: "user-db-err-001", email: "" });

    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "connection refused" },
    });

    const res = await POST(makePostRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("NETWORK_ERROR");
    expect(body.error.message).not.toContain("PGRST301"); // No internal details
    console.log("✅ LIFECYCLE: database error shows safe error");
  });

  it("LIFECYCLE: insert fails non-unique → PORTFOLIO_CREATE_FAILED", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue({ id: "user-insert-err-001", email: "" });

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    const res = await POST(makePostRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PORTFOLIO_CREATE_FAILED");
    expect(body.error.message).not.toContain("permission denied"); // No internal details
    console.log("✅ LIFECYCLE: insert failure shows safe error");
  });

  it("LIFECYCLE: no fake user IDs or hardcoded data", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue({ id: "user-real-001", email: "" });

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({
      data: {
        id: "pf-real",
        label: "My Healthfolio",
        created_at: "2026-08-29T00:00:00Z",
      },
      error: null,
    });

    await POST(makePostRequest());

    // Verify the user ID from session is used, not a hardcoded one
    const insertCall = mockInsert.mock.calls[0];
    expect(insertCall[1].user_id).toBe("user-real-001");
    expect(insertCall[1].label).toBe("My Healthfolio");
    expect(insertCall[1].user_id).not.toBe("00000000-0000-0000-0000-000000000001"); // Not demo user
    console.log("✅ LIFECYCLE: no hardcoded user IDs");
  });

  it("LIFECYCLE: response contract has no internal details", async () => {
    const { POST, getUser } = await importRoute();
    getUser.mockResolvedValue({ id: "user-contract-001", email: "" });

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    // Recovery check returns portfolio
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "pf-contract", label: "My Healthfolio", created_at: "2026-01-01T00:00:00Z" },
      error: null,
    });

    const res = await POST(makePostRequest());
    const body = await res.json();
    const responseStr = JSON.stringify(body);

    // No SQL, no tokens, no keys, no stack traces
    expect(responseStr).not.toMatch(/auth\.uid\(\)/);
    expect(responseStr).not.toMatch(/SELECT|INSERT|UPDATE|DELETE/i);
    expect(responseStr).not.toMatch(/token|password|secret|api_key/i);
    expect(responseStr).not.toMatch(/stack|trace|Error:/);
    console.log("✅ LIFECYCLE: response contract is clean");
  });
});
