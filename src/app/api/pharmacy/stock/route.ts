import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { StockUpdateSchema } from "@/lib/pharmacy/schemas";
import { getPharmacyMemberships } from "@/lib/pharmacy/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordMetric } from "@/lib/metrics/service";

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

  const parsed = StockUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const input = parsed.data;

  // Server-side membership check — the client can never assert pharmacy role.
  const memberships = await getPharmacyMemberships(user.id);
  if (!memberships.some((m) => m.pharmacyId === input.pharmacyId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Idempotency: if this exact key already recorded for (pharmacy, medicine),
  // return the existing event (HTTP 200, same shape) — no duplicate event.
  const { data: existing } = await admin
    .from("pharmacy_stock_events")
    .select("id")
    .eq("pharmacy_id", input.pharmacyId)
    .eq("medicine_id", input.medicineId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, eventId: existing.id });
  }

  const { data: inserted, error: insertErr } = await admin
    .from("pharmacy_stock_events")
    .insert({
      pharmacy_id: input.pharmacyId,
      medicine_id: input.medicineId,
      medicine_label: input.medicineLabel,
      status: input.status,
      quantity_hint: input.quantityHint ?? null,
      show_quantity_to_patients: input.showQuantityToPatients,
      internal_note: input.internalNote ?? null,
      source: input.source,
      updated_by: user.id,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Append-only audit (safe metadata only — no patient health data exists here).
  await admin.from("pharmacy_audit_events").insert({
    pharmacy_id: input.pharmacyId,
    actor_id: user.id,
    event: "stock_updated",
    metadata: {
      medicineId: input.medicineId,
      status: input.status,
      source: input.source,
      eventId: inserted.id,
    },
  });

  recordMetric({ event: "pharmacy_status_updated", metadata: { status: input.status } });

  return NextResponse.json({ ok: true, eventId: inserted.id, duplicate: false });
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const memberships = await getPharmacyMemberships(user.id);
  if (memberships.length === 0) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  // "me" resolves to the caller's single membership — the console never needs
  // to know its pharmacy id a priori, and a client-supplied foreign id stays 403.
  const requested = req.nextUrl.searchParams.get("pharmacyId");
  const pharmacyId =
    !requested || requested === "me"
      ? memberships.length === 1
        ? memberships[0].pharmacyId
        : memberships[0].pharmacyId
      : requested;

  if (!memberships.some((m) => m.pharmacyId === pharmacyId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pharmacy_stock_events")
    .select(
      "id, medicine_id, medicine_label, status, quantity_hint, show_quantity_to_patients, internal_note, server_recorded_at",
    )
    .eq("pharmacy_id", pharmacyId)
    .order("server_recorded_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  return NextResponse.json({ events: data ?? [] });
}
