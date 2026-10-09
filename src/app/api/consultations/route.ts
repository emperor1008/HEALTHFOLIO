/**
 * GET /api/consultations — list the consultation sessions the CURRENT user
 * participates in, as patient or as assigned clinician.
 *
 * - Authorization is resolved entirely server-side from the Better Auth
 *   session (never from query/body input).
 * - Rows are strictly scoped: patient_id = me, or clinician_id = my own
 *   clinician profile. Nothing else is ever returned.
 * - The room capability (room_id) is NOT disclosed here — it is only issued
 *   by GET /api/consultations/[id] in a joinable state.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConsultationRole, ConsultationSession } from "@/lib/consultation/types";

export const dynamic = "force-dynamic";

interface AppointmentRow {
  id: string;
  care_request_id: string | null;
  state: string;
  mode: string;
  proposed_starts_at: string | null;
  confirmed_starts_at: string | null;
  reason?: string | null;
  triage_category?: string | null;
}

function toSession(row: AppointmentRow, role: ConsultationRole): ConsultationSession {
  return {
    id: row.id,
    role,
    state: row.state,
    mode: row.mode === "audio" || row.mode === "video" ? row.mode : "text",
    careRequestId: row.care_request_id,
    proposedStartsAt: row.proposed_starts_at,
    confirmedStartsAt: row.confirmed_starts_at,
    roomChannel: null, // never from the list endpoint
    participantId: null,
    reason: row.reason ? String(row.reason).slice(0, 300) : null,
    triageCategory: row.triage_category ?? null,
  };
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const admin = await createAdminClient();
  const select =
    "id, care_request_id, state, mode, proposed_starts_at, confirmed_starts_at";

  const sessions: ConsultationSession[] = [];

  // 1. Sessions where I am the patient.
  const asPatient = await admin
    .from("care_appointments")
    .select(select)
    .eq("patient_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(20);
  const patientRows = ((asPatient.data as AppointmentRow[] | null) ?? []).map((row) =>
    toSession(row, "patient")
  );
  sessions.push(...patientRows);

  // 2. Sessions where I am the assigned clinician.
  const { data: profile } = await admin
    .from("clinician_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile && typeof profile.id === "string") {
    const asClinician = await admin
      .from("care_appointments")
      .select(select)
      .eq("clinician_id", profile.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    const clinicianRows = ((asClinician.data as AppointmentRow[] | null) ?? []).map((row) =>
      toSession(row, "clinician")
    );
    sessions.push(...clinicianRows);
  }

  // 3. Authorized context for each session (reason snippet / triage only).
  const careRequestIds = sessions
    .map((s) => s.careRequestId)
    .filter((id): id is string => typeof id === "string");
  if (careRequestIds.length > 0) {
    const { data: requests } = await admin
      .from("care_requests")
      .select("id, reason, triage_category")
      .in("id", careRequestIds);
    const byId = new Map(
      ((requests as Array<{ id: string; reason: string | null; triage_category: string | null }> | null) ?? []).map(
        (r) => [r.id, r]
      )
    );
    for (const session of sessions) {
      const request = session.careRequestId ? byId.get(session.careRequestId) : undefined;
      if (request) {
        session.reason = request.reason ? String(request.reason).slice(0, 300) : null;
        session.triageCategory = request.triage_category;
      }
    }
  }

  return NextResponse.json({ sessions });
}
