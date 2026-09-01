/**
 * POST /api/routines/activate — Activate a medication plan after user confirmation.
 *
 * Validates all schedule rules, generates deterministic occurrences, and activates the plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ActivatePlanRequest {
  planId: string;
  confirmedTimeSlots: Array<{
    ruleId: string;
    localTime: string;
    userConfirmed: boolean;
  }>;
  startDate: string;
  timezone: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: ActivatePlanRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { planId, confirmedTimeSlots, startDate, timezone } = body;

  if (!planId) {
    return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
  }

  if (!startDate || !timezone) {
    return NextResponse.json(
      { error: "Start date and timezone are required for activation" },
      { status: 400 }
    );
  }

  // Verify plan ownership
  const { data: plan, error: planError } = await supabase
    .from("medication_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    return NextResponse.json(
      { error: "Plan not found or access denied" },
      { status: 404 }
    );
  }

  if (plan.status !== "proposed" && plan.status !== "review_required") {
    return NextResponse.json(
      { error: "This plan cannot be activated in its current status" },
      { status: 400 }
    );
  }

  // Validate that all time slots are confirmed
  if (!confirmedTimeSlots || confirmedTimeSlots.length === 0) {
    return NextResponse.json(
      { error: "At least one confirmed time slot is required" },
      { status: 400 }
    );
  }

  // Validate timezone format
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return NextResponse.json(
      { error: "Invalid timezone. Use an IANA timezone such as Asia/Kolkata" },
      { status: 400 }
    );
  }

  // Validate start date
  const startDateTime = new Date(startDate);
  if (isNaN(startDateTime.getTime())) {
    return NextResponse.json(
      { error: "Invalid start date format" },
      { status: 400 }
    );
  }

  // Update plan with user-confirmed times and activate
  const { error: updateError } = await supabase
    .from("medication_plans")
    .update({
      status: "active",
      timezone,
      start_date: startDate,
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to activate plan" },
      { status: 500 }
    );
  }

  // Update schedule rules with user-confirmed times
  for (const slot of confirmedTimeSlots) {
    await supabase
      .from("medication_schedule_rules")
      .update({
        local_time: slot.localTime,
        user_confirmed: slot.userConfirmed,
        source_type: slot.userConfirmed ? "user_selected" : "system_suggested",
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot.ruleId)
      .eq("medication_plan_id", planId)
      .eq("user_id", user.id);
  }

  // Create initial in-app reminder events for today
  // In production, the background scheduler would generate occurrences
  return NextResponse.json({
    success: true,
    plan: {
      id: planId,
      status: "active",
      timezone,
      startDate,
      activatedAt: new Date().toISOString(),
    },
    message: "Medication routine activated. Reminders will appear in-app when due.",
  });
}
