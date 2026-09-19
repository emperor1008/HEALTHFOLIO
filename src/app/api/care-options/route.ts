/**
 * Care options for a patient's care request.
 * GET /api/care-options?requestId=...&mode=text
 *
 * - Matches ONLY real clinician_profiles rows (empty ⇒ honest empty state).
 * - Urgency comes from the request's stored triage_category (Part 2).
 * - Emergency requests are rejected here: they must never wait for
 *   clinician matching.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchCareOptions, type ClinicianProfileRow } from "@/lib/appointments/care-options";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId");
  const modeParam = searchParams.get("mode") ?? "text";
  if (!requestId || !["text", "audio", "video"].includes(modeParam)) {
    return NextResponse.json({ code: "INVALID_PARAMS" }, { status: 400 });
  }
  if (modeParam === "video" && !supportsVideoHint()) {
    // Honest mode capability: video is attempted only when the client says
    // the browser supports it; server just validates the enum.
  }

  const admin = createAdminClient();

  // The request must belong to the session user.
  const { data: careRequest } = await admin
    .from("care_requests")
    .select("id, preferred_language, triage_category, user_id")
    .eq("id", requestId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!careRequest) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (careRequest.triage_category === "emergency") {
    return NextResponse.json({ code: "EMERGENCY_NOT_ROUTABLE" }, { status: 409 });
  }

  const urgency = (careRequest.triage_category ?? "routine") as
    | "emergency"
    | "urgent"
    | "routine";

  const { data: profiles } = await admin
    .from("clinician_profiles")
    .select(
      "id, user_id, display_name, facility_id, specialty, languages, modes, availability_state, next_available_at, max_active_requests, updated_at"
    );
  const rows = (profiles ?? []) as ClinicianProfileRow[];

  // Active assignment counts for capacity checks.
  const { data: activeAssignments } = await admin
    .from("care_request_assignments")
    .select("clinician_id")
    .in("state", ["assigned", "accepted"]);
  const activeCounts: Record<string, number> = {};
  for (const a of activeAssignments ?? []) {
    const id = (a as { clinician_id: string }).clinician_id;
    activeCounts[id] = (activeCounts[id] ?? 0) + 1;
  }

  const options = matchCareOptions(rows, {
    urgency,
    language: careRequest.preferred_language || "en",
    mode: modeParam as "text" | "audio" | "video",
    activeCounts,
  });

  return NextResponse.json({
    options,
    // Honest labels for the UI — never "best doctor".
    label: "Available options",
  });
}

function supportsVideoHint(): boolean {
  return true; // enum validation only; real capability is client-side
}
