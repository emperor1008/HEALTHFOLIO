/**
 * Consultation signalling (Part 3).
 *
 * HONEST LIMITATION: this deployment has no TURN/STUN infrastructure and no
 * Supabase Realtime credentials configured. WebRTC media cannot be guaranteed
 * without TURN, so this endpoint exists as the authorization-checked seam for
 * a future realtime deployment, and the client lobby treats
 * text/store-and-forward as the dependable path. It never issues media
 * credentials (no ICE secrets in browser code) and never fabricates a
 * connection state.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SignalSchema = z.object({
  event: z.enum(["join", "leave", "degraded_to_audio", "degraded_to_text"]),
  detail: z.string().max(200).optional(),
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
  const parsed = SignalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data: appointment } = await admin
    .from("care_appointments")
    .select("id, patient_id, clinician_id, state, room_id")
    .eq("id", (await params).id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

  const isPatient = appointment.patient_id === user.id;
  let isClinician = false;
  if (!isPatient) {
    const { data: profile } = await admin
      .from("clinician_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    isClinician = Boolean(profile && profile.id === appointment.clinician_id);
  }
  if (!isPatient && !isClinician) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  // A room exists only for confirmed appointments.
  if (appointment.state !== "appointment_confirmed") {
    return NextResponse.json({ code: "ROOM_NOT_AVAILABLE" }, { status: 409 });
  }

  // Audit the signalling event (redacted metadata only).
  try {
    await admin.from("consultation_audit_events").insert({
      appointment_id: (await params).id,
      actor_id: user.id,
      event: `signal:${parsed.data.event}`,
      metadata: parsed.data.detail ? { detail: parsed.data.detail.slice(0, 200) } : {},
    });
  } catch {
    // audit best-effort
  }

  return NextResponse.json(
    {
      code: "SIGNALLED",
      // Realtime media infrastructure is not configured in this deployment.
      realtimeAvailable: false,
    },
    { status: 200 }
  );
}
