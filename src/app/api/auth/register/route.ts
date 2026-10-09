import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { provisionIdentity } from "@/lib/firebase/provision";
import { RegisterSchema } from "@/lib/auth/schemas";
import { hit } from "@/lib/api/rate-limit";
import { registerAccount, createSession } from "@/lib/auth/db-auth";
import { isDatabaseAuth } from "@/lib/auth/provider";
import { setSessionCookie } from "@/lib/firebase/session-cookie";
import { invalidateSessionProfileCache } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

/**
 * Patient registration (Firebase Edition).
 *
 * The auth user is created SERVER-SIDE with `crypto.randomUUID()` as the uid
 * (spec amendment — see provision.ts): Firebase uids must be UUIDs so one id
 * works across Firebase Auth, Firestore, and every Postgres `user.id`/medical
 * FK until P2. The response carries a custom token the client exchanges for
 * a signed-in SDK session, then for the `__session` cookie via
 * POST /api/auth/session.
 *
 * Flow:  POST /api/auth/register → { customToken }
 *          └─ validates RegisterSchema (same client schema, now enforced
 *             server-side too) → creates auth user → provisions identity
 *            (users/{uid} doc + P1-TEMP PG bridge) → mints custom token
 *
 * A legacy Better-Auth row owning the same email rolls the new user back and
 * answers 422 (fresh-start wrinkle, Section D of the P1 spec).
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`auth-register:${ip}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  // ── Database provider (default when Firebase is not configured) ──
  // Same schema, same field set, same error codes as the Firebase path — only
  // where the account lives changes. The session cookie is issued right here,
  // so the client is signed in after registering without a token exchange.
  if (isDatabaseAuth()) {
    const result = await registerAccount({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.name,
    });
    if (!result.ok) {
      if (result.code === "EMAIL_TAKEN") {
        return NextResponse.json(
          { code: "EMAIL_ALREADY_EXISTS" },
          { status: 422 },
        );
      }
      return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
    }
    invalidateSessionProfileCache(result.account.id);
    const { token } = await createSession(
      result.account.id,
      req.headers.get("user-agent"),
    );
    const res = NextResponse.json({
      data: { ok: true, userId: result.account.id },
      error: null,
    });
    setSessionCookie(res, token);
    return res;
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { code: "SERVER_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const auth = getAdminAuth();
  let uid: string;
  try {
    uid = randomUUID();
    await auth.createUser({
      uid,
      email,
      password: parsed.data.password,
      displayName: parsed.data.name,
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "auth/email-already-in-use") {
      return NextResponse.json(
        { code: "EMAIL_ALREADY_EXISTS" },
        { status: 422 },
      );
    }
    if (code === "auth/invalid-email" || code === "auth/weak-password") {
      return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
    }
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }

  try {
    const result = await provisionIdentity(uid, {
      name: parsed.data.name,
      dob: parsed.data.dob,
      gender: parsed.data.gender,
      region: parsed.data.region,
      consent: parsed.data.consent,
    });
    if (result.pgEmailConflict) {
      // Legacy row owns this email — roll back so the Firebase account can
      // never exist without a valid identity bridge (fresh-start decision).
      try {
        await auth.deleteUser(uid);
      } catch {
        // Best-effort rollback; a leaked auth user with no doc/roles is inert.
      }
      return NextResponse.json(
        { code: "EMAIL_ALREADY_EXISTS" },
        { status: 422 },
      );
    }

    const customToken = await auth.createCustomToken(uid);
    return NextResponse.json({
      data: { customToken },
      error: null,
    });
  } catch {
    // Auth user exists but provisioning failed hard (e.g. Firestore down) —
    // roll back rather than leave a half-created account.
    try {
      await auth.deleteUser(uid);
    } catch {
      // Best-effort rollback.
    }
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
