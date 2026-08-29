/**
 * Centralized authentication helper.
 *
 * Uses Supabase Anonymous Sign-In for seamless, passwordless access.
 * Every API route should use getUser() to get the authenticated user.
 */

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Get the current user from the server-side Supabase session.
 * Returns null only if no valid session exists.
 *
 * Use in API routes (server-side) where cookies() is available.
 */
export async function getUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch {
              // Called from Server Component — ignore
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: "", ...options });
            } catch {
              // Called from Server Component — ignore
            }
          },
        },
      }
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;

    return { id: user.id, email: user.email ?? "" };
  } catch {
    return null;
  }
}
