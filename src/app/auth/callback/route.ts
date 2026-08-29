import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Validate redirect path: must start with /, not //, and not contain :// */
function sanitizeRedirect(next: string): string {
  if (
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("://") &&
    !next.startsWith("javascript:") &&
    !next.startsWith("data:")
  ) {
    return next;
  }
  return "/dashboard";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirect(searchParams.get("next") ?? "/dashboard");

  if (code) {
    let response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options });
            response = NextResponse.redirect(`${origin}${next}`);
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: "", ...options });
            response = NextResponse.redirect(`${origin}${next}`);
            response.cookies.set({ name, value: "", ...options });
          },
        },
      }
    );

    await supabase.auth.exchangeCodeForSession(code);

    return response;
  }

  // No code parameter — redirect to sign-in
  return NextResponse.redirect(`${origin}/sign-in`);
}
