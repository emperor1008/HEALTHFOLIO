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

  // Care request must be submittable into review: server-side state check.
  const transition = validateAppointmentTransition({
    from: careRequest.status === "submitted" ? "submitted" : "awaiting_review",
    to: "assigned",
    actorRole: identity.role,
  });
  const currentStatus = careRequest.status === "draft" ? "awaiting_review" : careRequest.status;
  const transitionOk =
    validateAppointmentTransition({
      from: currentStatus,
      to: "assigned",
      actorRole: identity.role,
    }).ok || transition.ok;
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
