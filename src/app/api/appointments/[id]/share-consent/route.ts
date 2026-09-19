/**
 * Document share consent for a care request's appointment.
 *
 * - POST: patient grants consent listing the exact document IDs (server
 *   verifies each document belongs to the patient).
 * - DELETE: patient revokes future access — only before the consultation
 *   starts; audit history is preserved.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordMetric } from "@/lib/metrics/service";

export const dynamic = "force-dynamic";

const ConsentSchema = z.object({
  document_ids: z.array(z.string().uuid()).min(1).max(20),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
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
  const parsed = ConsentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("care_appointments")
    .select("id, care_request_id, patient_id, clinician_id, state")
    .eq("id", params.id)
    .maybeSingle();
  if (!appointment || appointment.patient_id !== user.id) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (appointment.state === "in_consultation" || appointment.state === "completed") {
    return NextResponse.json({ code: "CONSENT_LOCKED" }, { status: 409 });
  }

  // Server-side ownership verification of every document.
  const { data: owned } = await admin
    .from("documents")
    .select("id")
    .eq("user_id", user.id)
    .in("id", parsed.data.document_ids);
  if (!owned || owned.length !== parsed.data.document_ids.length) {
    return NextResponse.json({ code: "DOCUMENTS_NOT_OWNED" }, { status: 403 });
  }

  const { data: consent, error } = await admin
    .from("document_share_consents")
    .upsert(
      {
        care_request_id: appointment.care_request_id,
        patient_id: user.id,
        document_ids: parsed.data.document_ids,
        granted_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "care_request_id,patient_id" }
    )
    .select("id, document_ids, granted_at")
    .single();
  if (error) {
    return NextResponse.json({ code: "CONSENT_FAILED" }, { status: 500 });
  }

  recordMetric({
    event: "consent_granted",
    metadata: { documentCount: parsed.data.document_ids.length },
  });

  // Derive the time-limited clinician access grant from this consent.
  try {
    await admin.from("clinician_document_access").upsert(
      {
        care_request_id: appointment.care_request_id,
        clinician_profile_id: appointment.clinician_id,
        document_ids: parsed.data.document_ids,
        granted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        revoked_at: null,
      },
      { onConflict: "care_request_id,clinician_profile_id" }
    );
    await admin.from("clinician_document_access_audit").insert({
      care_request_id: appointment.care_request_id,
      clinician_profile_id: appointment.clinician_id,
      document_id: "00000000-0000-0000-0000-000000000000",
      event: "access_granted",
    });
  } catch {
    // grant derivation is best-effort; the consent itself is authoritative
  }

  return NextResponse.json({ code: "CONSENT_GRANTED", consent }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("care_appointments")
    .select("id, care_request_id, patient_id, clinician_id, state")
    .eq("id", params.id)
    .maybeSingle();
  if (!appointment || appointment.patient_id !== user.id) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (appointment.state === "in_consultation" || appointment.state === "completed") {
    return NextResponse.json({ code: "CONSENT_LOCKED" }, { status: 409 });
  }

  const { error } = await admin
    .from("document_share_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("care_request_id", appointment.care_request_id)
    .eq("patient_id", user.id)
    .is("revoked_at", null);
  if (error) {
    return NextResponse.json({ code: "REVOKE_FAILED" }, { status: 500 });
  }

  recordMetric({ event: "consent_revoked" });

  // Revoke the clinician's derived access grant at the same moment — future
  // access ends now; audit history is preserved.
  try {
    await admin
      .from("clinician_document_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("care_request_id", appointment.care_request_id)
      .is("revoked_at", null);
    const { data: profile } = await admin
      .from("clinician_profiles")
      .select("id")
      .eq("id", appointment.clinician_id)
      .maybeSingle();
    if (profile) {
      await admin.from("clinician_document_access_audit").insert({
        care_request_id: appointment.care_request_id,
        clinician_profile_id: profile.id,
        document_id: "00000000-0000-0000-0000-000000000000",
        event: "access_revoked",
      });
    }
  } catch {
    // derived-access revoke is best-effort; consent revoke above is authoritative
  }

  return NextResponse.json({ code: "CONSENT_REVOKED" }, { status: 200 });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("care_appointments")
    .select("id, care_request_id, patient_id, clinician_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  // Patient owner or the assigned clinician may read consent state.
  const isPatient = appointment.patient_id === user.id;
  let isClinician = false;
  if (!isPatient) {
    const { data: profile } = await admin
      .from("clinician_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    isClinician = Boolean(profile && profile.id === appointment.clinician_id);
  }
  if (!isPatient && !isClinician) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }
  const { data: consent } = await admin
    .from("document_share_consents")
    .select("id, document_ids, granted_at, revoked_at, consent_version")
    .eq("care_request_id", appointment.care_request_id)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ consent: consent ?? null });
}
