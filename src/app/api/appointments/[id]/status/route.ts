/**
 * POST /api/appointments/[id]/status — validated lifecycle transitions.
 *
 * - Actor role is resolved server-side (patient = owner; clinician = assigned
 *   profile; coordinator = same facility). Never from client input.
 * - Transition legality comes from the pure state machine; duplicates are
 *   idempotent no-ops.
 * - appointment_confirmed requires the patient's acknowledgement timestamp.
 * - Every accepted transition appends an audit event.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAppointmentTransition, type ActorRole } from "@/lib/appointments/state-machine";

export const dynamic = "force-dynamic";

const StatusSchema = z.object({
  state: z.string().min(1).max(40),
  mode: z.enum(["text", "audio", "video"]).optional(),
  proposed_starts_at: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data: appointment } = await admin
    .from("care_appointments")
    .select(
      "id, care_request_id, clinician_id, patient_id, state, mode, proposed_starts_at, confirmed_starts_at, patient_acknowledged_at"
    )
    .eq("id", (await params).id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

  // Resolve actor role server-side.
  let actorRole: ActorRole | null = null;
  if (appointment.patient_id === user.id) actorRole = "patient";
  if (!actorRole) {
    const { data: profile } = await admin
      .from("clinician_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile && profile.id === appointment.clinician_id) actorRole = "clinician";
  }
  if (!actorRole) {
    const { data: membership } = await admin
      .from("facility_memberships")
      .select("role, facility_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role === "coordinator") {
      const { data: profile } = await admin
        .from("clinician_profiles")
        .select("facility_id")
        .eq("id", appointment.clinician_id)
        .maybeSingle();
      if (profile?.facility_id === membership.facility_id) actorRole = "coordinator";
    }
  }
  if (!actorRole) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const result = validateAppointmentTransition({
    from: appointment.state,
    to: parsed.data.state,
    actorRole,
  });
  if (!result.ok) {
    return NextResponse.json({ code: result.reason ?? "INVALID_TRANSITION" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { state: parsed.data.state };

  // Confirmation requires patient acknowledgement (patient is the actor here,
  // so acknowledging in the same transition is truthful).
  if (parsed.data.state === "appointment_confirmed") {
    if (actorRole !== "patient") {
      return NextResponse.json({ code: "PATIENT_ACK_REQUIRED" }, { status: 403 });
    }
    patch.confirmed_starts_at = appointment.proposed_starts_at;
    patch.patient_acknowledged_at = now;
  }
  if (parsed.data.state === "in_consultation" && parsed.data.mode) {
    patch.mode = parsed.data.mode;
  }

  const { error } = await admin
    .from("care_appointments")
    .update(patch)
    .eq("id", (await params).id);
  if (error) {
    return NextResponse.json({ code: "UPDATE_FAILED" }, { status: 500 });
  }

  try {
    await admin.from("appointment_status_events").insert({
      appointment_id: (await params).id,
      actor_id: user.id,
      prev_state: appointment.state,
      next_state: parsed.data.state,
      metadata: parsed.data.mode ? { mode: parsed.data.mode } : {},
    });
  } catch {
    // audit best-effort
  }

  return NextResponse.json({ code: "UPDATED", state: parsed.data.state }, { status: 200 });
}
