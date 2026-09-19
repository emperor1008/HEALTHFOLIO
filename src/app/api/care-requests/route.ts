/**
 * Care requests API — Part 1 draft foundation + Part 2 care-request packets.
 *
 * SAFETY
 * - Auth required; all rows scoped to the session user.
 * - Packet inputs are validated by the shared PacketSchema (Zod). Malformed
 *   or smuggled payloads (unknown concepts, invented rule IDs, missing
 *   emergency acknowledgement) are rejected.
 * - Linked documents are verified to belong to the requesting user BEFORE
 *   insert; a mismatch is rejected, never silently dropped.
 * - A triage_assessments audit row is written (no symptom text, no contact
 *   details). Best-effort: audit failure does not fail the user's request.
 * - Errors are generic codes; database internals are never echoed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { lookupIdempotentResponse, storeIdempotentResponse } from "@/lib/api/idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { PacketSchema } from "@/lib/triage/packet";

export const dynamic = "force-dynamic";

const CreateSchema = z
  .object({
    language: z.enum(["en", "hi", "or"]),
    reason: z.string().trim().min(1).max(1000).optional(),
    contact_method: z.enum(["in_app", "phone", "email"]).optional(),
    linked_document_ids: z.array(z.string().uuid()).max(20).default([]),
    client_created_at: z.string().datetime().optional(),
    /** Part 2 structured packet. When present, `reason` comes from packet.summary. */
    packet: PacketSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.packet && !v.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "REASON_REQUIRED" });
    }
  });

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const idempotencyKey = req.headers.get("idempotency-key");

  try {
    const replay = await lookupIdempotentResponse<unknown>(
      user.id,
      "care-requests:POST",
      idempotencyKey
    );
    if (replay) {
      return NextResponse.json(replay.response, { status: 201 });
    }
  } catch {
    // lookup failure: proceed without replay (DB unique constraint still guards)
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const { packet } = parsed.data;
  const linkedIds = packet ? packet.linked_document_ids : parsed.data.linked_document_ids;

  const admin = createAdminClient();

  // ── Ownership check for every linked document (server-verified) ──────────
  if (linkedIds.length > 0) {
    const { data: owned, error: ownErr } = await admin
      .from("documents")
      .select("id")
      .eq("user_id", user.id)
      .in("id", linkedIds);
    if (ownErr || !owned || owned.length !== linkedIds.length) {
      return NextResponse.json({ code: "LINKED_DOCUMENTS_NOT_OWNED" }, { status: 403 });
    }
  }

  const insert: Record<string, unknown> = {
    user_id: user.id,
    preferred_language: parsed.data.language,
    preferred_contact_method: parsed.data.contact_method ?? "in_app",
    status: "draft",
    idempotency_key: idempotencyKey ?? crypto.randomUUID(),
    client_created_at: parsed.data.client_created_at ?? new Date().toISOString(),
  };

  if (packet) {
    insert.reason = packet.summary;
    insert.linked_document_ids = packet.linked_document_ids;
    insert.packet_id = packet.packet_id;
    insert.symptom_text_original = packet.symptom_text_original;
    insert.symptom_concepts = packet.symptom_concepts;
    insert.body_area = packet.body_area;
    insert.symptom_category = packet.symptom_category;
    insert.follow_up_answers = packet.follow_up_answers;
    insert.age_group = packet.age_group;
    insert.triage_category = packet.triage_category;
    insert.triage_rules_version = packet.triage_rules_version;
    insert.triage_rule_ids = packet.triage_rule_ids;
    insert.acknowledged_emergency_guidance = packet.acknowledged_emergency_guidance;
    insert.summary = packet.summary;
  } else {
    insert.reason = parsed.data.reason!;
  }

  const { data, error: insertError } = await admin
    .from("care_requests")
    .insert(insert)
    .select("id, status, created_at, packet_id, triage_category")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Concurrent duplicate: fetch and return the original row.
      const { data: existing } = await admin
        .from("care_requests")
        .select("id, status, created_at, packet_id, triage_category")
        .eq("user_id", user.id)
        .eq("idempotency_key", insert.idempotency_key as string)
        .maybeSingle();
      if (existing) {
        const body = { code: "CREATED", careRequest: existing };
        await storeIdempotentResponse(user.id, "care-requests:POST", idempotencyKey, 201, body);
        return NextResponse.json(body, { status: 201 });
      }
    }
    return NextResponse.json({ code: "SAVE_FAILED" }, { status: 500 });
  }

  // ── Append-only audit (no symptom text / contact details). Best-effort. ──
  if (packet) {
    try {
      await admin.from("triage_assessments").insert({
        user_id: user.id,
        care_request_id: data.id,
        rules_version: packet.triage_rules_version,
        triage_category: packet.triage_category,
        rule_ids: packet.triage_rule_ids,
        concepts: packet.symptom_concepts,
        follow_up_answers: packet.follow_up_answers,
        age_group: packet.age_group,
        ack_state: packet.acknowledged_emergency_guidance,
      });
    } catch {
      // audit must never block the user's saved request
    }
  }

  const responseBody = { code: "CREATED", careRequest: data };
  await storeIdempotentResponse(user.id, "care-requests:POST", idempotencyKey, 201, responseBody);
  return NextResponse.json(responseBody, { status: 201 });
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error: listError } = await admin
    .from("care_requests")
    .select(
      "id, reason, preferred_language, preferred_contact_method, status, created_at, client_created_at, packet_id, triage_category, triage_rule_ids, symptom_concepts, summary"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (listError) {
    return NextResponse.json({ code: "LIST_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ careRequests: data ?? [] });
}
