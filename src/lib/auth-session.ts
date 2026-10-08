/**
 * Session and role resolution — server-side only.
 *
 * Every server surface (pages, route handlers) resolves identity through
 * `getSessionUser()` which verifies the Firebase `__session` cookie, and
 * roles through `getActiveRoles()` which reads the `users/{uid}` identity
 * document (Firebase Migration P1). The browser can never assert or elevate
 * a role: the cookie is HttpOnly and cryptographically verified, and role
 * writes happen only through server routes (provision, doctor apply, staff
 * console) using the Admin SDK, which bypasses Firestore rules.
 *
 * Role policy (enforced here and by every API route):
 *   patient          — full app access to own data
 *   doctor_pending   — may see only the application-status screen
 *   doctor           — assigned patients + active-consent records
 *   facility_admin   — own facility management
 *   platform_admin   — audited platform-only actions
 *
 * Profile reads (email/displayName/roles) are cached in-memory for 60s per
 * uid — a single Firestore doc read per user per minute. Every writer of the
 * roles doc MUST call `invalidateSessionProfileCache(uid)` so promotions and
 * revocations land immediately for the affected session.
 */
import { headers } from "next/headers";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { readSessionCookie } from "@/lib/firebase/session-cookie";

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

interface CachedProfile {
  email: string;
  displayName: string;
  roles: AppRole[];
  expiresAt: number;
}

const PROFILE_TTL_MS = 60_000;
const profileCache = new Map<string, CachedProfile | null>();

/**
 * Drop the cached identity doc for a user (or everyone). Called by every
 * roles/profile writer: provision, doctor apply, staff console, account
 * deletion — so guards see the change without waiting out the TTL.
 */
export function invalidateSessionProfileCache(userId?: string): void {
  if (userId) profileCache.delete(userId);
  else profileCache.clear();
}

/**
 * The `users/{uid}` identity doc, cached 60s. Returns null when the doc does
 * not exist (pre-provision) or Firebase is not configured — callers treat
 * both as "no roles, no profile".
 */
async function getCachedProfile(userId: string): Promise<CachedProfile | null> {
  const hit = profileCache.get(userId);
  if (hit !== undefined) {
    if (hit === null) return null;
    if (hit.expiresAt > Date.now()) return hit;
    profileCache.delete(userId);
  }
  try {
    const snap = await getAdminDb().doc(`users/${userId}`).get();
    if (!snap.exists) {
      profileCache.set(userId, null);
      return null;
    }
    const raw = snap.data() ?? {};
    const roles = Array.isArray(raw.roles)
      ? (raw.roles.filter((r): r is AppRole =>
          APP_ROLES.includes(r as AppRole)
        ) as AppRole[])
      : [];
    const profile: CachedProfile = {
      email: typeof raw.email === "string" ? raw.email : "",
      displayName:
        typeof raw.displayName === "string" ? raw.displayName : "",
      roles,
      expiresAt: Date.now() + PROFILE_TTL_MS,
    };
    profileCache.set(userId, profile);
    return profile;
  } catch {
    // Missing env / network errors resolve to "no profile" — guards treat it
    // as signed-out or role-less, never a crash.
    return null;
  }
}

/**
 * Resolve the Firebase session for the current request. Null when signed
 * out, when the cookie is stale/invalid, or when auth is not configured —
 * callers return 401 (same posture as the old Better Auth resolver).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const h = await headers();
    const token = readSessionCookie(h.get("cookie"));
    if (!token) return null;
    const decoded = await getAdminAuth().verifySessionCookie(token);
    const uid = decoded.uid;
    if (!uid) return null;
    // Session-cookie claims usually carry email/name, but the identity doc
    // is the authoritative fallback (and the only source before claims
    // propagate). Cached, so this is not an extra round-trip per request.
    const profile = await getCachedProfile(uid);
    return {
      id: uid,
      email: decoded.email || profile?.email || "",
      name: decoded.name || profile?.displayName || "",
    };
  } catch {
    // Cookie/verification errors resolve to "no session" — callers return 401.
    return null;
  }
}

/**
 * Active identity roles for a user, resolved from `users/{uid}.roles` with a
 * 60s cache. Unknown values are filtered out; a missing doc yields [].
 */
export async function getActiveRoles(userId: string): Promise<AppRole[]> {
  try {
    const profile = await getCachedProfile(userId);
    return profile ? profile.roles : [];
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
