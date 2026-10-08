import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/user-context";
import { getSessionUser } from "@/lib/auth-session";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
});

/** Update the signed-in user's profile display name (ownership server-forced). */
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const rl = hit(`profile-name:${user.id}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.display_name })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ code: "SAVE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ code: "UPDATED" });
}
