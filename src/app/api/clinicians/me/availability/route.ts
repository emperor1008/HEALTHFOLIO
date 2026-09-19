/**
 * Clinician self-service availability.
 * PATCH updates the profile + appends to the auditable history table.
 * Only the clinician themselves (resolved server-side) may change it.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffIdentity, STAFF_ROLE_ERROR } from "@/lib/staff/roles";

export const dynamic = "force-dynamic";

const AvailabilitySchema = z.object({
  availability_state: z.enum(["available", "busy", "offline"]),
  next_available_at: z.string().datetime().nullable().optional(),
  note: z.string().max(200).optional(),
});

export async function PATCH(req: Request) {
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
  const parsed = AvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Find own profile.
  const { data: profile } = await admin
    .from("clinician_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ code: "PROFILE_NOT_FOUND" }, { status: 404 });
  }

  const { error } = await admin
    .from("clinician_profiles")
    .update({
      availability_state: parsed.data.availability_state,
      next_available_at: parsed.data.next_available_at ?? null,
      updated_at: now,
    })
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ code: "UPDATE_FAILED" }, { status: 500 });
  }

  // Append-only audit history (best-effort).
  try {
    await admin.from("clinician_availability").insert({
      clinician_id: profile.id,
      state: parsed.data.availability_state,
      note: parsed.data.note ?? null,
      changed_by: user.id,
    });
  } catch {
    // audit must never fail the update
  }

  return NextResponse.json({ code: "UPDATED" }, { status: 200 });
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
  const admin = createAdminClient();
  const { data } = await admin
    .from("clinician_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({ profile: data ?? null });
}
