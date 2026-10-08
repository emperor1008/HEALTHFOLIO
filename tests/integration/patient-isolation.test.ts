// @vitest-environment node
/**
 * Phase 6 §5 / §12 — cross-user security for patient-owned data.
 *
 * Patient A attempts to read, update, and delete Patient B's records through
 * the real API routes. Every attempt must fail, and — because the server uses
 * the service-role connection (RLS bypassed) — the tests assert the second
 * control that actually protects the data: the owner filter bound to the
 * session id. The recorded query audit proves each statement carried it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actAs,
  appState,
  db,
  one,
  query,
  seedDocument,
  seedPatient,
  seedPortfolio,
  setupHarness,
  teardownHarness,
  type UserFixture,
} from "./support/app-harness";

vi.mock("@/lib/auth-session", () => ({
  getSessionUser: async () => appState.identity,
  getActiveRoles: async () => appState.roles,
}));
vi.mock("@/lib/auth-helpers", () => ({ getUser: async () => appState.identity }));
vi.mock("@/lib/supabase/user-context", () => ({
  getServerSupabase: () => appState.client,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: async () => appState.client }));

import {
  DELETE as deleteUserData,
  GET as getUserData,
  PATCH as patchUserData,
  POST as postUserData,
} from "@/app/api/user-data/[table]/route";
import { POST as signDocument } from "@/app/api/documents/[id]/signed-url/route";
import { routeParams } from "./support/app-harness";


describe("Phase 6 §5 — patient isolation through the real /api/user-data gateway", () => {
  let patientA: UserFixture;
  let patientB: UserFixture;
  let docA: { documentId: string };
  let docB: { documentId: string };

  beforeAll(async () => {
    await setupHarness();
    patientA = await seedPatient("patient-a@example.test");
    patientB = await seedPatient("patient-b@example.test");
    docA = await seedDocument(patientA.userId, { name: "patient-a-report.pdf" });
    docB = await seedDocument(patientB.userId, { name: "patient-b-report.pdf" });
    await actAs(patientA);
  }, 180_000);

  afterAll(async () => {
    await teardownHarness();
  });

  beforeEach(async () => {
    await db().asRole("service_role");
    await actAs(patientA);
  });

  it("returns only the caller's documents", async () => {
    const res = await getUserData(
      new Request("https://app.test/api/user-data/documents?select=id,original_name"),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { id: string }[] };
    const ids = body.rows.map((r) => r.id);
    expect(ids).toContain(docA.documentId);
    expect(ids).not.toContain(docB.documentId);
  });

  it("ignores a client-supplied user_id filter (cannot scope to another patient)", async () => {
    const res = await getUserData(
      new Request(
        `https://app.test/api/user-data/documents?select=id&eq=user_id=${patientB.userId}`
      ),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { id: string }[] };
    // The eq filter on user_id is dropped; ownership stays bound to the session.
    expect(body.rows.map((r) => r.id)).not.toContain(docB.documentId);
  });

  it("forces the owner on insert even when the body claims another user", async () => {
    const portfolioId = await seedPortfolio(patientA.userId);
    const documentId = crypto.randomUUID();
    const res = await postUserData(
      new Request("https://app.test/api/user-data/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: documentId,
          user_id: patientB.userId,
          portfolio_id: portfolioId,
          original_name: "spoofed.pdf",
          storage_path: `${patientA.userId}/x/y/z.pdf`,
          mime_type: "application/pdf",
          size_bytes: 12,
        }),
      }),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBe(201);
    const row = await one<{ user_id: string }>(
      "select user_id from documents where id = $1",
      [documentId]
    );
    expect(row?.user_id).toBe(patientA.userId);
    expect(row?.user_id).not.toBe(patientB.userId);
  });

  it("cannot attach a record to another patient's portfolio", async () => {
    const portfolioB = await seedPortfolio(patientB.userId, "B portfolio");
    const documentId = crypto.randomUUID();
    const res = await postUserData(
      new Request("https://app.test/api/user-data/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: documentId,
          portfolio_id: portfolioB,
          original_name: "injected.pdf",
          storage_path: `${patientA.userId}/a/b/c.pdf`,
          mime_type: "application/pdf",
          size_bytes: 12,
        }),
      }),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await one("select id from documents where id = $1", [documentId])).toBeNull();
  });

  it("reports a duplicate insert as a conflict, not a server outage", async () => {
    const portfolioId = await seedPortfolio(patientA.userId, "dup portfolio");
    const documentId = crypto.randomUUID();
    const body = {
      id: documentId,
      portfolio_id: portfolioId,
      original_name: "duplicate.pdf",
      storage_path: `${patientA.userId}/a/b/dup.pdf`,
      mime_type: "application/pdf",
      size_bytes: 12,
    };
    const first = await postUserData(
      new Request("https://app.test/api/user-data/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      routeParams({ table: "documents" })
    );
    expect(first.status).toBe(201);
    const replay = await postUserData(
      new Request("https://app.test/api/user-data/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      routeParams({ table: "documents" })
    );
    expect(replay.status).toBe(409);
  });

  it("cannot read Patient B's row even when asking for it by primary key", async () => {
    const res = await getUserData(
      new Request(`https://app.test/api/user-data/documents?select=*&eq=id=${docB.documentId}`),
      routeParams({ table: "documents" })
    );
    const body = (await res.json()) as { rows: unknown[] };
    expect(body.rows).toEqual([]);
  });

  it("cannot update Patient B's document", async () => {
    const before = await snapshotDocument(docB.documentId);
    const res = await patchUserData(
      new Request(`https://app.test/api/user-data/documents?id=${docB.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ original_name: "overwritten.pdf" }),
      }),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await snapshotDocument(docB.documentId)).toEqual(before);
  });

  it("cannot delete Patient B's document", async () => {
    const res = await deleteUserData(
      new Request(`https://app.test/api/user-data/documents?id=${docB.documentId}`, {
        method: "DELETE",
      }),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await snapshotDocument(docB.documentId)).not.toBeNull();
  });

  it("cannot reassign ownership of its own row to another user", async () => {
    await patchUserData(
      new Request(`https://app.test/api/user-data/documents?id=${docA.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: patientB.userId, original_name: "renamed.pdf" }),
      }),
      routeParams({ table: "documents" })
    );
    const after = await snapshotDocument(docA.documentId);
    expect(after?.user_id).toBe(patientA.userId);
  });

  it("audit: every statement the gateway ran against a user-owned table carried the owner filter", async () => {
    const statements = auditFor("documents").filter((s) => s.op !== "insert");
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement.filters).toContain("user_id.eq");
    }
  });

  it("rejects unauthenticated access", async () => {
    await actAs(null);
    const res = await getUserData(
      new Request("https://app.test/api/user-data/documents"),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects tables outside the allow-list and read-only tables", async () => {
    const unknown = await getUserData(
      new Request("https://app.test/api/user-data/audit_events"),
      routeParams({ table: "audit_events" })
    );
    expect(unknown.status).toBe(400);

    const readOnlyWrite = await postUserData(
      new Request("https://app.test/api/user-data/medical_measurements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: 1 }),
      }),
      routeParams({ table: "medical_measurements" })
    );
    expect(readOnlyWrite.status).toBe(400);
  });

  it("rejects malformed identifiers", async () => {
    const res = await patchUserData(
      new Request("https://app.test/api/user-data/documents?id=not-a-uuid", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ original_name: "x.pdf" }),
      }),
      routeParams({ table: "documents" })
    );
    expect(res.status).toBe(400);
  });

  // ── storage: signed URLs are owner-only (§14) ───────────────────────────
  describe("§14 private document signed URLs", () => {
    it("issues a short-lived URL for the caller's own document", async () => {
      const res = await signDocument(
        new Request(`https://app.test/api/documents/${docA.documentId}/signed-url`, {
          method: "POST",
        }),
        routeParams({ id: docA.documentId })
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { url: string; expiresIn: number };
      expect(body.expiresIn).toBe(60);
      expect(body.url).toContain("storage.harness.local");
      const [record] = client().signedUrls.slice(-1);
      expect(record.expiresInSeconds).toBe(60);
    });

    it("refuses to sign another patient's document (403, not 404 — no existence leak)", async () => {
      const before = client().signedUrls.length;
      const res = await signDocument(
        new Request(`https://app.test/api/documents/${docB.documentId}/signed-url`, {
          method: "POST",
        }),
        routeParams({ id: docB.documentId })
      );
      expect(res.status).toBe(403);
      expect(client().signedUrls.length).toBe(before);
    });

    it("refuses to sign a document that does not exist", async () => {
      const res = await signDocument(
        new Request(
          `https://app.test/api/documents/00000000-0000-4000-8000-000000000000/signed-url`,
          { method: "POST" }
        ),
        routeParams({ id: "00000000-0000-4000-8000-000000000000" })
      );
      expect(res.status).toBe(403);
    });

    it("rejects a malformed document id", async () => {
      const res = await signDocument(
        new Request("https://app.test/api/documents/../etc/passwd/signed-url", { method: "POST" }),
        routeParams({ id: "../../etc/passwd" })
      );
      expect(res.status).toBe(400);
    });

    it("requires a session", async () => {
      await actAs(null);
      const res = await signDocument(
        new Request(`https://app.test/api/documents/${docA.documentId}/signed-url`, {
          method: "POST",
        }),
        routeParams({ id: docA.documentId })
      );
      expect(res.status).toBe(401);
    });
  });
});

async function snapshotDocument(id: string) {
  const [row] = await query<{
    id: string;
    user_id: string;
    original_name: string;
    storage_path: string;
  }>("select id, user_id, original_name, storage_path from documents where id = $1", [id]);
  return row ?? null;
}

function client() {
  if (!appState.client) throw new Error("harness not ready");
  return appState.client;
}

function auditFor(table: string) {
  return client().audit.filter((entry) => entry.table === table);
}
