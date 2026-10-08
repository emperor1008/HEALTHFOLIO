import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/user-context";
import { getSessionUser } from "@/lib/auth-session";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Short-lived signed URL for a private medical document.
 *
 * Authorization chain (all server-side):
 *   1. valid Better Auth session;
 *   2. the document row must belong to the session user (ownership filter);
 *   3. the storage object path is derived from the verified row, never from
 *      client input.
 *
 * Consent-scoped clinician access continues to flow through the dedicated
 * clinician-access route, which validates share grants before delegating to
 * the same storage mechanism.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const rl = hit(`signed-url:${user.id}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }

  // Ownership-verified read; unauthenticated users can never reach this.
  // `storage_path` is the canonical object key written by the upload routes
  // (`{user_id}/{portfolio_id}/{document_id}/{filename}`); it is read from the
  // verified row and never reconstructed from client-visible fields.
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, original_name, user_id, storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }
  if (!doc) {
    // Do not distinguish "not found" from "not yours".
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const { data, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60);

  if (signError || !data) {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: 60 });
}
