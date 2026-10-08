/**
 * API guard helpers — every state-changing or data-reading application route
 * resolves identity and permission through these functions. They replace the
 * previous Supabase-auth `getUser()` seam with Better Auth sessions and the
 * server-side role registry.
 */
import { NextResponse } from "next/server";
import { getSessionUser, getActiveRoles, hasRole, type AppRole } from "@/lib/auth-session";

export interface GuardedSession {
  userId: string;
  email: string;
  roles: AppRole[];
}

/** 401 with a generic code; no internals are echoed. */
export function unauthorized() {
  return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
}

/** 403 with a generic code; distinguishes "signed in, wrong role". */
export function forbidden() {
  return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
}

/**
 * Require a valid Better Auth session. Returns null (and the response is NOT
 * sent) only when the caller must send `unauthorized()` itself, to keep route
 * bodies explicit:
 *
 *   const auth = await requireSession();
 *   if (!auth) return unauthorized();
 */
export async function requireSession(): Promise<GuardedSession | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const roles = await getActiveRoles(user.id);
  return { userId: user.id, email: user.email, roles };
}

/**
 * Require a session that holds ANY of the given active roles.
 * Same contract as requireSession; caller distinguishes 401/403:
 *
 *   const auth = await requireRole("facility_admin", "platform_admin");
 *   if (!auth) return unauthorized();
 *   if (!hasRole(auth.roles, "facility_admin", "platform_admin")) return forbidden();
 */
export async function requireRole(...allowed: AppRole[]) {
  const session = await requireSession();
  return session;
}

export { hasRole };
