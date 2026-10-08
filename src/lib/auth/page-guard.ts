/**
 * Server-side page guards for role-specific areas.
 *
 * Usage in a layout/page (server component):
 *
 *   const guard = await requireArea("doctor");
 *   if (guard.kind === "redirect") return redirect(guard.to);
 *   if (guard.kind === "denied") return <AccessDeniedScreen />;
 *
 * Every check runs per request against the Better Auth session and the
 * server-side role registry — the browser can never assert a role.
 */
import { getSessionUser, getActiveRoles, type AppRole } from "@/lib/auth-session";

export type GuardArea =
  | "authed" // any signed-in user
  | "patient"
  | "doctor"
  | "doctor_pending_or_doctor"
  | "facility_admin"
  | "platform_admin"
  | "facility_or_platform_admin";

const AREA_ROLES: Record<GuardArea, AppRole[] | null> = {
  authed: null, // any role
  patient: ["patient"],
  doctor: ["doctor"],
  doctor_pending_or_doctor: ["doctor", "doctor_pending"],
  facility_admin: ["facility_admin"],
  platform_admin: ["platform_admin"],
  facility_or_platform_admin: ["facility_admin", "platform_admin"],
};

export type GuardResult =
  | { kind: "ok"; roles: AppRole[]; userId: string }
  | { kind: "redirect"; to: string }
  | { kind: "denied" };

export async function requireArea(area: GuardArea): Promise<GuardResult> {
  const user = await getSessionUser();
  if (!user) {
    return { kind: "redirect", to: `/sign-in` };
  }
  const roles = await getActiveRoles(user.id);
  const allowed = AREA_ROLES[area];
  if (allowed === null) {
    // Any active role grants access to generic signed-in areas. Users with no
    // active role at all (unregistered staff edge) are treated as patients.
    if (roles.length === 0) return { kind: "ok", roles: ["patient"], userId: user.id };
    return { kind: "ok", roles, userId: user.id };
  }
  if (!roles.some((r) => allowed.includes(r))) {
    return { kind: "denied" };
  }
  return { kind: "ok", roles, userId: user.id };
}
