/**
 * Platform-admin staff management — the ONLY server API that writes
 * `user_roles` from the web.
 *
 * Authorization: the CALLER's session (never a client-supplied identity)
 * must resolve to an ACTIVE platform_admin registry row. There is no admin
 * secret accepted from the browser — the old x-staff-admin-key path was
 * removed in favour of this per-session authorization model.
 *
 * Every mutation is Zod-validated, idempotent (registry upsert on
 * user_id+role), audited to staff_admin_audit_events, and mirrors the scoped
 * membership rows (facility_memberships / pharmacy_memberships) that the
 * existing RLS staff paths depend on. Suspension/revocation takes effect on
 * the next request because staff identity is re-resolved per request.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSIGNABLE_ROLES, isPlatformAdmin, SCOPED_ROLES } from "@/lib/staff/roles";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

const AssignSchema = z.object({
  user_id: UUID,
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
  // Required for scoped roles: facility id (clinician/facility_coordinator)
  // or pharmacy id (pharmacy_operator/pharmacy_manager).
  scope_id: UUID.optional(),
});

const StatusSchema = z.object({
  user_id: UUID,
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
  action: z.enum(["suspend", "reinstate", "revoke"]),
});

/** Safe column list — no secrets, no emails, no PII beyond the UUID. */
const SAFE_COLUMNS = "user_id, role, status, scope_id, assigned_by, created_at, updated_at";

interface Err {
  code: string;
  status: number;
}

async function requirePlatformAdmin(): Promise<{ userId: string } | Err> {
  const user = await getUser();
  if (!user) return { code: "UNAUTHENTICATED", status: 401 } as Err;
  if (!(await isPlatformAdmin(user.id))) {
    return { code: "STAFF_ACCESS_NOT_CONFIGURED", status: 403 } as Err;
  }
  return { userId: user.id };
}

function err(e: Err) {
  return NextResponse.json({ code: e.code }, { status: e.status });
}

export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("code" in auth) return err(auth);

  const admin = await createAdminClient();
  const { data, error } = await admin.from("user_roles").select(SAFE_COLUMNS).order("created_at");
  if (error) {
    console.error("[staff-admin] list failed", { code: error.code });
    return NextResponse.json({ code: "LIST_FAILED" }, { status: 500 });
  }

  // Safe audit history: action + target + time only. No actor emails, no
  // scope names, no free-form metadata.
  const { data: audit, error: auditErr } = await admin
    .from("staff_admin_audit_events")
    .select("action, target_user_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const auditEvents =
    auditErr || !audit
      ? []
      : (audit as Array<{ action: string; target_user_id: string; details: unknown; created_at: string }>).map(
          (a) => ({ action: a.action, target_user_id: a.target_user_id, created_at: a.created_at })
        );

  return NextResponse.json({ roles: data ?? [], audit: auditEvents });
}

export async function POST(req: Request) {
  const auth = await requirePlatformAdmin();
  if ("code" in auth) return err(auth);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });

  const { user_id, role, scope_id } = parsed.data;
  const scoped = (SCOPED_ROLES as readonly string[]).includes(role);
  if (scoped && !scope_id) {
    return NextResponse.json({ code: "SCOPE_REQUIRED" }, { status: 400 });
  }

  const admin = await createAdminClient();

  // Idempotent registry upsert.
  const { error: regErr } = await admin.from("user_roles").upsert(
    { user_id, role, status: "active", scope_id: scope_id ?? null, assigned_by: auth.userId },
    { onConflict: "user_id,role" }
  );
  if (regErr) {
    console.error("[staff-admin] assign failed", { code: regErr.code });
    return NextResponse.json({ code: "ROLE_ASSIGN_FAILED" }, { status: 500 });
  }

  // Mirror scoped membership for existing RLS paths.
  if (scoped && scope_id) {
    let mirrorError: { code?: string } | null = null;
    if (role === "clinician") {
      const r = await admin
        .from("facility_memberships")
        .upsert({ user_id, facility_id: scope_id, role: "clinician" }, { onConflict: "user_id,facility_id" });
      mirrorError = r.error;
    } else if (role === "facility_coordinator") {
      const r = await admin
        .from("facility_memberships")
        .upsert({ user_id, facility_id: scope_id, role: "coordinator" }, { onConflict: "user_id,facility_id" });
      mirrorError = r.error;
    } else if (role === "pharmacy_operator") {
      const r = await admin
        .from("pharmacy_memberships")
        .upsert({ user_id, pharmacy_id: scope_id, role: "operator" }, { onConflict: "user_id,pharmacy_id" });
      mirrorError = r.error;
    } else {
      const r = await admin
        .from("pharmacy_memberships")
        .upsert({ user_id, pharmacy_id: scope_id, role: "manager" }, { onConflict: "user_id,pharmacy_id" });
      mirrorError = r.error;
    }
    if (mirrorError) {
      console.error("[staff-admin] membership mirror failed", { code: mirrorError.code });
      return NextResponse.json({ code: "ROLE_ASSIGN_FAILED" }, { status: 500 });
    }
  }

  await admin.from("staff_admin_audit_events").insert({
    actor_id: auth.userId,
    action: "assign_role",
    target_user_id: user_id,
    details: { role, scope_id: scope_id ?? null, source: "admin_console" },
  });

  return NextResponse.json({ code: "ROLE_ASSIGNED" }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requirePlatformAdmin();
  if ("code" in auth) return err(auth);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });

  const { user_id, role, action } = parsed.data;
  const status = action === "suspend" ? "suspended" : action === "reinstate" ? "active" : "revoked";

  const admin = await createAdminClient();
  const { error: upErr } = await admin
    .from("user_roles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("user_id", user_id)
    .eq("role", role);
  if (upErr) {
    console.error("[staff-admin] status change failed", { code: upErr.code });
    return NextResponse.json({ code: "ROLE_UPDATE_FAILED" }, { status: 500 });
  }

  // Revocation also removes the scoped membership so capability cannot be
  // reconstructed from a mirrored row.
  if (action === "revoke") {
    if (role === "clinician" || role === "facility_coordinator") {
      await admin.from("facility_memberships").delete().eq("user_id", user_id);
    } else if (role === "pharmacy_operator" || role === "pharmacy_manager") {
      await admin.from("pharmacy_memberships").delete().eq("user_id", user_id);
    }
  }

  await admin.from("staff_admin_audit_events").insert({
    actor_id: auth.userId,
    action: `${action}_role` as "suspend_role" | "reinstate_role" | "revoke_role",
    target_user_id: user_id,
    details: { role, source: "admin_console" },
  });

  return NextResponse.json({ code: "ROLE_UPDATED" });
}
