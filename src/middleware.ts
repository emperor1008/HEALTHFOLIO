import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware that protects application routes using Supabase anonymous auth.
 *
 * Flow:
 * - "/" redirects to bootstrap which creates an anonymous session
 * - Bootstrap is public (no session required)
 * - Protected pages require a valid Supabase session
 * - Missing session → redirect to bootstrap (not a login page)
 */

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // If Supabase is not configured, allow all requests through
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public routes that don't need a session
  const publicRoutes = ["/", "/auth/bootstrap", "/auth/callback"];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith("/auth/")
  );

  // Root "/" always goes to bootstrap to check/create session
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/auth/bootstrap", request.url));
  }

  // Protected routes require a valid session
  const protectedPrefixes = [
    "/dashboard",
    "/documents",
    "/timeline",
    "/preparation",
    "/prepare",
    "/runs",
    "/settings",
    "/consent",
    "/review",
    "/ask",
  ];
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Unauthenticated user on protected route → bootstrap (creates anonymous session)
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL("/auth/bootstrap", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
