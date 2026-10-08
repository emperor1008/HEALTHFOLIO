// @vitest-environment node
/**
 * Phase 6 §8 — consent must gate every clinician read of patient data.
 *
 * The route under test is the ONLY clinician path to a patient document, and it
 * requires all of: an active assignment, an active (non-revoked) share consent
 * covering that exact document, an unexpired access grant, and a document that
 * belongs to the request's patient.
 *
 * Honest scope note (asserted at the bottom): revoking consent stops NEW
 * access. It does not — and this platform does not claim to — recall a URL that
 * was already issued; that is why issued URLs are short-lived (300s) and the
 * test measures the TTL rather than pretending revocation is retroactive.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  actAs,
  appState,
  countOf,
  db,
  seedCareRequest,
  seedClinician,
  seedDocument,
  seedDocumentAccess,
  seedFacility,
  seedPatient,
  seedShareConsent,
  setupHarness,
  teardownHarness,
  type ClinicianFixture,
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

import { GET as clinicianDocument } from "@/app/api/clinician/documents/route";

describe("Phase 6 §8 — consent-gated clinician document access", () => {
  let patientA: UserFixture;
  let patientB: UserFixture;
  let clinicianA: ClinicianFixture;
  let clinicianB: ClinicianFixture;
  let facility: string;
  let requestA: string;
  let docA: { documentId: string };

  const CLINICIAN_URL = (careRequestId: string, documentId: string) =>
    `https://app.test/api/clinician/documents?careRequestId=${careRequestId}&documentId=${documentId}`;

  beforeAll(async () => {
    await setupHarness();
    facility = await seedFacility("Consent Care Hub");
    patientA = await seedPatient("p6-consent-a@example.test");
    patientB = await seedPatient("p6-consent-b@example.test");
    clinicianA = await seedClinician({ email: "p6-consent-clin-a@example.test", facilityId: facility });
    clinicianB = await seedClinician({ email: "p6-consent-clin-b@example.test", facilityId: facility });
  }, 180_000);

  afterAll(async () => {
    await teardownHarness();
  });

  /** Discharge the previous scenario's consent/grant rows so each test is clean. */
  async function freshScenario(options?: { grantConsent?: boolean; accessExpiresInMs?: number; revokeConsent?: boolean; grantRevokedAccess?: boolean }) {
    await db().asRole("service_role");
    requestA = await seedCareRequest(patientA.userId, { reason: "Consent scenario" });
    docA = await seedDocument(patientA.userId, { name: `report-${crypto.randomUUID()}.pdf` });
    await query(
      `insert into care_request_assignments (care_request_id, clinician_id, state, assigned_by)
       values ($1, $2, 'accepted', $3)`,
      [requestA, clinicianA.profileId, clinicianA.userId]
    );
    if (options?.grantConsent !== false) {
      await seedShareConsent({
        careRequestId: requestA,
        patientId: patientA.userId,
        documentIds: [docA.documentId],
        revokedAt: options?.revokeConsent ? new Date() : null,
      });
    }
    await seedDocumentAccess({
      careRequestId: requestA,
      clinicianProfileId: clinicianA.profileId,
      expiresAt: new Date(Date.now() + (options?.accessExpiresInMs ?? 60 * 60 * 1000)),
      revokedAt: options?.grantRevokedAccess ? new Date() : null,
    });
  }

  it("grants access when assignment + consent + unexpired grant all hold", async () => {
    await freshScenario();
    await actAs(clinicianA);
    const res = await clinicianDocument(
      new Request(CLINICIAN_URL(requestA, docA.documentId))
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      code: string;
      signedUrl: string;
      expiresInSeconds: number;
    };
    expect(body.code).toBe("OK");
    expect(body.expiresInSeconds).toBe(300);
    expect(body.signedUrl).toContain("storage.harness.local");

    // Every access is audited.
    expect(
      await countOf(
        "select count(*)::int as count from clinician_document_access_audit where care_request_id = $1 and document_id = $2 and event = 'document_opened'",
        [requestA, docA.documentId]
      )
    ).toBe(1);
  });

  it("denies access when no consent exists", async () => {
    await freshScenario({ grantConsent: false });
    await actAs(clinicianA);
    const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("NO_ACTIVE_CONSENT");
  });

  it("denies access once consent is revoked — and keeps denying it", async () => {
    await freshScenario();
    await actAs(clinicianA);
    expect((await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)))).status).toBe(
      200
    );

    await db().asRole("service_role");
    await query("update document_share_consents set revoked_at = now() where care_request_id = $1", [
      requestA,
    ]);

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe("NO_ACTIVE_CONSENT");
    }
  });

  it("denies access when the consent does not cover this document", async () => {
    await freshScenario({ grantConsent: false });
    await db().asRole("service_role");
    const otherDoc = await seedDocument(patientA.userId, { name: "other.pdf" });
    await seedShareConsent({
      careRequestId: requestA,
      patientId: patientA.userId,
      documentIds: [otherDoc.documentId],
    });

    await actAs(clinicianA);
    const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("NO_ACTIVE_CONSENT");
  });

  it("denies access when the access window has expired", async () => {
    await freshScenario({ accessExpiresInMs: -1000 });
    await actAs(clinicianA);
    const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("ACCESS_EXPIRED");
  });

  it("denies access when the access grant was revoked even though it has not expired", async () => {
    await freshScenario({ grantRevokedAccess: true });
    await actAs(clinicianA);
    const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("ACCESS_EXPIRED");
  });

  it("denies an unassigned clinician", async () => {
    await freshScenario();
    await actAs(clinicianB);
    const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_ASSIGNED");
  });

  it("denies a patient outright", async () => {
    await freshScenario();
    await actAs(patientA);
    const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(res.status).toBe(403);
  });

  it("never opens a document that belongs to another patient", async () => {
    await freshScenario();
    await db().asRole("service_role");
    const docB = await seedDocument(patientB.userId, { name: "patient-b.pdf" });
    // Even if a consent row names Patient B's document on Patient A's request,
    // the join on the request's owner must reject it.
    await query("update document_share_consents set document_ids = $2::uuid[] where care_request_id = $1", [
      requestA,
      [docB.documentId],
    ]);

    await actAs(clinicianA);
    const res = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docB.documentId)));
    expect(res.status).toBe(404);
    expect(
      await countOf(
        "select count(*)::int as count from clinician_document_access_audit where document_id = $1",
        [docB.documentId]
      )
    ).toBe(0);
  });

  it("requires a session and explicit parameters", async () => {
    await freshScenario();
    await actAs(null);
    expect((await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)))).status).toBe(
      401
    );

    await actAs(clinicianA);
    expect(
      (await clinicianDocument(new Request("https://app.test/api/clinician/documents"))).status
    ).toBe(400);
  });

  it("honest limitation: a previously issued URL stays valid until it expires, and no new URL is issued after revocation", async () => {
    await freshScenario();
    await actAs(clinicianA);
    const issued = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(issued.status).toBe(200);
    const { signedUrl } = (await issued.json()) as { signedUrl: string };

    const client = appState.client;
    if (!client) throw new Error("harness not ready");
    const issuedRecords = client.signedUrls.filter((r) => r.url === signedUrl);
    expect(issuedRecords).toHaveLength(1);
    // Short-lived by construction — this is the mitigation for non-recallable URLs.
    expect(issuedRecords[0].expiresInSeconds).toBe(300);

    await db().asRole("service_role");
    await query("update document_share_consents set revoked_at = now() where care_request_id = $1", [
      requestA,
    ]);
    const before = client.signedUrls.length;

    await actAs(clinicianA);
    const after = await clinicianDocument(new Request(CLINICIAN_URL(requestA, docA.documentId)));
    expect(after.status).toBe(403);
    expect(client.signedUrls.length).toBe(before); // no new URL after revocation
  });
});

async function query(sql: string, params: unknown[] = []) {
  const database = db();
  const { rows } = await database.sql.query(sql, params);
  return rows;
}
