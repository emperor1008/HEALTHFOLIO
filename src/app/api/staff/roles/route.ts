/**
 * Staff role assignment — the ONLY path that writes facility_memberships.
 *
 * Guarded by the server-only env key STAFF_ROLE_ADMIN_KEY. Never callable
 * from ordinary client sessions. Used by a deployment administrator to grant
 * clinician/coordinator roles; no auto-creation of clinician accounts.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasStaffAdminKey, STAFF_ROLE_ERROR } from "@/lib/staff/roles";

export const dynamic = "force-dynamic";

const RoleSchema = z.object({
  user_id: z.string().uuid(),
  facility_id: z.string().uuid(),
  role: z.enum(["clinician", "coordinator"]),
});

export async function POST(req: Request) {
  if (!hasStaffAdminKey(req)) {
    return NextResponse.json(STAFF_ROLE_ERROR, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = RoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("facility_memberships")
    .upsert(
      {
        user_id: parsed.data.user_id,
        facility_id: parsed.data.facility_id,
        role: parsed.data.role,
      },
      { onConflict: "user_id,facility_id" }
    );
  if (error) {
    console.error("[staff-roles] upsert failed", { code: error.code });
    return NextResponse.json({ code: "ROLE_ASSIGN_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ code: "ROLE_ASSIGNED" }, { status: 201 });
}

export async function DELETE(req: Request) {
  if (!hasStaffAdminKey(req)) {
    return NextResponse.json(STAFF_ROLE_ERROR, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const facilityId = searchParams.get("facility_id");
  const parsed = z
    .object({ user_id: z.string().uuid(), facility_id: z.string().uuid() })
    .safeParse({ user_id: userId, facility_id: facilityId });
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("facility_memberships")
    .delete()
    .eq("user_id", parsed.data.user_id)
    .eq("facility_id", parsed.data.facility_id);
  if (error) {
    console.error("[staff-roles] delete failed", { code: error.code });
    return NextResponse.json({ code: "ROLE_REVOKE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ code: "ROLE_REVOKED" }, { status: 200 });
}
