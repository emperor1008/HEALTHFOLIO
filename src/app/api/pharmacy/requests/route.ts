import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { AvailabilityRequestSchema } from "@/lib/pharmacy/schemas";
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

  const parsed = AvailabilityRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const input = parsed.data;
  const admin = createAdminClient();

  // Pharmacy must exist and be verified — patients cannot message unverified ones.
  const { data: pharmacy } = await admin
    .from("pharmacies")
    .select("id, verification_state")
    .eq("id", input.pharmacyId)
    .eq("verification_state", "verified")
    .maybeSingle();

  if (!pharmacy) {
    return NextResponse.json({ error: "pharmacy_unavailable" }, { status: 404 });
  }

  // Idempotency: same patient + same key returns the original request.
  const { data: existing } = await admin
    .from("pharmacy_availability_requests")
    .select("id, status")
    .eq("patient_id", user.id)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, requestId: existing.id, status: existing.status });
  }

  const { data: inserted, error: insertErr } = await admin
    .from("pharmacy_availability_requests")
    .insert({
      patient_id: user.id,
      pharmacy_id: input.pharmacyId,
      medicine_id: input.medicineId,
      medicine_label: input.medicineLabel,
      strength: input.strength ?? null,
      form: input.form ?? null,
      language: input.language,
      idempotency_key: input.idempotencyKey,
    })
    .select("id, status")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, requestId: inserted.id, status: inserted.status, duplicate: false });
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pharmacy_availability_requests")
    .select(
      "id, pharmacy_id, medicine_label, strength, form, language, status, created_at, updated_at, pharmacy_availability_responses(response, note_for_patient, created_at)",
    )
    .eq("patient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  return NextResponse.json({ requests: data ?? [] });
}
