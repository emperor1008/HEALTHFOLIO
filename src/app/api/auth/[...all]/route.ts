import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";

/**
 * Canonical Better Auth App Router handler (better-auth/next-js).
 *
 * All credential endpoints live under /api/auth/*:
 *   POST /api/auth/sign-up/email        — patient registration
 *   POST /api/auth/sign-in/email        — sign in
 *   POST /api/auth/sign-out             — sign out (invalidates server session)
 *   POST /api/auth/forgot-password      — begin password reset
 *   POST /api/auth/reset-password       — complete password reset (invalidates sessions)
 *
 * SECURITY:
 * - No secret value is ever returned or logged.
 * - When the server is missing DATABASE_URL / BETTER_AUTH_SECRET, every
 *   endpoint answers a generic 503 — the platform is truthfully unavailable
 *   rather than exposing a stack trace or pretending to work.
 * - Rate limiting is applied inside Better Auth (see src/lib/auth.ts).
 */
export async function GET(request: Request) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "AUTH_NOT_CONFIGURED", message: "Authentication is temporarily unavailable." },
      { status: 503 }
    );
  }
  return toNextJsHandler(auth).GET(request);
}

export async function POST(request: Request) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "AUTH_NOT_CONFIGURED", message: "Authentication is temporarily unavailable." },
      { status: 503 }
    );
  }
  return toNextJsHandler(auth).POST(request);
}
