import { NextResponse } from "next/server";
import { hit } from "@/lib/api/rate-limit";
import { verifyCredentials, createSession } from "@/lib/auth/db-auth";
import { isDatabaseAuth } from "@/lib/auth/provider";
import { setSessionCookie } from "@/lib/firebase/session-cookie";
import { invalidateSessionProfileCache } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sign-in — database-backed login.
 *
 * Replaces the client-side identity-provider sign-in when the database
 * provider is active (no Firebase configuration, or HF_AUTH_PROVIDER=db).
 *
 * Security posture:
 *  - Rate limited per IP; generic 401 `INVALID_CREDENTIALS` for both unknown
 *    email and wrong password (no account enumeration), with a dummy scrypt
 *    run on the unknown-email path so timing does not leak either.
 *  - The session is an opaque random token stored only as a SHA-256 hash; the
 *    plaintext goes straight into an HttpOnly, SameSite=Lax cookie.
 *  - Server-side validation of both fields before any lookup.
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`auth-sign-in:${ip}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  if (!isDatabaseAuth()) {
    return NextResponse.json({ code: "PROVIDER_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const email = (body as { email?: unknown } | null)?.email;
  const password = (body as { password?: unknown } | null)?.password;
  if (
    typeof email !== "string" ||
    email.length < 3 ||
    email.length > 254 ||
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 200
  ) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const account = await verifyCredentials(email, password);
  if (!account) {
    return NextResponse.json({ code: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  invalidateSessionProfileCache(account.id);
  const { token } = await createSession(
    account.id,
    req.headers.get("user-agent")
  );

  const res = NextResponse.json({ data: { ok: true }, error: null });
  setSessionCookie(res, token);
  return res;
}
