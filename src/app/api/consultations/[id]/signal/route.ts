/**
 * Consultation signalling seam (Phase 1).
 *
 * Client → server technical events for ONE consultation session. This route
 * does two things and nothing more:
 *   1. Authorization: Better Auth session + patient/assigned-clinician check
 *      + joinable appointment state. It never issues media credentials and
 *      never accepts SDP/ICE (peer signalling rides Supabase Realtime; media
 *      rides WebRTC directly between browsers).
 *   2. Audit + privacy-safe metrics: each event is appended to
 *      consultation_audit_events (redacted metadata only) and the important
 *      ones feed the reliability_metrics closed vocabulary.
 *
 * Inbound payloads are Zod-validated; unknown events are rejected (400), and
 * free-form `detail` is bounded and stored only as a short audit note.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordMetric } from "@/lib/metrics/service";

export const dynamic = "force-dynamic";

const SignalSchema = z.object({
  event: z.enum([
    // Existing (kept for compatibility)
    "join",
    "leave",
    "degraded_to_audio",
    "degraded_to_text",
    // Phase 1 technical events
    "connected",
    "mode_video",
    "mode_audio",
    "mode_text",
    "degraded_quality",
    "reconnection_started",
    "reconnection_succeeded",
    "reconnection_failed",
    "offline_fallback",
  ]),
  detail: z.string().max(200).optional(),
  /** Media mode for events where it is meaningful. */
  mode: z.enum(["video", "audio", "text"]).optional(),
  /** Participant role for completion accounting. */
  role: z.enum(["patient", "clinician"]).optional(),
});

const JOINABLE_STATES = new Set(["appointment_confirmed", "in_consultation"]);

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
  const { event, mode, role } = parsed.data;

  const admin = await createAdminClient();
  const appointmentId = (await params).id;
  const { data: appointment } = await admin
    .from("care_appointments")
    .select("id, patient_id, clinician_id, state, mode")
    .eq("id", appointmentId)
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

  // A live room exists only for confirmed/in-consultation appointments.
  if (!JOINABLE_STATES.has(appointment.state)) {
    return NextResponse.json({ code: "ROOM_NOT_AVAILABLE" }, { status: 409 });
  }

  // Audit the signalling event (redacted metadata only — no SDP, no text
  // content beyond a bounded developer note).
  try {
    await admin.from("consultation_audit_events").insert({
      appointment_id: appointmentId,
      actor_id: user.id,
      event: `signal:${event}`,
      metadata: parsed.data.detail ? { detail: parsed.data.detail.slice(0, 200) } : {},
    });
  } catch {
    // audit best-effort
  }

  // ── Privacy-safe metrics (closed vocabulary; no identifiers) ────────────
  const actorRole = isPatient ? "patient" : "clinician";
  switch (event) {
    case "join":
      await recordMetric({ event: "consultation_started", metadata: {} });
      break;
    case "connected":
      await recordMetric({
        event: "consultation_connected",
        metadata: { mode: mode === "video" ? "video" : "audio" },
      });
      break;
    case "mode_video":
    case "mode_audio":
    case "mode_text":
      await recordMetric({
        event: "connection_mode",
        metadata: { mode: mode ?? event.replace("mode_", "") as "video" | "audio" | "text" },
      });
      break;
    case "degraded_quality":
      await recordMetric({ event: "consultation_degradation", metadata: {} });
      break;
    case "degraded_to_audio":
      await recordMetric({ event: "consultation_audio_fallback", metadata: {} });
      await recordMetric({ event: "consultation_fallback_used", metadata: { fallback: "audio" } });
      break;
    case "degraded_to_text":
    case "offline_fallback":
      if (event === "offline_fallback") {
        await recordMetric({ event: "consultation_offline_fallback", metadata: {} });
      }
      await recordMetric({ event: "consultation_fallback_used", metadata: { fallback: "text" } });
      break;
    case "reconnection_started":
    case "reconnection_succeeded":
    case "reconnection_failed":
      await recordMetric({
        event: "consultation_reconnection",
        metadata: {
          outcome:
            event === "reconnection_started"
              ? "started"
              : event === "reconnection_succeeded"
                ? "success"
                : "failed",
        },
      });
      break;
    case "leave":
      await recordMetric({
        event: "consultation_completed",
        metadata: { role: role ?? actorRole },
      });
      break;
  }

  const realtimeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().toLowerCase() ?? "";
  const realtimeKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const realtimeConfigured =
    realtimeUrl.startsWith("http") &&
    !realtimeUrl.includes("paste_your") &&
    realtimeKey.length > 20 &&
    !realtimeKey.toLowerCase().includes("paste_your");

  return NextResponse.json(
    { code: "SIGNALLED", realtimeAvailable: realtimeConfigured },
    { status: 200 }
  );
}
