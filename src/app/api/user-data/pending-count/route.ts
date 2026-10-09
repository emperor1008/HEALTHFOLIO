import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/user-context";
import { getSessionUser } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

/** Count of the signed-in user's documents with pending extractions. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }

  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("processing_status", "review_required")
    .is("invalidated_at", null);

  if (error) {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
