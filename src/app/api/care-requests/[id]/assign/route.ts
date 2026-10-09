/**
 * POST /api/care-requests/[id]/assign — clinician or coordinator assigns a
 * care request to a clinician. Server-side role + state validation,
 * idempotent, audited. Patients can never call this.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffIdentity, STAFF_ROLE_ERROR } from "@/lib/staff/roles";
import { validateAppointmentTransition } from "@/lib/appointments/state-machine";

export const dynamic = "force-dynamic";

const AssignSchema = z.object({
  clinician_profile_id: z.string().uuid(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const identity = await getStaffIdentity(user.id);
  if (!identity) {
    return NextResponse.json(STAFF_ROLE_ERROR, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const requestId = (await params).id;

  const { data: careRequest } = await admin
    .from("care_requests")
    .select("id, user_id, status, triage_category")
    .eq("id", requestId)
    .maybeSingle();
  if (!careRequest) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (careRequest.triage_category === "emergency") {
    return NextResponse.json({ code: "EMERGENCY_NOT_ROUTABLE" }, { status: 409 });
  }

  // Coordinators are scoped to their own facility's clinicians.
  if (identity.role === "coordinator") {
    const { data: targetProfile } = await admin
      .from("clinician_profiles")
      .select("facility_id")
      .eq("id", parsed.data.clinician_profile_id)
      .maybeSingle();
    if (!targetProfile || targetProfile.facility_id !== identity.facilityId) {
      return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
    }
  }

  // ── Clinician eligibility (routing is only valid against CURRENT state) ──
  // An assignment made against a clinician who is offline, or who already
  // holds `max_active_requests` active assignments, is a stale assignment:
  // nobody will act on it. Rejecting it here is what keeps the queue honest.
  const { data: targetProfile } = await admin
    .from("clinician_profiles")
    .select("id, availability_state, max_active_requests")
    .eq("id", parsed.data.clinician_profile_id)
    .maybeSingle();
  if (!targetProfile) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (targetProfile.availability_state !== "available") {
    return NextResponse.json(
      { code: "CLINICIAN_OFFLINE", availability: targetProfile.availability_state },
      { status: 409 }
    );
  }

  const { data: activeForTarget } = await admin
    .from("care_request_assignments")
    .select("id, care_request_id")
    .eq("clinician_id", parsed.data.clinician_profile_id)
    .in("state", ["assigned", "accepted"]);
  const activeCount = (activeForTarget ?? []).filter(
    // The request being assigned twice is an idempotent replay, not capacity.
    (row: { care_request_id: string }) => row.care_request_id !== requestId
  ).length;
  const capacity =
    typeof targetProfile.max_active_requests === "number"
      ? targetProfile.max_active_requests
      : 5;
  if (activeCount >= capacity) {
    return NextResponse.json(
      { code: "CLINICIAN_AT_CAPACITY", activeCount, capacity },
      { status: 409 }
    );
  }

  // Care request must be submittable into review: server-side state check.
  //
  // Documented lifecycle: draft → queued_offline → submitted → awaiting_review
  // → assigned. `care_requests.status` is the coarse field (CHECK: draft |
  // submitted | processing | completed) while the fine-grained lifecycle lives
  // on care_appointments.state, so what matters here is that BOTH hops of the
  // documented path are permitted for this actor:
  //   - a request the patient has already sent (`submitted`) must pass
  //     submitted → awaiting_review ([S, K, C]);
  //   - then awaiting_review → assigned ([C, K]).
  // A request in `draft`/`queued_offline` is routed as part of sending it.
  const { status } = careRequest;
  const REVIEWABLE = ["draft", "queued_offline", "submitted", "awaiting_review"];
  const arrivalOk =
    status === "submitted"
      ? validateAppointmentTransition({
          from: "submitted",
          to: "awaiting_review",
          actorRole: identity.role,
        }).ok
      : REVIEWABLE.includes(status);
  const transitionOk =
    arrivalOk &&
    validateAppointmentTransition({
      from: "awaiting_review",
      to: "assigned",
      actorRole: identity.role,
    }).ok;
  if (!transitionOk) {
    return NextResponse.json({ code: "INVALID_STATE" }, { status: 409 });
  }

  // Idempotency: an existing active assignment to the same clinician is a no-op.
  const { data: existing } = await admin
    .from("care_request_assignments")
    .select("id, clinician_id, state")
    .eq("care_request_id", requestId)
    .in("state", ["assigned", "accepted"])
    .maybeSingle();
  if (existing && existing.clinician_id === parsed.data.clinician_profile_id) {
    return NextResponse.json({ code: "ASSIGNED", assignment: existing }, { status: 200 });
  }
  if (existing) {
    return NextResponse.json({ code: "ALREADY_ASSIGNED" }, { status: 409 });
  }

  const { data: assignment, error } = await admin
    .from("care_request_assignments")
    .insert({
      care_request_id: requestId,
      clinician_id: parsed.data.clinician_profile_id,
      facility_id: identity.facilityId,
      state: "assigned",
      assigned_by: user.id,
    })
    .select("id, clinician_id, state")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ code: "ALREADY_ASSIGNED" }, { status: 409 });
    }
    return NextResponse.json({ code: "ASSIGN_FAILED" }, { status: 500 });
  }

  // Move the appointment (creating if needed) into `assigned`.
  await admin.from("care_appointments").upsert(
    {
      care_request_id: requestId,
      clinician_id: parsed.data.clinician_profile_id,
      patient_id: careRequest.user_id,
      mode: "text",
      state: "assigned",
    },
    { onConflict: "care_request_id" }
  );

  return NextResponse.json({ code: "ASSIGNED", assignment }, { status: 201 });
}
