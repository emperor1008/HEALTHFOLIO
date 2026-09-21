/** Profile API — language + contact preference updates (queued-write safe). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { lookupIdempotentResponse, storeIdempotentResponse } from "@/lib/api/idempotency";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  preferred_language: z.enum(["en", "hi", "or"]).optional(),
  preferred_contact_method: z.enum(["in_app", "phone", "email"]).optional(),
});

export async function PATCH(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
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
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ code: "SAVE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ code: "UPDATED" });
}
