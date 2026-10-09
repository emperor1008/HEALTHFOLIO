import { NextResponse } from "next/server";
import { getSessionUser, getActiveRoles } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — the current session for the browser.
 *
 * The client `useSession()` hook normally reads the identity SDK's local
 * state. When no client SDK is configured (database-backed auth, preview
 * mode) there is nothing local to read, so the hook asks this endpoint
 * instead — the SERVER stays the only authority on who is signed in.
 *
 * Returns 401 when there is no session, so a signed-out page and a
 * signed-out browser tab look the same.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    }
    const roles = await getActiveRoles(user.id);
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        activeRoles: roles,
      },
    });
  } catch {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
}
