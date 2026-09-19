/**
 * POST /api/care-requests/[id]/accept — the assigned clinician accepts the
 * request. Neutral decline with a reason category is also supported here.
 * Idempotent: re-accepting is a no-op.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffIdentity, STAFF_ROLE_ERROR } from "@/lib/staff/roles";

export const dynamic = "force-dynamic";

const AcceptSchema = z.object({
  action: z.enum(["accept", "decline"]),
  reason_category: z
    .enum(["not_available", "out_of_scope", "capacity_full"])
    .optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
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
  const parsed = AcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  if (parsed.data.action === "decline" && !parsed.data.reason_category) {
    return NextResponse.json({ code: "REASON_REQUIRED" }, { status: 400 });
  }

  const admin = createAdminClient();
  const requestId = params.id;

  // The clinician must be the one assigned to this request.
  const { data: assignment } = await admin
    .from("care_request_assignments")
    .select("id, clinician_id, state, care_request_id")
    .eq("care_request_id", requestId)
    .in("state", ["assigned", "accepted"])
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json({ code: "NOT_ASSIGNED" }, { status: 404 });
  }
  const { data: profile } = await admin
    .from("clinician_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile || profile.id !== assignment.clinician_id) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  if (assignment.state === "accepted" && parsed.data.action === "accept") {
    return NextResponse.json({ code: "ACCEPTED", assignment }, { status: 200 }); // idempotent
  }

  const nextState = parsed.data.action === "accept" ? "accepted" : "declined";
  const { data: updated, error } = await admin
    .from("care_request_assignments")
    .update({ state: nextState, reason_category: parsed.data.reason_category ?? null })
    .eq("id", assignment.id)
    .select("id, clinician_id, state")
    .single();
  if (error) {
    return NextResponse.json({ code: "UPDATE_FAILED" }, { status: 500 });
  }

  await admin
    .from("care_appointments")
    .update({ state: nextState === "accepted" ? "accepted" : "declined" })
    .eq("care_request_id", requestId);

  return NextResponse.json({ code: nextState.toUpperCase(), assignment: updated }, { status: 200 });
}
