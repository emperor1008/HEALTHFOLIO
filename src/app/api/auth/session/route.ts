import { NextResponse } from "next/server";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import {
  setSessionCookie,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/firebase/session-cookie";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Exchange a Firebase ID token for the HttpOnly `__session` session cookie.
 * Called by the client right after sign-in / register / token refresh:
 *
 *   POST /api/auth/session   { idToken }
 *     └─ 200 + Set-Cookie: __session (7d)   (rate-limited 30/60s per IP)
 *
 * 401 for an invalid/expired ID token, 503 when the server lacks
 * FIREBASE_SERVICE_ACCOUNT_KEY — same posture as the old auth handler.
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`auth-session:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ code: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  }
  const idToken = (body as { idToken?: unknown } | null)?.idToken;
  if (typeof idToken !== "string" || idToken.length < 10 || idToken.length > 4096) {
    return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });
    const res = NextResponse.json({ data: { ok: true }, error: null });
    setSessionCookie(res, sessionCookie);
    return res;
  } catch {
    // Bad/expired/replayed token — never echo Firebase internals.
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
}
