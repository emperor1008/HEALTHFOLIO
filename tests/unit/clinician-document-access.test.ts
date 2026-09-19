/**
 * Consent-gated clinician document access tests.
 * Proves a clinician can open ONLY documents covered by an active, unrevoked,
 * unexpired consent on a request they are assigned to; the URL is short-lived;
 * every open is audited; unconsented access is rejected.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();

vi.mock("@/lib/auth-helpers", () => ({
  getUser: () => getUserMock(),
}));

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {};
const auditRows: Array<{ table: string; row: Row }> = [];
const signedUrlMock = vi.fn();

/**
 * Minimal eq-aware query chain: `.select().eq(col, val)...` narrows rows so
 * ownership checks behave like the real database. `.is(col, null)` and
 * `.in(col, values)` are also honored for the columns the route uses.
 */
function chainFor(table: string) {
  const state = { filters: [] as Array<(r: Row) => boolean>, ran: false as boolean | null };
  const apply = (rows: Row[]) => state.filters.reduce((acc, f) => acc.filter(f), rows);
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      state.filters.push((r) => r[col] === val);
      return chain;
    }),
    in: vi.fn((col: string, vals: unknown[]) => {
      state.filters.push((r) => vals.includes(r[col]));
      return chain;
    }),
    is: vi.fn((col: string, val: unknown) => {
      state.filters.push((r) => r[col] === val);
      return chain;
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn((row: Row) => {
      auditRows.push({ table, row });
      return chain;
    }),
    maybeSingle: vi.fn(async () => {
      const rows = apply(tables[table] ?? []);
      return { data: rows[0] ?? null, error: null };
    }),
  };
  return chain;
}

let admin: unknown;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => chainFor(table),
    storage: {
      from: () => ({
        createSignedUrl: (...a: unknown[]) =>
          signedUrlMock(...a).then((v: unknown) => ({ data: v, error: null })),
      }),
    },
  }),
}));

import { GET } from "@/app/api/clinician/documents/route";

function req() {
  return new Request(
    "http://localhost/api/clinician/documents?careRequestId=cr-1&documentId=doc-1"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  auditRows.length = 0;
  getUserMock.mockResolvedValue({ id: "clinician-user", email: "" });
  signedUrlMock.mockResolvedValue({ signedUrl: "https://signed.example/t/doc-1?token=x" });
});

function seedHappyPath() {
  tables.clinician_profiles = [{ id: "prof-1", user_id: "clinician-user" }];
  tables.care_request_assignments = [
    { id: "a-1", care_request_id: "cr-1", clinician_id: "prof-1", state: "accepted" },
  ];
  tables.document_share_consents = [
    { id: "cons-1", care_request_id: "cr-1", document_ids: ["doc-1", "doc-2"], revoked_at: null },
  ];
  tables.clinician_document_access = [
    {
      id: "g-1",
      care_request_id: "cr-1",
      clinician_profile_id: "prof-1",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked_at: null,
    },
  ];
  tables.care_requests = [{ id: "cr-1", user_id: "patient-1" }];
  tables.documents = [
    { id: "doc-1", user_id: "patient-1", storage_path: "p/doc-1", file_name: "report.pdf", mime_type: "application/pdf" },
  ];
}

describe("consent-gated access", () => {
  it("happy path: assigned clinician + active consent gets a short-lived signed URL", async () => {
    seedHappyPath();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signedUrl).toMatch(/^https:/);
    expect(json.expiresInSeconds).toBe(300);
    expect(signedUrlMock).toHaveBeenCalledWith("p/doc-1", 300);
    // Access is audited.
    expect(auditRows.some((a) => a.table === "clinician_document_access_audit" && a.row.document_id === "doc-1")).toBe(true);
  });

  it("rejects a clinician with no assignment on the request", async () => {
    seedHappyPath();
    tables.care_request_assignments = [];
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ASSIGNED");
  });

  it("rejects when no consent exists", async () => {
    seedHappyPath();
    tables.document_share_consents = [];
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NO_ACTIVE_CONSENT");
  });

  it("rejects a document the consent does not cover (unselected record)", async () => {
    seedHappyPath();
    tables.document_share_consents = [
      { id: "cons-1", document_ids: ["doc-OTHER"], revoked_at: null },
    ];
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NO_ACTIVE_CONSENT");
  });

  it("rejects an expired access window", async () => {
    seedHappyPath();
    tables.clinician_document_access = [
      { id: "g-1", expires_at: new Date(Date.now() - 1000).toISOString(), revoked_at: null },
    ];
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ACCESS_EXPIRED");
  });

  it("rejects a revoked grant", async () => {
    seedHappyPath();
    tables.clinician_document_access = [
      { id: "g-1", expires_at: new Date(Date.now() + 3600_000).toISOString(), revoked_at: new Date().toISOString() },
    ];
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("never serves another patient's document", async () => {
    seedHappyPath();
    tables.documents = [
      { id: "doc-1", user_id: "someone-else", storage_path: "p/doc-1", file_name: "x.pdf", mime_type: "application/pdf" },
    ];
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("a patient (non-staff) cannot use this endpoint", async () => {
    seedHappyPath();
    getUserMock.mockResolvedValue({ id: "patient-1", email: "" });
    tables.clinician_profiles = [];
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("STAFF_ACCESS_NOT_CONFIGURED");
  });
});
