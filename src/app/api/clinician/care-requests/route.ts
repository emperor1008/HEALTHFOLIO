/**
 * GET /api/clinician/care-requests — the clinician's real work queue.
 *
 * Returns two strictly-scoped lists for the signed-in clinician:
 *   - `assigned`: care requests actively assigned to MY clinician profile
 *     (assigned | accepted), each with its consultation/appointment state so
 *     the UI can offer Accept / Propose / Join.
 *   - `available`: non-emergency care requests with no active assignment and
 *     no live appointment, so a clinician can assign one to themselves —
 *     the same authorization the existing /api/care-requests/[id]/assign
 *     route enforces (any active clinician may take any non-emergency
 *     request; nothing beyond reason/triage/created_at is exposed here).
 *
 * No symptom text, no patient identifiers, no records. Reason snippets are
 * bounded. Everything is derived from server state — no fake availability.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffIdentity, STAFF_ROLE_ERROR } from "@/lib/staff/roles";

export const dynamic = "force-dynamic";

interface CareRequestRow {
  id: string;
  reason: string | null;
  triage_category: string | null;
  created_at: string;
}

interface AppointmentRow {
  id: string;
  care_request_id: string;
  state: string;
  mode: string;
  proposed_starts_at: string | null;
}

interface AssignmentRow {
  care_request_id: string;
  state: string;
}

const LIVE_APPOINTMENT_STATES = new Set([
  "assigned",
  "accepted",
  "appointment_proposed",
  "appointment_confirmed",
  "in_consultation",
]);

function snippet(reason: string | null): string | null {
  return reason ? String(reason).slice(0, 300) : null;
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const identity = await getStaffIdentity(user.id);
  if (!identity || identity.role !== "clinician") {
    return NextResponse.json(STAFF_ROLE_ERROR, { status: 403 });
  }

  const admin = await createAdminClient();

  const { data: profile } = await admin
    .from("clinician_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile || typeof profile.id !== "string") {
    return NextResponse.json({ code: "PROFILE_NOT_FOUND" }, { status: 404 });
  }
  const profileId = profile.id;

  // ── My active assignments ───────────────────────────────────────────────
  const assignmentsResult = await admin
    .from("care_request_assignments")
    .select("care_request_id, state")
    .eq("clinician_id", profileId);
  const myAssignments = ((assignmentsResult.data as AssignmentRow[] | null) ?? []).filter(
    (a) => a.state === "assigned" || a.state === "accepted"
  );

  const assigned: Array<{
    careRequestId: string;
    assignmentState: string;
    reason: string | null;
    triageCategory: string | null;
    createdAt: string | null;
    appointment: {
      id: string;
      state: string;
      mode: string;
      proposedStartsAt: string | null;
    } | null;
  }> = [];

  if (myAssignments.length > 0) {
    const ids = myAssignments.map((a) => a.care_request_id);
    const [requestsResult, appointmentsResult] = await Promise.all([
      admin.from("care_requests").select("id, reason, triage_category, created_at").in("id", ids),
      admin.from("care_appointments").select("id, care_request_id, state, mode, proposed_starts_at").in("care_request_id", ids),
    ]);
    const requestById = new Map(
      ((requestsResult.data as CareRequestRow[] | null) ?? []).map((r) => [r.id, r])
    );
    const appointmentByRequest = new Map(
      ((appointmentsResult.data as AppointmentRow[] | null) ?? []).map((a) => [a.care_request_id, a])
    );
    for (const assignment of myAssignments) {
      const request = requestById.get(assignment.care_request_id);
      const appointment = appointmentByRequest.get(assignment.care_request_id);
      assigned.push({
        careRequestId: assignment.care_request_id,
        assignmentState: assignment.state,
        reason: request ? snippet(request.reason) : null,
        triageCategory: request?.triage_category ?? null,
        createdAt: request?.created_at ?? null,
        appointment: appointment
          ? {
              id: appointment.id,
              state: appointment.state,
              mode: appointment.mode,
              proposedStartsAt: appointment.proposed_starts_at,
            }
          : null,
      });
    }
  }

  // ── Unassigned, routable requests (no active assignment/appointment) ────
  const [candidatesResult, allActiveAssignmentsResult, liveAppointmentsResult] =
    await Promise.all([
      admin
        .from("care_requests")
        .select("id, reason, triage_category, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      admin
        .from("care_request_assignments")
        .select("care_request_id, state")
        .in("state", ["assigned", "accepted"]),
      admin
        .from("care_appointments")
        .select("care_request_id, state")
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);

  const busyRequests = new Set<string>();
  for (const row of (allActiveAssignmentsResult.data as AssignmentRow[] | null) ?? []) {
    if (row.state === "assigned" || row.state === "accepted") busyRequests.add(row.care_request_id);
  }
  for (const row of (liveAppointmentsResult.data as AppointmentRow[] | null) ?? []) {
    if (LIVE_APPOINTMENT_STATES.has(row.state)) busyRequests.add(row.care_request_id);
  }

  const available = ((candidatesResult.data as CareRequestRow[] | null) ?? [])
    .filter((r) => r.triage_category !== "emergency")
    .filter((r) => !busyRequests.has(r.id))
    .slice(0, 20)
    .map((r) => ({
      careRequestId: r.id,
      reason: snippet(r.reason),
      triageCategory: r.triage_category,
      createdAt: r.created_at,
    }));

  return NextResponse.json({ profileId, assigned, available });
}
