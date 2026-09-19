/**
 * POST /api/appointments — the assigned clinician proposes an appointment
 * (state → appointment_proposed) on an accepted care request.
 * GET /api/appointments — patient lists their own appointments.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffIdentity, STAFF_ROLE_ERROR } from "@/lib/staff/roles";

export const dynamic = "force-dynamic";

const ProposeSchema = z.object({
  care_request_id: z.string().uuid(),
  mode: z.enum(["text", "audio", "video"]),
  starts_at: z.string().datetime(),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const identity = await getStaffIdentity(user.id);
  if (!identity || identity.role !== "clinician") {
    return NextResponse.json(STAFF_ROLE_ERROR, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = ProposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = createAdminClient();

  // The clinician must hold an accepted assignment for this request.
  const { data: assignment } = await admin
    .from("care_request_assignments")
    .select("id, clinician_id, state")
    .eq("care_request_id", parsed.data.care_request_id)
    .in("state", ["assigned", "accepted"])
    .maybeSingle();
  const { data: profile } = await admin
    .from("clinician_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!assignment || !profile || profile.id !== assignment.clinician_id) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const { data: careRequest } = await admin
    .from("care_requests")
    .select("id, user_id")
    .eq("id", parsed.data.care_request_id)
    .maybeSingle();
  if (!careRequest) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: appointment, error } = await admin
    .from("care_appointments")
    .upsert(
      {
        care_request_id: parsed.data.care_request_id,
        clinician_id: profile.id,
        patient_id: careRequest.user_id,
        mode: parsed.data.mode,
        proposed_starts_at: parsed.data.starts_at,
        state: "appointment_proposed",
      },
      { onConflict: "care_request_id" }
    )
    .select("id, state, mode, proposed_starts_at")
    .single();

  if (error) {
    return NextResponse.json({ code: "PROPOSE_FAILED" }, { status: 500 });
  }

  try {
    await admin.from("appointment_status_events").insert({
      appointment_id: appointment.id,
      actor_id: user.id,
      prev_state: "accepted",
      next_state: "appointment_proposed",
      metadata: { mode: parsed.data.mode },
    });
  } catch {
    // audit best-effort
  }
  void now;

  return NextResponse.json({ code: "PROPOSED", appointment }, { status: 201 });
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("care_appointments")
    .select("id, care_request_id, state, mode, proposed_starts_at, confirmed_starts_at, updated_at")
    .eq("patient_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ code: "LIST_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ appointments: data ?? [] });
}
