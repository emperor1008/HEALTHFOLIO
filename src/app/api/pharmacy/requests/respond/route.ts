import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { AvailabilityResponseSchema } from "@/lib/pharmacy/schemas";
import { getPharmacyMemberships } from "@/lib/pharmacy/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = AvailabilityResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const input = parsed.data;
  const admin = await createAdminClient();

  // Load request, then verify membership against ITS pharmacy.
  const { data: request } = await admin
    .from("pharmacy_availability_requests")
    .select("id, pharmacy_id, status")
    .eq("id", input.requestId)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  }

  const memberships = await getPharmacyMemberships(user.id);
  if (!memberships.some((m) => m.pharmacyId === request.pharmacy_id)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  // Idempotency: duplicate response with same key is a no-op.
  const { data: existing } = await admin
    .from("pharmacy_availability_responses")
    .select("id")
    .eq("request_id", input.requestId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, responseId: existing.id });
  }

  const { data: inserted, error: insertErr } = await admin
    .from("pharmacy_availability_responses")
    .insert({
      request_id: input.requestId,
      pharmacy_id: request.pharmacy_id,
      responder_id: user.id,
      response: input.response,
      note_for_patient: input.noteForPatient ?? null,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Mark request responded + audit.
  await admin
    .from("pharmacy_availability_requests")
    .update({ status: "responded", updated_at: new Date().toISOString() })
    .eq("id", input.requestId);

  await admin.from("pharmacy_audit_events").insert({
    pharmacy_id: request.pharmacy_id,
    actor_id: user.id,
    event: "availability_responded",
    metadata: { requestId: input.requestId, response: input.response, responseId: inserted.id },
  });

  return NextResponse.json({ ok: true, responseId: inserted.id, duplicate: false });
}
