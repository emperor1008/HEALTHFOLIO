import { NextResponse } from "next/server";
import {
  getAdminAuth,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
import {
  clearSessionCookie,
  readSessionCookie,
} from "@/lib/firebase/session-cookie";
import { invalidateSessionProfileCache } from "@/lib/auth-session";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Sign out: clear the HttpOnly `__session` cookie and (best-effort) revoke
 * the user's refresh tokens so other devices stop renewing their cookies.
 *
 * The presented cookie is VERIFIED before revocation — a caller can only
 * revoke their own tokens, never someone else's. Verification failure still
 * clears the cookie (signing out must always "succeed" client-side).
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`auth-signout:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  if (isFirebaseAdminConfigured()) {
    try {
      const token = readSessionCookie(req.headers.get("cookie"));
      if (token) {
        const decoded = await getAdminAuth().verifySessionCookie(token);
        if (decoded.uid) {
          // Best-effort: revoke refresh tokens so other devices cannot
          // re-exchange; already-issued session cookies die at their 7d
          // expiry (verification runs without a revocation check for
          // latency/offline resilience — documented P1 trade-off).
          await getAdminAuth().revokeRefreshTokens(decoded.uid);
          invalidateSessionProfileCache(decoded.uid);
        }
      }
    } catch {
      // Invalid cookie or no admin env — clearing the cookie below is
      // still the correct outcome.
    }
  }

  const res = NextResponse.json({ data: { ok: true }, error: null });
  clearSessionCookie(res);
  return res;
}
