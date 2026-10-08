import { NextResponse } from "next/server";
import { getSessionUser, getActiveRoles, homeForRole } from "@/lib/auth-session";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Post-sign-in landing route, decided server-side from the role registry.
 * The client never asserts a role; this endpoint is the single source of the
 * redirect target. Generic 401 for no session.
 */
export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`auth-home:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const roles = await getActiveRoles(user.id);
  return NextResponse.json({ home: homeForRole(roles) });
}
