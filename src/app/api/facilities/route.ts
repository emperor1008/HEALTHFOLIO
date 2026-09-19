/**
 * Facilities list. Returns only genuine `facilities` rows — an empty list
 * when none exist. No fabricated facilities are ever returned.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("facilities")
    .select("id, name, timezone")
    .order("name", { ascending: true })
    .limit(100);
  if (error) {
    return NextResponse.json({ code: "LIST_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ facilities: data ?? [] });
}
