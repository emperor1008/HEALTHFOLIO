/**
 * Centralized authentication helper — Better Auth edition.
 *
 * The platform's 47 API routes previously resolved Supabase auth sessions via
 * `getUser()`. Better Auth now owns sessions; the same seam resolves the
 * Better Auth session cookie server-side. Call sites are unchanged:
 *
 *   const user = await getUser();
 *   if (!user) return 401;
 *
 * The user id is a UUID (Better Auth runs with generateId: "uuid"), matching
 * every medical-table `user_id` foreign key.
 *
 * Server-only: reads HTTP-only cookies via Better Auth. Never import from a
 * client component.
 */
import { getSessionUser } from "@/lib/auth-session";

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Get the current user from the Better Auth session.
 * Returns null only if no valid session exists.
 */
export async function getUser(): Promise<AuthUser | null> {
  const session = await getSessionUser();
  if (!session) return null;
  return { id: session.id, email: session.email };
}
