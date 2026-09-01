/**
 * GET /api/routines — List medication routines for current user.
 * POST /api/routines — Create a medication plan from a verified prescription.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export async function GET(_request: NextRequest) {
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

  const admin = createAdminClient();

  // Get today's date boundaries in user's timezone
  const today = new Date().toISOString().split("T")[0];

  // Get active plans with upcoming occurrences
  const { data: plans } = await admin
    .from("medication_plans")
    .select("*, prescription_items!inner(medicine_name, dose_text, instruction_text)")
    .eq("user_id", user.id)
    .in("status", ["active", "paused", "review_required"])
    .order("created_at", { ascending: false });

  // Get today's occurrences
  const { data: todayOccurrences } = await admin
    .from("medication_occurrences")
    .select("*, medication_plans(display_name, source_instruction)")
    .eq("user_id", user.id)
    .gte("due_window_start", `${today}T00:00:00`)
    .lte("due_window_end", `${today}T23:59:59`)
    .not("status", "in", "(cancelled,invalidated)")
    .order("scheduled_for", { ascending: true });

  // Get plans needing review
  const reviewPlans = (plans || []).filter((p) => p.status === "review_required");
  const activePlans = (plans || []).filter((p) => p.status === "active");
  const pausedPlans = (plans || []).filter((p) => p.status === "paused");

  return NextResponse.json({
    data: {
      today: todayOccurrences || [],
      activePlans,
      pausedPlans,
      reviewPlans,
      totalActive: activePlans.length,
      totalNeedsReview: reviewPlans.length,
    },
  });
}

const createPlanSchema = z.object({
  prescriptionItemId: z.string().uuid(),
  displayInstruction: z.string().min(1),
  planType: z.enum([
    "fixed_times", "times_per_day", "interval", "specific_weekdays",
    "date_range", "course_duration", "tapering", "as_needed", "one_time", "unclear",
  ]),
  timezone: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timeSlots: z.array(z.object({
    localTime: z.string(),
    sourceType: z.enum(["prescription", "user_selected", "system_suggested"]),
  })),
});

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const parsed = createPlanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid plan parameters" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { prescriptionItemId, displayInstruction, planType, timezone, startDate, endDate, timeSlots } = parsed.data;

  // Verify prescription item ownership
  const { data: item } = await admin
    .from("prescription_items")
    .select("id, user_id, document_id, medicine_name")
    .eq("id", prescriptionItemId)
    .eq("user_id", user.id)
    .single();

  if (!item) {
    return NextResponse.json(
      { error: { code: "PRESCRIPTION_NOT_FOUND", message: "Prescription item not found" } },
      { status: 404 }
    );
  }

  // Get portfolio ID
  const { data: portfolio } = await admin
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!portfolio) {
    return NextResponse.json(
      { error: { code: "PORTFOLIO_REQUIRED", message: "Portfolio not found" } },
      { status: 400 }
    );
  }

  // Create plan
  const planId = crypto.randomUUID();
  const { error: planError } = await admin.from("medication_plans").insert({
    id: planId,
    user_id: user.id,
    portfolio_id: portfolio.id,
    prescription_item_id: prescriptionItemId,
    document_id: item.document_id,
    display_name: item.medicine_name || displayInstruction,
    source_instruction: displayInstruction,
    plan_type: planType,
    status: "proposed",
    timezone,
    start_date: startDate || new Date().toISOString().split("T")[0],
    end_date: endDate || null,
    confidence: 0.8,
    requires_review: true,
  });

  if (planError) {
    return NextResponse.json(
      { error: { code: "DATABASE_WRITE_FAILED", message: "Could not create plan" } },
      { status: 500 }
    );
  }

  // Create schedule rules
  for (const slot of timeSlots) {
    await admin.from("medication_schedule_rules").insert({
      user_id: user.id,
      medication_plan_id: planId,
      rule_type: "fixed_times",
      local_time: slot.localTime,
      source_type: slot.sourceType,
      user_confirmed: slot.sourceType === "user_selected",
    });
  }

  return NextResponse.json({
    data: { planId, status: "proposed" },
  });
}
