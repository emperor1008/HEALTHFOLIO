/**
 * Consent-gated clinician document access (Part 3).
 *
 * GET /api/clinician/documents?careRequestId=...&documentId=...
 *
 * A clinician may open a document ONLY when ALL of the following hold:
 *  - they are the assigned clinician on that care request (server-verified);
 *  - an active (non-revoked, unexpired) document_share_consents row covers
 *    that exact document id for that exact care request;
 *  - the access grant window (clinician_document_access) is still valid.
 *
 * Returns a SHORT-LIVED signed URL (5 minutes) from the existing private
 * storage bucket. Documents are never made public. Every access is audited.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const careRequestId = searchParams.get("careRequestId");
  const documentId = searchParams.get("documentId");
  if (!careRequestId || !documentId) {
    return NextResponse.json({ code: "INVALID_PARAMS" }, { status: 400 });
  }

  const admin = await createAdminClient();

  // 1) The requester must be a clinician with an active assignment.
  const { data: profile } = await admin
    .from("clinician_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ code: "STAFF_ACCESS_NOT_CONFIGURED" }, { status: 403 });
  }

  const { data: assignment } = await admin
    .from("care_request_assignments")
    .select("id, state")
    .eq("care_request_id", careRequestId)
    .eq("clinician_id", profile.id)
    .in("state", ["assigned", "accepted"])
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json({ code: "NOT_ASSIGNED" }, { status: 403 });
  }

  // 2) An active consent from the patient must cover THIS document.
  const { data: consent } = await admin
    .from("document_share_consents")
    .select("id, document_ids, revoked_at")
    .eq("care_request_id", careRequestId)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!consent || !(consent.document_ids as string[]).includes(documentId)) {
    return NextResponse.json({ code: "NO_ACTIVE_CONSENT" }, { status: 403 });
  }

  // 3) The time-limited access grant must still be valid.
  const { data: grant } = await admin
    .from("clinician_document_access")
    .select("id, expires_at, revoked_at")
    .eq("care_request_id", careRequestId)
    .eq("clinician_profile_id", profile.id)
    .maybeSingle();
  if (
    !grant ||
    grant.revoked_at ||
    new Date(grant.expires_at as string).getTime() < Date.now()
  ) {
    return NextResponse.json({ code: "ACCESS_EXPIRED" }, { status: 403 });
  }

  // 4) The document must exist and belong to the request's patient.
  const { data: careRequest } = await admin
    .from("care_requests")
    .select("user_id")
    .eq("id", careRequestId)
    .maybeSingle();
  if (!careRequest) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  const { data: document } = await admin
    .from("documents")
    .select("id, user_id, storage_path, file_name, mime_type")
    .eq("id", documentId)
    .eq("user_id", careRequest.user_id)
    .maybeSingle();
  if (!document) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

  // 5) Short-lived signed URL from private storage — never public.
  const { data: signed } = await admin.storage
    .from("documents")
    .createSignedUrl(document.storage_path as string, SIGNED_URL_TTL_SECONDS);
  if (!signed) {
    return NextResponse.json({ code: "SIGNING_FAILED" }, { status: 500 });
  }

  // 6) Audit the access (append-only).
  try {
    await admin.from("clinician_document_access_audit").insert({
      care_request_id: careRequestId,
      clinician_profile_id: profile.id,
      document_id: documentId,
      event: "document_opened",
    });
  } catch {
    // audit best-effort
  }

  return NextResponse.json(
    {
      code: "OK",
      document: { id: document.id, file_name: document.file_name, mime_type: document.mime_type },
      signedUrl: signed.signedUrl,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    },
    { status: 200 }
  );
}
