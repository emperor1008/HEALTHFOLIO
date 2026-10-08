// @vitest-environment node
/**
 * Phase 6 §10 — real pharmacy workflow and cross-pharmacy isolation.
 *
 *   Pharmacy A updates stock → database → patient reads the actual stock
 *   Pharmacy B must not be able to alter or read Pharmacy A's stock.
 *
 * Patient visibility is a projection: unverified pharmacies are invisible,
 * internal notes and quantity hints never leave `getPatientStockView`, and
 * freshness is server-authoritative. All of it is asserted against real rows.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  actAs,
  appState,
  countOf,
  db,
  one,
  seedPatient,
  seedPharmacy,
  seedPharmacyOperator,
  makeNextRequest,
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

import { GET as readStock, POST as updateStock } from "@/app/api/pharmacy/stock/route";
import { GET as patientLookup } from "@/app/api/pharmacy/stock/patient-lookup/route";
import { POST as requestAvailability } from "@/app/api/pharmacy/requests/route";

const MEDICINE = "medicine-amlodipine-5mg";

function stockBody(pharmacyId: string, idempotencyKey: string, overrides?: Record<string, unknown>) {
  return {
    pharmacyId,
    medicineId: MEDICINE,
    medicineLabel: "Amlodipine 5 mg",
    status: "available",
    quantityHint: 42,
    showQuantityToPatients: false,
    internalNote: "back room shelf 3",
    source: "manual_operator",
    idempotencyKey,
    ...overrides,
  };
}

describe("Phase 6 §10 — pharmacy stock workflow and isolation", () => {
  let patientA: UserFixture;
  let pharmacyA: string;
  let pharmacyB: string;
  let pendingPharmacy: string;
  let operatorA: UserFixture & { pharmacyId: string };
  let operatorB: UserFixture & { pharmacyId: string };

  beforeAll(async () => {
    await setupHarness();
    patientA = await seedPatient("p6-pharm-patient@example.test");
    pharmacyA = await seedPharmacy("Pharmacy A", "verified");
    pharmacyB = await seedPharmacy("Pharmacy B", "verified");
    pendingPharmacy = await seedPharmacy("Pending Pharmacy", "pending");
    operatorA = await seedPharmacyOperator("p6-pharm-a@example.test", pharmacyA);
    operatorB = await seedPharmacyOperator("p6-pharm-b@example.test", pharmacyB);
  }, 180_000);

  afterAll(async () => {
    await teardownHarness();
  });

  it("lets a member pharmacy publish stock, and the patient sees the real value", async () => {
    await db().asRole("service_role");
    await actAs(operatorA);

    const res = await updateStock(
      makeNextRequest("https://app.test/api/pharmacy/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stockBody(pharmacyA, crypto.randomUUID())),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; duplicate: boolean; eventId: string };
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(false);

    // The row really exists, owned by Pharmacy A and attributed to operator A.
    const row = await one<{ pharmacy_id: string; updated_by: string; status: string }>(
      "select pharmacy_id, updated_by, status from pharmacy_stock_events where id = $1",
      [body.eventId]
    );
    expect(row?.pharmacy_id).toBe(pharmacyA);
    expect(row?.updated_by).toBe(operatorA.userId);
    expect(row?.status).toBe("available");

    const audit = await countOf(
      "select count(*)::int as count from pharmacy_audit_events where pharmacy_id = $1 and event = 'stock_updated'",
      [pharmacyA]
    );
    expect(audit).toBeGreaterThanOrEqual(1);

    // The patient sees the pharmacy's actual stock — nothing more.
    await actAs(patientA);
    const lookup = await patientLookup(
      makeNextRequest(
        `https://app.test/api/pharmacy/stock/patient-lookup?medicineId=${MEDICINE}`
      )
    );
    expect(lookup.status).toBe(200);
    const view = (await lookup.json()) as {
      results: Record<string, unknown>[];
    };
    const entry = view.results.find((r) => r.pharmacyId === pharmacyA);
    expect(entry).toBeDefined();
    expect(entry?.displayStatus).toBe("available");
    expect(entry?.freshness).toBe("fresh");
    // Staff-only fields are structurally absent, not merely hidden in the UI.
    expect(JSON.stringify(view.results)).not.toContain("internalNote");
    expect(JSON.stringify(view.results)).not.toContain("internal_note");
    expect(JSON.stringify(view.results)).not.toContain("back room shelf 3");
    expect(JSON.stringify(view.results)).not.toContain("quantityHint");
  });

  it("§10 another pharmacy cannot alter Pharmacy A's stock", async () => {
    await db().asRole("service_role");
    const before = await countOf(
      "select count(*)::int as count from pharmacy_stock_events where pharmacy_id = $1",
      [pharmacyA]
    );

    await actAs(operatorB);
    const res = await updateStock(
      makeNextRequest("https://app.test/api/pharmacy/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stockBody(pharmacyA, crypto.randomUUID(), { status: "unavailable" })),
      })
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("not_a_member");
    expect(
      await countOf("select count(*)::int as count from pharmacy_stock_events where pharmacy_id = $1", [
        pharmacyA,
      ])
    ).toBe(before);
  });

  it("§10 another pharmacy cannot read Pharmacy A's stock history", async () => {
    await actAs(operatorB);
    const res = await readStock(
      makeNextRequest(`https://app.test/api/pharmacy/stock?pharmacyId=${pharmacyA}`)
    );
    expect(res.status).toBe(403);

    const own = await readStock(makeNextRequest("https://app.test/api/pharmacy/stock?pharmacyId=me"));
    expect(own.status).toBe(200);
    const body = (await own.json()) as { events: { pharmacy_id?: string }[] };
    expect(body.events).toEqual([]);
  });

  it("is idempotent on the (pharmacy, medicine, key) unique constraint", async () => {
    await db().asRole("service_role");
    await actAs(operatorA);
    const key = crypto.randomUUID();
    const first = await updateStock(
      makeNextRequest("https://app.test/api/pharmacy/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stockBody(pharmacyA, key, { status: "low_stock" })),
      })
    );
    expect(first.status).toBe(200);
    expect(((await first.json()) as { duplicate: boolean }).duplicate).toBe(false);

    const replay = await updateStock(
      makeNextRequest("https://app.test/api/pharmacy/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stockBody(pharmacyA, key, { status: "low_stock" })),
      })
    );
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { duplicate: boolean }).duplicate).toBe(true);
    expect(
      await countOf(
        "select count(*)::int as count from pharmacy_stock_events where pharmacy_id = $1 and idempotency_key = $2",
        [pharmacyA, key]
      )
    ).toBe(1);
  });

  it("rejects malformed stock payloads before they reach the database", async () => {
    await actAs(operatorA);
    const cases: unknown[] = [
      stockBody(pharmacyA, crypto.randomUUID(), { status: "plenty" }),
      stockBody(pharmacyA, crypto.randomUUID(), { quantityHint: -5 }),
      stockBody(pharmacyA, crypto.randomUUID(), { idempotencyKey: "not-a-uuid" }),
      stockBody("00000000-0000-4000-8000-000000000000", crypto.randomUUID()),
    ];
    for (const body of cases) {
      const res = await updateStock(
        makeNextRequest("https://app.test/api/pharmacy/stock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      expect([400, 403]).toContain(res.status);
    }

    const malformed = await updateStock(
      makeNextRequest("https://app.test/api/pharmacy/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      })
    );
    expect(malformed.status).toBe(400);
  });

  it("never exposes an unverified pharmacy to patients", async () => {
    await db().asRole("service_role");
    // Give the pending pharmacy stock through a direct row (its operator has no
    // membership yet) — the patient projection must still hide it.
    const pending = await seedPharmacyOperator("p6-pending-op@example.test", pendingPharmacy);
    await actAs(pending);
    const res = await updateStock(
      makeNextRequest("https://app.test/api/pharmacy/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stockBody(pendingPharmacy, crypto.randomUUID(), { status: "available" })),
      })
    );
    expect(res.status).toBe(200);

    await actAs(patientA);
    const lookup = await patientLookup(
      makeNextRequest(
        `https://app.test/api/pharmacy/stock/patient-lookup?medicineId=${MEDICINE}`
      )
    );
    const view = (await lookup.json()) as { results: { pharmacyId: string }[] };
    expect(view.results.map((r) => r.pharmacyId)).not.toContain(pendingPharmacy);
  });

  it("lets a patient request availability only from a verified pharmacy", async () => {
    await actAs(patientA);
    const okRes = await requestAvailability(
      makeNextRequest("https://app.test/api/pharmacy/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pharmacyId: pharmacyA,
          medicineId: MEDICINE,
          medicineLabel: "Amlodipine 5 mg",
          idempotencyKey: crypto.randomUUID(),
        }),
      })
    );
    expect(okRes.status).toBe(200);
    const okBody = (await okRes.json()) as { ok: boolean; requestId: string };
    expect(okBody.ok).toBe(true);

    const pendingRes = await requestAvailability(
      makeNextRequest("https://app.test/api/pharmacy/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pharmacyId: pendingPharmacy,
          medicineId: MEDICINE,
          medicineLabel: "Amlodipine 5 mg",
          idempotencyKey: crypto.randomUUID(),
        }),
      })
    );
    expect(pendingRes.status).toBe(404);
  });

  it("is idempotent for patient availability requests, and scoped to the patient", async () => {
    await actAs(patientA);
    const key = crypto.randomUUID();
    const body = {
      pharmacyId: pharmacyA,
      medicineId: MEDICINE,
      medicineLabel: "Amlodipine 5 mg",
      idempotencyKey: key,
    };
    const first = await requestAvailability(
      makeNextRequest("https://app.test/api/pharmacy/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    expect(first.status).toBe(200);
    const replay = await requestAvailability(
      makeNextRequest("https://app.test/api/pharmacy/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { duplicate: boolean }).duplicate).toBe(true);
    expect(
      await countOf(
        "select count(*)::int as count from pharmacy_availability_requests where patient_id = $1 and idempotency_key = $2",
        [patientA.userId, key]
      )
    ).toBe(1);
  });

  it("a patient is not a pharmacy member and cannot mutate stock", async () => {
    await actAs(patientA);
    const res = await updateStock(
      makeNextRequest("https://app.test/api/pharmacy/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stockBody(pharmacyA, crypto.randomUUID())),
      })
    );
    expect(res.status).toBe(403);
  });

  it("requires authentication for stock reads and writes", async () => {
    await actAs(null);
    expect(
      (
        await updateStock(
          makeNextRequest("https://app.test/api/pharmacy/stock", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(stockBody(pharmacyA, crypto.randomUUID())),
          })
        )
      ).status
    ).toBe(401);
    expect((await readStock(makeNextRequest("https://app.test/api/pharmacy/stock"))).status).toBe(401);
  });
});
