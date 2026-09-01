/**
 * PATCH /api/routines/occurrences/[id] — Record a user action on a medication occurrence.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["taken", "skipped", "snoozed", "not_now"]),
  clientTimezone: z.string(),
  clientRequestId: z.string().min(1),
  reason: z.string().optional(),
  snoozeMinutes: z.number().int().min(1).max(60).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const occurrenceId = params.id;
  const body = await request.json();
  const parsed = actionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid action parameters" } },
      { status: 400 }
    );
  }

  const { action, clientTimezone, clientRequestId, reason, snoozeMinutes } = parsed.data;
  const admin = createAdminClient();

  // Verify occurrence ownership
  const { data: occurrence } = await admin
    .from("medication_occurrences")
    .select("id, user_id, medication_plan_id, status, scheduled_for, due_window_end")
    .eq("id", occurrenceId)
    .eq("user_id", user.id)
    .single();

  if (!occurrence) {
    return NextResponse.json(
      { error: { code: "OCCURRENCE_NOT_FOUND", message: "Occurrence not found" } },
      { status: 404 }
    );
  }

  // Check for duplicate action (idempotency)
  const { data: existingEvent } = await admin
    .from("medication_adherence_events")
    .select("id")
    .eq("client_request_id", clientRequestId)
    .limit(1);

  if (existingEvent?.length) {
    return NextResponse.json({
      data: { occurrenceId, action, duplicated: true },
    });
  }

  // Map action to status and event type
  const statusMap: Record<string, { status: string; eventType: string }> = {
    taken: { status: "taken", eventType: "marked_taken" },
    skipped: { status: "skipped", eventType: "marked_skipped" },
    snoozed: { status: "snoozed", eventType: "snoozed" },
    not_now: { status: "scheduled", eventType: "marked_not_now" },
  };

  const mapping = statusMap[action];

  // Update occurrence
  const updateData: Record<string, unknown> = {
    status: mapping.status,
    updated_at: new Date().toISOString(),
  };

  if (action === "snoozed" && snoozeMinutes) {
    const newEnd = new Date(occurrence.due_window_end);
    newEnd.setMinutes(newEnd.getMinutes() + snoozeMinutes);
    updateData.due_window_end = newEnd.toISOString();
  }

  await admin
    .from("medication_occurrences")
    .update(updateData)
    .eq("id", occurrenceId);

  // Record adherence event
  await admin.from("medication_adherence_events").insert({
    user_id: user.id,
    medication_plan_id: occurrence.medication_plan_id,
    occurrence_id: occurrenceId,
    event_type: mapping.eventType,
    event_at: new Date().toISOString(),
    client_timezone: clientTimezone,
    optional_reason: reason || null,
    client_request_id: clientRequestId,
  });

  return NextResponse.json({
    data: { occurrenceId, action, status: mapping.status },
  });
}
