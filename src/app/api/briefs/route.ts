import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import { getAIProvider } from "@/lib/ai/provider";

const createBriefSchema = z.object({
  portfolioId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = createBriefSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(createError("INVALID_REQUEST", "Invalid brief parameters"), requestId),
        { status: 400 }
      );
    }

    const { portfolioId, appointmentId } = parsed.data;

    const admin = createAdminClient();

    // Get verified events
    const { data: events } = await admin
      .from("medical_events")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", user.id)
      .order("event_date", { ascending: true });

    // Get appointment
    const { data: appointment } = appointmentId
      ? await admin
          .from("appointments")
          .select("*")
          .eq("id", appointmentId)
          .eq("user_id", user.id)
          .single()
      : await admin
          .from("appointments")
          .select("*")
          .eq("portfolio_id", portfolioId)
          .eq("user_id", user.id)
          .eq("status", "planned")
          .order("starts_at", { ascending: true })
          .limit(1)
          .single();

    // Get documents
    const { data: documents } = await admin
      .from("documents")
      .select("id, original_name, document_type, status")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", user.id);

    // Get goal from latest run
    const { data: runs } = await admin
      .from("agent_runs")
      .select("goal")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const goal = runs?.[0]?.goal || "Prepare for consultation";

    // Generate questions and checklist
    let questions: string[] = [];
    let checklist: string[] = [];
    let aiAvailable = true;

    try {
      const provider = getAIProvider();
      if (!provider.isConfigured()) {
        aiAvailable = false;
      } else {
        [questions, checklist] = await Promise.all([
          provider.generateQuestions(goal, events || [], appointment?.specialty),
          provider.generateChecklist(goal, events || []),
        ]);
      }
    } catch {
      aiAvailable = false;
    }

    // Build brief content
    const briefContent = {
      appointmentDetails: {
        date: appointment?.starts_at?.split("T")[0] || null,
        time: appointment?.starts_at?.split("T")[1]?.substring(0, 5) || null,
        timezone: appointment?.timezone || "Asia/Kolkata",
        specialty: appointment?.specialty || null,
        clinicianName: appointment?.clinician_name || null,
        location: appointment?.location || null,
      },
      goal,
      verifiedEvents: (events || [])
        .filter((e) => e.verification_status === "verified")
        .map((e) => ({
          date: e.event_date,
          type: e.event_type,
          title: e.title,
          description: e.description,
          sourceDocumentId: e.source_extraction_ids?.[0] || "",
          sourceDocumentName: "",
          pageNumber: 0,
        })),
      documentsIncluded: (documents || [])
        .filter((d) => d.status !== "failed" && d.status !== "excluded")
        .map((d) => ({ name: d.original_name, type: d.document_type })),
      documentsMissing: (documents || [])
        .filter((d) => d.status === "failed")
        .map((d) => d.original_name),
      questionsToDiscuss: questions,
      preparationChecklist: checklist,
      safetyDisclaimer:
        "Healthfolio organizes medical information and helps you prepare for consultations. It does not diagnose conditions, recommend treatment, or replace a healthcare professional.",
      generatedAt: new Date().toISOString(),
    };

    // Mark existing briefs as stale
    await admin
      .from("briefs")
      .update({ status: "stale" })
      .eq("portfolio_id", portfolioId)
      .eq("user_id", user.id)
      .eq("status", "approved");

    // Create new brief
    const { data: brief, error: briefError } = await admin
      .from("briefs")
      .insert({
        user_id: user.id,
        portfolio_id: portfolioId,
        appointment_id: appointmentId || appointment?.id || null,
        content: briefContent,
        status: "draft",
        version: 1,
      })
      .select("id")
      .single();

    if (briefError) {
      return NextResponse.json(
        formatErrorResponse(createError("INTERNAL_ERROR", "Could not generate brief"), requestId),
        { status: 500 }
      );
    }

    // Audit
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "brief_generated",
      resource_type: "brief",
      resource_id: brief.id,
    });

    return NextResponse.json({
      data: {
        briefId: brief.id,
        content: briefContent,
      },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Something went wrong"), requestId),
      { status: 500 }
    );
  }
}
