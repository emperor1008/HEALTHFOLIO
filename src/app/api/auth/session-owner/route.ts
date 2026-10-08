import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

/**
 * Returns the id of the current Better Auth session user, or null.
 * Used by the offline queue to bind items to the exact account that created
 * them (never "whoever signs in next"). Exposes only an opaque UUID — no
 * email, name, or role.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json({ userId: user?.id ?? null });
  } catch {
    return NextResponse.json({ userId: null });
  }
}
