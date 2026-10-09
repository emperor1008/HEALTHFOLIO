/**
 * Staff role resolution — server-side only.
 *
 * Role sources (both written exclusively by the server):
 *   1. `user_roles` (migration 026) — the platform role registry. RLS-enabled
 *      with no policies, so only service-role server code can read it. Holds
 *      platform_admin plus the scoped staff roles and their status
 *      (active | suspended | revoked).
 *   2. `facility_memberships` / `pharmacy_memberships` — facility/pharmacy
 *      scoping mirrored by the server when a scoped role is granted.
 *
 * The browser can never assert a role: every helper here takes a userId that
 * API routes derive from their own session (getUser()), never from a request
 * body, header, or query parameter.
 *
 * Suspension contract: a suspended or revoked `user_roles` row immediately
 * removes ALL staff capability for that user — staff identity is re-resolved
 * per request, and `getStaffIdentity` refuses any user whose matching
 * registry row is not active. No stale-session elevation is possible.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type StaffRole = "clinician" | "coordinator";

/** Full platform role vocabulary (migration 026). */
export type PlatformRole =
  | "patient"
  | "clinician"
  | "pharmacy_operator"
  | "facility_coordinator"
  | "pharmacy_manager"
  | "platform_admin";

export type UserRoleStatus = "active" | "suspended" | "revoked";

/** Roles that may be granted by admins/the bootstrap script. */
export const ASSIGNABLE_ROLES: readonly PlatformRole[] = [
  "clinician",
  "pharmacy_operator",
  "facility_coordinator",
  "pharmacy_manager",
  "platform_admin",
] as const;

/** Roles that require a facility or pharmacy scope. */
export const SCOPED_ROLES: readonly PlatformRole[] = [
  "clinician",
  "facility_coordinator",
  "pharmacy_operator",
  "pharmacy_manager",
] as const;

export interface StaffIdentity {
  userId: string;
  role: StaffRole;
  facilityId: string;
  /** Clinician profile id when role = clinician. */
  clinicianProfileId?: string;
}

/**
 * Highest active platform role for a user, or null when the user holds no
 * active role. Suspended/revoked rows never resolve.
 *
 * Auth-era bridge: platform_admin is now provisioned in BOTH registries —
 * `app_roles` (migration 027, the Better Auth-era store) and the legacy
 * `user_roles` (migration 026) — by the bootstrap script / admin console, so
 * this resolver accepts an active platform_admin row in either. That keeps
 * legacy Part 3–5 staff surfaces working while the app_roles registry is the
 * canonical source for the new role model.
 */
export async function getActivePlatformRole(
  userId: string
): Promise<PlatformRole | null> {
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("user_roles")
      .select("role, status")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error || !data || data.length === 0) {
      // Fall through to the auth-era registry before concluding "no role".
      const legacy = await resolveLegacyAppRole(userId);
      return legacy ?? null;
    }
    const roles = new Set(data.map((r: { role: string }) => r.role as PlatformRole));
    if (roles.has("platform_admin")) return "platform_admin";
    if (roles.has("pharmacy_manager")) return "pharmacy_manager";
    if (roles.has("pharmacy_operator")) return "pharmacy_operator";
    if (roles.has("facility_coordinator")) return "facility_coordinator";
    if (roles.has("clinician")) return "clinician";
    // Legacy registry active rows exist but hold no staff role — check the
    // auth-era registry for platform_admin before defaulting to patient.
    const bridged = await resolveLegacyAppRole(userId);
    if (bridged === "platform_admin") return "platform_admin";
    return "patient";
  } catch {
    return null;
  }
}

/** Resolve platform_admin from the migration-027 app_roles registry. */
async function resolveLegacyAppRole(
  userId: string
): Promise<PlatformRole | null> {
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("app_roles")
      .select("role, status")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error || !data) return null;
    const roles = new Set(data.map((r: { role: string }) => r.role as string));
    if (roles.has("platform_admin")) return "platform_admin";
    if (roles.has("facility_admin")) return "facility_coordinator";
    if (roles.has("doctor")) return "clinician";
    if (roles.has("patient") || roles.has("doctor_pending")) return "patient";
    return null;
  } catch {
    return null;
  }
}

/** True only when the user holds an ACTIVE platform_admin registry row. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return (await getActivePlatformRole(userId)) === "platform_admin";
}

/** Registry status for a specific role, or null when no row exists. */
export async function getUserRoleStatus(
  userId: string,
  role: PlatformRole
): Promise<UserRoleStatus | null> {
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("user_roles")
      .select("status")
      .eq("user_id", userId)
      .eq("role", role)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.status as UserRoleStatus;
  } catch {
    return null;
  }
}

/**
 * Resolve the staff identity for a user, or null for patients.
 *
 * Requires BOTH:
 *   - a facility_memberships row (facility scoping), and
 *   - an ACTIVE user_roles registry row for the matching role
 *     (clinician → 'clinician', coordinator → 'facility_coordinator').
 *
 * A user with a membership but a suspended/revoked/missing registry row has
 * no staff capability — that is the migration path requirement: staff must be
 * provisioned through `npm run staff:bootstrap` or the platform-admin console.
 */
export async function getStaffIdentity(userId: string): Promise<StaffIdentity | null> {
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("facility_memberships")
      .select("role, facility_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    const registryRole: PlatformRole =
      data.role === "clinician" ? "clinician" : "facility_coordinator";
    const status = await getUserRoleStatus(userId, registryRole);
    if (status !== "active") return null;

    return {
      userId,
      role: data.role as StaffRole,
      facilityId: data.facility_id as string,
    };
  } catch {
    return null;
  }
}

export const STAFF_ROLE_ERROR = { code: "STAFF_ACCESS_NOT_CONFIGURED" } as const;
