/**
 * Consultation messages for one appointment thread.
 *
 * - GET: participants only (patient owner / assigned clinician).
 * - POST: participants only; the offline queue replays with the same
 *   Idempotency-Key, so duplicates collapse to one row.
 * - "Delivered" is only ever stamped by this server route — the client never
 *   marks its own message delivered.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  client_created_at: z.string().datetime(),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("care_appointments")
    .select("id, patient_id, clinician_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

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

  const { data, error } = await admin
    .from("consultation_messages")
    .select("id, sender_id, sender_role, body, client_created_at, delivered_at, created_at")
    .eq("appointment_id", params.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    return NextResponse.json({ code: "LIST_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const idempotencyKey = req.headers.get("idempotency-key");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = MessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("care_appointments")
    .select("id, patient_id, clinician_id, state")
    .eq("id", params.id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

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

  // Simple rate limit: at most 30 messages per minute per sender+thread.
  const { data: recent } = await admin
    .from("consultation_messages")
    .select("id, created_at")
    .eq("appointment_id", params.id)
    .eq("sender_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const oneMinuteAgo = Date.now() - 60_000;
  const recentCount = (recent ?? []).filter(
    (m) => new Date((m as { created_at: string }).created_at).getTime() > oneMinuteAgo
  ).length;
  if (recentCount >= 30) {
    return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  }

  // Idempotency: replay-safe duplicate insert.
  if (idempotencyKey) {
    const { data: dupe } = await admin
      .from("consultation_messages")
      .select("id")
      .eq("appointment_id", params.id)
      .eq("sender_id", user.id)
      .eq("client_created_at", parsed.data.client_created_at)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json({ code: "DELIVERED", message: dupe }, { status: 200 });
    }
  }

  const role = isPatient ? "patient" : "clinician";
  const { data: message, error } = await admin
    .from("consultation_messages")
    .insert({
      appointment_id: params.id,
      sender_id: user.id,
      sender_role: role,
      body: parsed.data.body,
      client_created_at: parsed.data.client_created_at,
      delivered_at: new Date().toISOString(),
    })
    .select("id, client_created_at, delivered_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ code: "DELIVERED" }, { status: 200 });
    }
    return NextResponse.json({ code: "SEND_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ code: "DELIVERED", message }, { status: 201 });
}
