/**
 * Session and role resolution — server-side only.
 *
 * Every server surface (pages, route handlers) resolves identity through
 * `getSessionUser()` which reads the Better Auth session cookie, and roles
 * through `getActiveRoles()` which reads the `app_roles` registry (migration
 * 027). The registry is RLS-locked with no policies, so it is reachable only
 * from server code; the browser can never assert or elevate a role.
 *
 * Role policy (enforced here and by every API route):
 *   patient          — full app access to own data
 *   doctor_pending   — may see only the application-status screen
 *   doctor           — assigned patients + active-consent records
 *   facility_admin   — own facility management
 *   platform_admin   — audited platform-only actions
 */
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getAuth } from "@/lib/auth";

export type AppRole =
  | "patient"
  | "doctor_pending"
  | "doctor"
  | "facility_admin"
  | "platform_admin";

export const APP_ROLES: readonly AppRole[] = [
  "patient",
  "doctor_pending",
  "doctor",
  "facility_admin",
  "platform_admin",
];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface SessionWithRoles {
  user: SessionUser;
  session: { id: string; expiresAt: Date };
  roles: AppRole[];
}

/**
 * Service-role Supabase client for role-registry reads. The key is read from
 * the environment at call time and never leaves the server.
 */
function getRoleStoreClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolve the Better Auth session for the current request. Null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const auth = await getAuth();
    if (!auth) return null; // auth not configured → no session anywhere
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? "",
    };
  } catch {
    // Database/cookie errors resolve to "no session" — callers return 401.
    return null;
  }
}

/**
 * Active roles for a user, resolved per request from the registry.
 * Suspended/revoked rows are excluded, so revocation takes effect immediately.
 */
export async function getActiveRoles(userId: string): Promise<AppRole[]> {
  const supabase = getRoleStoreClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("app_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error || !data) return [];
    return data
      .map((r) => r.role as AppRole)
      .filter((role) => APP_ROLES.includes(role));
  } catch {
    return [];
  }
}

/** Session + roles in one round-trip set. */
export async function getSessionWithRoles(): Promise<SessionWithRoles | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const roles = await getActiveRoles(user.id);
  return {
    user,
    roles,
    session: { id: "", expiresAt: new Date(0) }, // populated by callers needing raw session
  };
}

export function hasRole(roles: AppRole[], ...allowed: AppRole[]): boolean {
  return roles.some((role) => allowed.includes(role));
}

/** Highest-authority role for redirect decisions. */
export function primaryRole(roles: AppRole[]): AppRole | null {
  const precedence: AppRole[] = [
    "platform_admin",
    "facility_admin",
    "doctor",
    "doctor_pending",
    "patient",
  ];
  return precedence.find((role) => roles.includes(role)) ?? null;
}

/** Post-login landing route per role. */
export function homeForRole(roles: AppRole[]): string {
  const role = primaryRole(roles);
  switch (role) {
    case "platform_admin":
      return "/admin/platform";
    case "facility_admin":
      return "/admin/facility";
    case "doctor":
      return "/doctor";
    case "doctor_pending":
      return "/doctor/application-status";
    case "patient":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}
