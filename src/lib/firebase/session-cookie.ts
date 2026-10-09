/**
 * The `__session` cookie — Firebase session-cookie plumbing shared by the
 * auth routes (set/clear) and the session resolver (read).
 *
 * Mirrors the old Better Auth cookie posture: HttpOnly (the JS SDK never
 * needs it — it holds its own ID token), SameSite=Lax, Secure in
 * production, path=/, 7-day expiry matching Firebase's maximum session
 * cookie lifetime.
 */
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7d — Firebase session-cookie maximum

const BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Attach a freshly minted session cookie to a response. */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, { ...BASE, maxAge: SESSION_MAX_AGE_SECONDS });
}

/** Expire the session cookie (sign-out / account deletion). */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...BASE, maxAge: 0 });
}

/**
 * Extract the raw `__session` value from a Cookie header.
 * Returns null when absent — callers treat that as signed-out.
 */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}
