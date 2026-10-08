/**
 * GET /api/consultations/[id] — the authorized consultation session detail.
 *
 * This is the security seam for live consultation:
 *   1. Better Auth session must exist (401 otherwise).
 *   2. The caller must be the patient owner OR the assigned clinician
 *      (403 otherwise — never a distinguishable "exists but forbidden"
 *      leak beyond the participant check).
 *   3. Only in a joinable state (appointment_confirmed | in_consultation)
 *      is the room capability issued: a server-generated `room_id` (minted
 *      once, persisted) is disclosed as the Realtime channel name, together
 *      with a server-minted participant id. Nothing else about the room is
 *      ever disclosed to non-participants.
 *
 * No medical records, tokens, or SDP are ever returned here.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConsultationSession } from "@/lib/consultation/types";

export const dynamic = "force-dynamic";

const JOINABLE_STATES = new Set(["appointment_confirmed", "in_consultation"]);

interface AppointmentRow {
  id: string;
  patient_id: string;
  clinician_id: string;
  state: string;
  mode: string;
  room_id: string | null;
  care_request_id: string | null;
  proposed_starts_at: string | null;
  confirmed_starts_at: string | null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const appointmentId = (await params).id;
  const admin = await createAdminClient();

  const { data: appointment } = await admin
    .from("care_appointments")
    .select(
      "id, patient_id, clinician_id, state, mode, room_id, care_request_id, proposed_starts_at, confirmed_starts_at"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  const row = appointment as unknown as AppointmentRow;

  // ── Role resolution (server-side, never from client input) ──────────────
  let role: ConsultationSession["role"] | null = null;
  if (row.patient_id === user.id) {
    role = "patient";
  } else {
    const { data: profile } = await admin
      .from("clinician_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile && profile.id === row.clinician_id) role = "clinician";
  }
  if (!role) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  // ── Room capability: minted once, only in a joinable state ──────────────
  const joinable = JOINABLE_STATES.has(row.state);
  let roomId: string | null = row.room_id;
  if (joinable && !roomId) {
    roomId = crypto.randomUUID();
    await admin.from("care_appointments").update({ room_id: roomId }).eq("id", row.id);
  }

  // ── Authorized context (reason snippet only; no medical records) ────────
  let reason: string | null = null;
  let triageCategory: string | null = null;
  if (row.care_request_id) {
    const { data: careRequest } = await admin
      .from("care_requests")
      .select("reason, triage_category")
      .eq("id", row.care_request_id)
      .maybeSingle();
    if (careRequest) {
      reason = careRequest.reason ? String(careRequest.reason).slice(0, 300) : null;
      triageCategory = (careRequest.triage_category as string | null) ?? null;
    }
  }

  const session: ConsultationSession = {
    id: row.id,
    role,
    state: row.state,
    mode: row.mode === "audio" || row.mode === "video" ? row.mode : "text",
    careRequestId: row.care_request_id,
    proposedStartsAt: row.proposed_starts_at,
    confirmedStartsAt: row.confirmed_starts_at,
    roomChannel: joinable && roomId ? `consultation:${roomId}` : null,
    participantId: crypto.randomUUID(),
    reason,
    triageCategory,
  };

  return NextResponse.json({ session });
}
