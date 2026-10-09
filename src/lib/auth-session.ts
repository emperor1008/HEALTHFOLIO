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
import { getDemoIdentity, isDemoUserId } from "@/lib/preview/identity";
import { resolveSession as resolveDatabaseSession } from "@/lib/auth/db-auth";

export type AppRole =
  "patient" | "doctor_pending" | "doctor" | "facility_admin" | "platform_admin";

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
          APP_ROLES.includes(r as AppRole),
        ) as AppRole[])
      : [];
    const profile: CachedProfile = {
      email: typeof raw.email === "string" ? raw.email : "",
      displayName: typeof raw.displayName === "string" ? raw.displayName : "",
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
 * Resolve the session for the current request.
 *
 * Order:
 *   1. A real session — the database-backed opaque token first, then the
 *      Firebase `__session` cookie. A signed-in user is NEVER overridden by
 *      the preview identity.
 *   2. The preview/demo identity — only when there is no usable session AND
 *      the server-side preview gate passes (HF_DEMO_MODE + environment +
 *      host verification). This is the ONE place a sign-in-free identity
 *      enters the application, so every page guard, layout and API route
 *      inherits it without local bypass code.
 *
 * Null when signed out and preview mode is off — callers return 401 (same
 * posture as before).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  let token: string | null = null;
  try {
    const h = await headers();
    token = readSessionCookie(h.get("cookie"));
  } catch {
    token = null; // no request context (build, script) → no cookie to read
  }

  if (token) {
    try {
      // Database-backed session: an opaque random token (no JWT structure).
      // Tried before the identity-provider verification because that provider
      // only ever issues dotted JWTs — so this costs at most one indexed lookup.
      if (!token.includes(".")) {
        try {
          const account = await resolveDatabaseSession(token);
          if (account) {
            return {
              id: account.id,
              email: account.email,
              name: account.displayName ?? "",
            };
          }
        } catch {
          // Database unavailable → fall through; the token is rejected below.
        }
      }

      const decoded = await getAdminAuth().verifySessionCookie(token);
      const uid = decoded.uid;
      if (uid) {
        // Session-cookie claims usually carry email/name, but the identity
        // doc is the authoritative fallback (and the only source before claims
        // propagate). Cached, so this is not an extra round-trip per request.
        const profile = await getCachedProfile(uid);
        return {
          id: uid,
          email: decoded.email || profile?.email || "",
          name: decoded.name || profile?.displayName || "",
        };
      }
    } catch {
      // Invalid/expired cookie → treat as signed-out and try preview below.
    }
  }

  // No usable session: the preview identity, only if the gate allows it.
  try {
    const demo = await getDemoIdentity();
    if (demo) {
      return { id: demo.id, email: demo.email, name: demo.name };
    }
  } catch {
    // Gate evaluation must never crash a request — signed-out it is.
  }
  return null;
}

/**
 * Active identity roles for a user, resolved from `users/{uid}.roles` with a
 * 60s cache. Unknown values are filtered out; a missing doc yields [].
 */
export async function getActiveRoles(userId: string): Promise<AppRole[]> {
  if (isDemoUserId(userId)) {
    // Preview roles come from server configuration and are validated against
    // the same allowlist every other role source uses — an operator can widen
    // them (HF_DEMO_ROLES), but an unknown value can never become a role.
    const demo = await getDemoIdentity();
    if (!demo) return [];
    return demo.roles.filter((r): r is AppRole =>
      APP_ROLES.includes(r as AppRole),
    );
  }
  try {
    const profile = await getCachedProfile(userId);
    if (profile) return profile.roles;
    // No identity document: this is a database-backed account (migration 032),
    // whose roles live in `auth_accounts.roles`. Cached for the same TTL as a
    // profile read so a page load never issues one query per guard.
    return await getDatabaseRoles(userId);
  } catch {
    return [];
  }
}

const DB_ROLES_TTL_MS = 60_000;
const dbRoleCache = new Map<string, { roles: AppRole[]; expiresAt: number }>();

export function invalidateDatabaseRoleCache(userId?: string): void {
  if (userId) dbRoleCache.delete(userId);
  else dbRoleCache.clear();
}

/** Roles stored on a database-backed account, cached 60s. Unknown → []. */
async function getDatabaseRoles(userId: string): Promise<AppRole[]> {
  const hit = dbRoleCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.roles;
  try {
    const { findAccountById } = await import("@/lib/auth/db-auth");
    const account = await findAccountById(userId);
    const roles = account
      ? account.roles.filter((r): r is AppRole =>
          APP_ROLES.includes(r as AppRole),
        )
      : [];
    dbRoleCache.set(userId, { roles, expiresAt: Date.now() + DB_ROLES_TTL_MS });
    return roles;
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
