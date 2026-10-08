import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Route proxy (Next.js 16 convention) guarding the Better Auth session.
 *
 * - Uses Better Auth's cookie-presence check (fast, no DB call). Full session
 *   validation, role checks, ownership, and consent happen in every server
 *   page/route — this proxy is only the outer gate.
 * - Signed-out users hitting a protected route go to /sign-in (no anonymous
 *   bootstrap anymore).
 * - Signed-in users never see /sign-in or /register again.
 * - The cookie presence check is deliberately optimistic: a stale cookie
 *   simply renders an app shell whose data calls 401 and surfaces the calm
 *   signed-out state; it can never grant access.
 * - Public static assets (service worker, PWA manifest, icons) are excluded in
 *   the matcher below. Gating them broke the offline layer in production: the
 *   browser refuses a service worker script behind a redirect, so registration
 *   silently failed and the whole offline cache never installed.
 */

// Exported for the regression test that guards the PWA asset routes.
export const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/doctor/apply",
  "/access-denied",
  // The offline fallback must render for signed-out visitors too: the
  // service worker precaches it, and a redirect would cache sign-in HTML
  // as the offline page.
  "/offline",
];

const AUTH_PAGES = ["/sign-in", "/register", "/forgot-password", "/reset-password"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes answer for themselves: every route handler verifies the Better
  // Auth session server-side and returns JSON 401/403/503 (never a redirect).
  // Redirecting /api/* to an HTML sign-in page would break the offline sync
  // engine and every programmatic client — and Better Auth's own credential
  // endpoints must be reachable by signed-out users.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const hasSession = Boolean(getSessionCookie(request));

  const isAuthPage = AUTH_PAGES.some((p) => pathname === p);
  const isPublic = PUBLIC_ROUTES.some((p) => pathname === p) || isAuthPage;

  if (isPublic) {
    // Signed-in users skip the auth pages.
    if (hasSession && isAuthPage) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Every other route requires a session cookie.
  if (!hasSession) {
    const redirectUrl = new URL("/sign-in", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Never gate static public assets. `/sw.js` in particular MUST be served
    // directly: a redirect makes service-worker registration fail outright.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|branding/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|webmanifest)$).*)",
  ],
};
