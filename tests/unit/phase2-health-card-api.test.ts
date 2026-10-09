/**
 * Phase 2 — /api/health-card API security tests (route with mocked Supabase).
 *
 * Proves:
 * - 401 without a Better Auth session on GET and PATCH;
 * - reads/writes are scoped to the SESSION user (no client-selectable
 *   address: a body that tries to set user_id is ignored);
 * - missing facts table (migration 029 unapplied) degrades honestly:
 *   GET still succeeds with empty facts, PATCH returns 503 CONFIGURATION_ERROR;
 * - PATCH validation rejects malformed facts with 400;
 * - the response only ever contains card-schema fields (no raw rows).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({ getUser: () => getUserMock() }));

type Row = Record<string, unknown>;
type DbResult = { data: Row | Row[] | null; error: { code: string; message: string } | null };

interface TableMock {
  rows: Row[];
  failWith?: { code: string };
}

const tables: Record<string, TableMock> = {};
let upserts: Array<{ table: string; row: Row }> = [];

function makeAdmin() {
  function chainFor(table: string) {
    const state = (tables[table] ??= { rows: [] });
    const filters: Array<[string, unknown]> = [];
    const apply = (rows: Row[]) =>
      rows.filter((r) => filters.every(([col, val]) => r[col] === val));
    const errorResult = (): DbResult | null =>
      state.failWith
        ? { data: null, error: { code: state.failWith.code, message: "relation does not exist XYZ" } }
        : null;

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      upsert: (row: Row) => {
        upserts.push({ table, row });
        if (!state.failWith) {
          // Replace the row for the same owner so the rebuilt card reflects it.
          const key = typeof row.user_id === "string" ? "user_id" : "id";
          state.rows = [
            ...state.rows.filter((r) => r[key as string] !== row[key as string]),
            row,
          ];
        }
        return chain;
      },
      maybeSingle: async (): Promise<DbResult> => {
        const err = errorResult();
        if (err) return err;
        return { data: apply(state.rows)[0] ?? null, error: null };
      },
      single: async (): Promise<DbResult> => {
        const err = errorResult();
        if (err) return err;
        const row = apply(state.rows)[0];
        return row ? { data: row, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      },
      then: (resolve: (v: DbResult) => void) => {
        const err = errorResult();
        resolve(err ?? { data: apply(state.rows), error: null });
      },
    };
    return chain;
  }
  return { from: (table: string) => chainFor(table) };
}

let admin: ReturnType<typeof makeAdmin>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

import { GET as cardGET, PATCH as cardPATCH } from "@/app/api/health-card/route";

const NOW = new Date().toISOString();

function seedStandardTables() {
  tables.profiles = {
    rows: [
      { id: "u1", display_name: "Asha Kumar", locale: "hi" },
      { id: "u2", display_name: "Other Person", locale: "en" },
    ],
  };
  tables.medication_plans = {
    rows: [
      { user_id: "u1", display_name: "Metformin", status: "active", updated_at: NOW },
      { user_id: "u2", display_name: "SECRET-OTHER-MEDS", status: "active", updated_at: NOW },
    ],
  };
  tables.health_card_facts = {
    rows: [{ user_id: "u1", allergies: ["Penicillin"], conditions: ["Asthma"], updated_at: NOW }],
  };
  tables.care_requests = {
    rows: [
      {
        id: "cr-1",
        user_id: "u1",
        status: "queued",
        triage_category: "routine",
        summary: "Concerns: fever.",
        reason: null,
        created_at: NOW,
      },
      {
        id: "cr-2",
        user_id: "u2",
        status: "queued",
        triage_category: "routine",
        summary: "OTHER USER CARE",
        reason: null,
        created_at: NOW,
      },
    ],
  };
}

function getReq() {
  return new Request("http://localhost/api/health-card");
}

function patchReq(body: unknown) {
  return new Request("http://localhost/api/health-card", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  upserts = [];
  admin = makeAdmin();
});

// ── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/health-card", () => {
  it("401 without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await cardGET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("AUTH_REQUIRED");
    expect(json.data).toBeNull();
    expect(typeof json.requestId).toBe("string");
  });

  it("returns ONLY the session user's data (cross-user rows invisible)", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "a@example.com" });
    seedStandardTables();

    const res = await cardGET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const card = data.card;

    expect(card.profile.displayName).toBe("Asha Kumar");
    expect(card.profile.preferredLanguage).toBe("hi");
    expect(card.medications).toEqual(["Metformin"]);
    expect(card.medications).not.toContain("SECRET-OTHER-MEDS");
    expect(card.allergies).toEqual(["Penicillin"]);
    expect(card.conditions).toEqual(["Asthma"]);
    expect(card.recentCare.map((c: { id: string }) => c.id)).toEqual(["cr-1"]);
    expect(JSON.stringify(card)).not.toContain("OTHER USER CARE");
    expect(JSON.stringify(card)).not.toContain("u2");
  });

  it("degrades honestly when the facts table (migration 029) is missing", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    seedStandardTables();
    tables.health_card_facts = { rows: [], failWith: { code: "42P01" } };

    const res = await cardGET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.card.allergies).toEqual([]);
    expect(data.card.conditions).toEqual([]);
    expect(data.card.medications).toEqual(["Metformin"]); // rest of card unaffected
  });

  it("responds with card-schema fields only (never raw rows)", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    seedStandardTables();
    tables.medication_plans.rows[0] = {
      ...tables.medication_plans.rows[0],
      id: "plan-internal",
      user_id_internal: "u1",
      dosage_secret: "200mg",
      status: "active",
    };

    const res = await cardGET();
    const { data } = await res.json();

    expect(Object.keys(data.card).sort()).toEqual(
      [
        "allergies",
        "conditions",
        "medications",
        "profile",
        "recentCare",
        "schemaVersion",
        "updatedAt",
        "version",
      ].sort()
    );
    expect(JSON.stringify(data.card)).not.toContain("200mg");
    expect(JSON.stringify(data.card)).not.toContain("plan-internal");
  });
});

// ── PATCH ──────────────────────────────────────────────────────────────────

describe("PATCH /api/health-card", () => {
  it("401 without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await cardPATCH(patchReq({ allergies: [], conditions: [] }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("AUTH_REQUIRED");
  });

  it("400 on malformed JSON", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const res = await cardPATCH(patchReq("{nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("400 on invalid facts (bad shapes and over-limit values)", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const badBodies: unknown[] = [
      { allergies: "Penicillin" }, // not an array
      { allergies: [""] }, // empty after trim
      { allergies: ["x".repeat(121)], conditions: [] }, // item too long
      { allergies: Array(51).fill("a"), conditions: [] }, // too many items
      { conditions: [123] }, // wrong element type
      {},
    ];
    for (const body of badBodies) {
      const res = await cardPATCH(patchReq(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    }
  });

  it("503 CONFIGURATION_ERROR when the facts table does not exist", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    seedStandardTables();
    tables.health_card_facts = { rows: [], failWith: { code: "42P01" } };

    const res = await cardPATCH(patchReq({ allergies: ["Latex"], conditions: [] }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("CONFIGURATION_ERROR");
    expect(json.error.message).not.toMatch(/42P01|relation|does not exist/i);
  });

  it("saves facts for the SESSION user; a body user_id is ignored", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    seedStandardTables();

    const res = await cardPATCH(
      patchReq({ allergies: ["Latex"], conditions: ["Thyroid"], user_id: "u2" })
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("health_card_facts");
    expect(upserts[0].row.user_id).toBe("u1"); // session owner, NOT body value
    expect(upserts[0].row.allergies).toEqual(["Latex"]);

    // Rebuilt card reflects the save.
    expect(data.card.allergies).toEqual(["Latex"]);
    expect(data.card.conditions).toEqual(["Thyroid"]);
  });

  it("never writes a row for a different user", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    seedStandardTables();

    await cardPATCH(patchReq({ allergies: [], conditions: [], user_id: "u2", id: "evil" }));
    const writtenUsers = upserts.map((u) => u.row.user_id);
    expect(writtenUsers).toEqual(["u1"]);
    // The other user's facts row is untouched.
    expect(tables.health_card_facts.rows.some((r) => r.user_id === "u2")).toBe(false);
  });
});
