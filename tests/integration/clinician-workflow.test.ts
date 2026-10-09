// @vitest-environment node
/**
 * Phase 6 §9 / §12 / §13 — real doctor workflow, isolation, and concurrency.
 *
 *   Patient A → request → Clinician A sees it → accepts → Patient A sees status
 *   Patient B must not see Patient A's request.
 *
 * The concurrency cases are the interesting ones:
 *   - two simultaneous assignments of the same request (one must lose);
 *   - assignment of a clinician who is OFFLINE (a stale assignment);
 *   - assignment of a clinician already at `max_active_requests`.
 *
 * All of it runs against the real schema, where the unique constraint
 * `assignments_one_active_per_request` is the last line of defence.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  actAs,
  appState,
  countOf,
  db,
  one,
  query,
  routeParams,
  seedCareRequest,
  seedClinician,
  seedCoordinator,
  seedFacility,
  seedPatient,
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

import { POST as assign } from "@/app/api/care-requests/[id]/assign/route";
import { POST as accept } from "@/app/api/care-requests/[id]/accept/route";
import { GET as clinicianQueue } from "@/app/api/clinician/care-requests/route";
import { GET as listCareRequests } from "@/app/api/care-requests/route";

describe("Phase 6 §9/§13 — doctor workflow, isolation, concurrency", () => {
  let patientA: UserFixture;
  let patientB: UserFixture;
  let clinicianA: ClinicianFixture;
  let clinicianB: ClinicianFixture;
  let facility: string;
  let requestA: string;

  beforeAll(async () => {
    await setupHarness();
    facility = await seedFacility("Phase 6 Care Hub");
    patientA = await seedPatient("p6-patient-a@example.test");
    patientB = await seedPatient("p6-patient-b@example.test");
    clinicianA = await seedClinician({ email: "p6-clin-a@example.test", facilityId: facility });
    clinicianB = await seedClinician({ email: "p6-clin-b@example.test", facilityId: facility });
    requestA = await seedCareRequest(patientA.userId, { reason: "Persistent cough" });
    // Plenty of headroom, so only the explicit capacity test hits the limit.
    await query("update clinician_profiles set max_active_requests = 50");
  }, 180_000);

  afterAll(async () => {
    await teardownHarness();
  });

  /**
   * Fresh request per test, with the previous assignments released so neither
   * assignment state nor capacity carries over between tests.
   */
  async function freshRequest(reason = "Follow-up review"): Promise<string> {
    await db().asRole("service_role");
    await query(
      "update care_request_assignments set state = 'released' where clinician_id in ($1, $2) and state in ('assigned','accepted')",
      [clinicianA.profileId, clinicianB.profileId]
    );
    return seedCareRequest(patientA.userId, { reason });
  }

  function assignRequest(requestId: string, clinicianProfileId: string) {
    return assign(
      new Request(`https://app.test/api/care-requests/${requestId}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clinician_profile_id: clinicianProfileId }),
      }),
      routeParams({ id: requestId })
    );
  }

  function acceptRequest(requestId: string, action: "accept" | "decline" = "accept") {
    return accept(
      new Request(`https://app.test/api/care-requests/${requestId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(action === "decline" ? { reason_category: "not_available" } : {}) }),
      }),
      routeParams({ id: requestId })
    );
  }

  it("walks the full happy path: request → assigned → accepted → patient sees it", async () => {
    const requestId = await freshRequest();

    await actAs(clinicianA);
    const listBefore = await clinicianQueue();
    const before = (await listBefore.json()) as {
      available: { careRequestId: string }[];
    };
    expect(before.available.map((r) => r.careRequestId)).toContain(requestId);

    const assigned = await assignRequest(requestId, clinicianA.profileId);
    expect(assigned.status).toBe(201);

    const accepted = await acceptRequest(requestId, "accept");
    expect(accepted.status).toBe(200);
    const body = (await accepted.json()) as { code: string; assignment: { state: string } };
    expect(body.assignment.state).toBe("accepted");

    // The patient's own view reflects server state (their request is now busy,
    // so it no longer appears as an unassigned candidate for any clinician).
    await actAs(patientA);
    const patientView = await listCareRequests(
      new Request("https://app.test/api/care-requests")
    );
    const listed = (await patientView.json()) as { careRequests: { id: string }[] };
    expect(listed.careRequests.map((r) => r.id)).toContain(requestId);

    const appointment = await one<{ state: string; patient_id: string }>(
      "select state, patient_id from care_appointments where care_request_id = $1",
      [requestId]
    );
    expect(appointment?.state).toBe("accepted");
    expect(appointment?.patient_id).toBe(patientA.userId);

    const queued = await clinicianQueueFor(clinicianA);
    expect(queued.available.map((r) => r.careRequestId)).not.toContain(requestId);
    expect(queued.assigned.map((r) => r.careRequestId)).toContain(requestId);
  });

  it("is idempotent: assigning the same clinician twice keeps exactly one assignment", async () => {
    const requestId = await freshRequest();
    await actAs(clinicianA);
    expect((await assignRequest(requestId, clinicianA.profileId)).status).toBe(201);
    const replay = await assignRequest(requestId, clinicianA.profileId);
    expect([200, 409]).toContain(replay.status);
    expect(
      await countOf("select count(*)::int as count from care_request_assignments where care_request_id = $1", [
        requestId,
      ])
    ).toBe(1);
  });

  it("refuses a second, different clinician on the same request", async () => {
    const requestId = await freshRequest();
    await actAs(clinicianA);
    expect((await assignRequest(requestId, clinicianA.profileId)).status).toBe(201);

    await actAs(clinicianB);
    const conflict = await assignRequest(requestId, clinicianB.profileId);
    expect(conflict.status).toBe(409);
    const body = (await conflict.json()) as { code: string };
    expect(body.code).toBe("ALREADY_ASSIGNED");
    expect(
      await countOf(
        "select count(*)::int as count from care_request_assignments where care_request_id = $1 and state in ('assigned','accepted')",
        [requestId]
      )
    ).toBe(1);
  });

  it("§13 concurrency: simultaneous assignments produce exactly one row", async () => {
    const requestId = await freshRequest("Concurrent request");
    await actAs(clinicianA);
    const [first, second] = await Promise.all([
      assignRequest(requestId, clinicianA.profileId),
      assignRequest(requestId, clinicianA.profileId),
    ]);
    // Either both report success (idempotent replay) or one loses with 409 —
    // but the database must never hold two active assignments.
    expect([first.status, second.status].every((s) => [200, 201, 409].includes(s))).toBe(true);
    expect(
      await countOf(
        "select count(*)::int as count from care_request_assignments where care_request_id = $1 and state in ('assigned','accepted')",
        [requestId]
      )
    ).toBe(1);
  });

  it("§13 rejects the database-level double assignment (unique constraint is the last line)", async () => {
    const requestId = await freshRequest("Constraint request");
    await db().asRole("service_role");
    await query(
      `insert into care_request_assignments (care_request_id, clinician_id, state, assigned_by)
       values ($1, $2, 'assigned', $3)`,
      [requestId, clinicianA.profileId, clinicianA.userId]
    );
    await expect(
      query(
        `insert into care_request_assignments (care_request_id, clinician_id, state, assigned_by)
         values ($1, $2, 'assigned', $3)`,
        [requestId, clinicianA.profileId, clinicianA.userId]
      )
    ).rejects.toThrow(/assignments_one_active_per_request|duplicate key/);
  });

  it("§13 refuses to assign a clinician who is offline (stale assignment)", async () => {
    const requestId = await freshRequest("Offline clinician request");
    await db().asRole("service_role");
    await query("update clinician_profiles set availability_state = 'offline' where id = $1", [
      clinicianA.profileId,
    ]);
    try {
      await actAs(clinicianB);
      const res = await assignRequest(requestId, clinicianA.profileId);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("CLINICIAN_OFFLINE");
      expect(
        await countOf("select count(*)::int as count from care_request_assignments where care_request_id = $1", [
          requestId,
        ])
      ).toBe(0);
    } finally {
      await db().asRole("service_role");
      await query("update clinician_profiles set availability_state = 'available' where id = $1", [
        clinicianA.profileId,
      ]);
    }
  });

  it("§13 refuses to assign past the clinician's max_active_requests capacity", async () => {
    // Both requests FIRST (freshRequest releases prior assignments), then the
    // capacity limit — otherwise the reset would erase the assignment being
    // counted.
    const first = await freshRequest("Capacity 1");
    await db().asRole("service_role");
    const second = await seedCareRequest(patientA.userId, { reason: "Capacity 2" });
    await query("update clinician_profiles set max_active_requests = 1 where id = $1", [
      clinicianA.profileId,
    ]);
    try {
      await actAs(clinicianA);
      expect((await assignRequest(first, clinicianA.profileId)).status).toBe(201);

      const res = await assignRequest(second, clinicianA.profileId);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("CLINICIAN_AT_CAPACITY");
      expect(
        await countOf("select count(*)::int as count from care_request_assignments where care_request_id = $1", [
          second,
        ])
      ).toBe(0);
    } finally {
      await db().asRole("service_role");
      await query("update clinician_profiles set max_active_requests = 50 where id = $1", [
        clinicianA.profileId,
      ]);
    }
  });

  it("refuses to route an emergency request to a clinician", async () => {
    await db().asRole("service_role");
    const emergency = await seedCareRequest(patientA.userId, {
      reason: "Chest pain",
      triageCategory: "emergency",
    });
    await actAs(clinicianA);
    const res = await assignRequest(emergency, clinicianA.profileId);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("EMERGENCY_NOT_ROUTABLE");
  });

  it("only the assigned clinician may accept or decline", async () => {
    const requestId = await freshRequest("Accept authorization");
    await actAs(clinicianA);
    expect((await assignRequest(requestId, clinicianA.profileId)).status).toBe(201);

    await actAs(clinicianB);
    const forbidden = await acceptRequest(requestId, "accept");
    expect(forbidden.status).toBe(403);
    expect(
      await one<{ state: string }>("select state from care_request_assignments where care_request_id = $1", [
        requestId,
      ]).then((r) => r?.state)
    ).toBe("assigned");
  });

  it("decline requires a reason category and records it", async () => {
    const requestId = await freshRequest("Decline request");
    await actAs(clinicianA);
    await assignRequest(requestId, clinicianA.profileId);

    const missingReason = await accept(
      new Request(`https://app.test/api/care-requests/${requestId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "decline" }),
      }),
      routeParams({ id: requestId })
    );
    expect(missingReason.status).toBe(400);

    const declined = await acceptRequest(requestId, "decline");
    expect(declined.status).toBe(200);
    const row = await one<{ state: string; reason_category: string }>(
      "select state, reason_category from care_request_assignments where care_request_id = $1",
      [requestId]
    );
    expect(row?.state).toBe("declined");
    expect(row?.reason_category).toBe("not_available");
  });

  it("a patient cannot use the staff routes at all", async () => {
    await actAs(patientB);
    const queue = await clinicianQueue();
    expect(queue.status).toBe(403);

    const res = await assignRequest(requestA, clinicianA.profileId);
    expect(res.status).toBe(403);

    const acceptRes = await acceptRequest(requestA, "accept");
    expect(acceptRes.status).toBe(403);
  });

  it("§5 Patient B never sees Patient A's request through any patient surface", async () => {
    await actAs(patientB);
    const res = await listCareRequests(new Request("https://app.test/api/care-requests"));
    const body = (await res.json()) as { careRequests: { id: string }[] };
    expect(body.careRequests.map((r) => r.id)).not.toContain(requestA);

    const [own] = await query<{ count: number }>(
      "select count(*)::int as count from care_requests where user_id = $1 and id = $2",
      [patientB.userId, requestA]
    );
    expect(own.count).toBe(0);
  });

  it("loses staff capability immediately when the registry row is suspended", async () => {
    const suspended = await seedClinician({
      email: "p6-suspended@example.test",
      facilityId: facility,
    });
    await db().asRole("service_role");
    await query("update user_roles set status = 'suspended' where user_id = $1 and role = 'clinician'", [
      suspended.userId,
    ]);
    await actAs(suspended);
    const res = await clinicianQueue();
    expect(res.status).toBe(403);
  });

  it("scopes a coordinator to their own facility's clinicians", async () => {
    const otherFacility = await seedFacility("Other Care Hub");
    const otherClinician = await seedClinician({
      email: "p6-other-clin@example.test",
      facilityId: otherFacility,
    });
    const coordinator = await seedCoordinator("p6-coord@example.test", facility);

    const requestId = await freshRequest("Coordinator scoping");
    await actAs(coordinator);
    const forbidden = await assignRequest(requestId, otherClinician.profileId);
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as { code: string }).code).toBe("FORBIDDEN");

    const allowed = await assignRequest(requestId, clinicianB.profileId);
    expect(allowed.status).toBe(201);
  });

  it("cannot assign a request that does not exist", async () => {
    await actAs(clinicianA);
    const res = await assignRequest("00000000-0000-4000-8000-000000000000", clinicianA.profileId);
    expect(res.status).toBe(404);
  });

  it("requires authentication on every staff route", async () => {
    await actAs(null);
    expect((await clinicianQueue()).status).toBe(401);
    expect((await assignRequest(requestA, clinicianA.profileId)).status).toBe(401);
    expect((await acceptRequest(requestA, "accept")).status).toBe(401);
  });
});

async function clinicianQueueFor(clinician: ClinicianFixture) {
  await actAs(clinician);
  const res = await clinicianQueue();
  return (await res.json()) as {
    assigned: { careRequestId: string }[];
    available: { careRequestId: string }[];
  };
}
