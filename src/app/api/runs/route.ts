import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const createRunSchema = z.object({
  goal: z.string().min(1).max(1000),
  appointment: z
    .object({
      startsAt: z.string(),
      timezone: z.string().default("Asia/Kolkata"),
      specialty: z.string().optional(),
      clinicianName: z.string().optional(),
      location: z.string().optional(),
    })
    .optional(),
  documentIds: z.array(z.string()).min(1),
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
    const parsed = createRunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", "Invalid run parameters"),
          requestId
        ),
        { status: 400 }
      );
    }

    const { goal, appointment, documentIds } = parsed.data;
    const admin = createClient();
    console.log("[runs] user.id:", user.id, "documentIds:", documentIds);

    // Get portfolio
    const { data: portfolios } = await admin
      .from("portfolios")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json(
        formatErrorResponse(
          createError("NOT_FOUND", "No portfolio found."),
          requestId
        ),
        { status: 404 }
      );
    }

    const portfolioId = portfolios[0].id;

    // Verify documents belong to user
    const { data: docs, error: docsError } = await admin
      .from("documents")
      .select("id, status, portfolio_id")
      .eq("user_id", user.id)
      .in("id", documentIds);

    if (docsError) {
      console.error("[runs] docs query error:", docsError.message, docsError.code);
    }

    // Verify all requested documents are accessible
    if (!docs || docs.length !== documentIds.length) {
      console.error("[runs] docs mismatch:", { requested: documentIds.length, found: docs?.length ?? 0, portfolioId, docPortfolioIds: docs?.map(d => d.portfolio_id) });
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", "One or more documents are not accessible."),
          requestId
        ),
        { status: 400 }
      );
    }

    // Verify consent before processing
    const { data: consent } = await admin
      .from("consents")
      .select("id")
      .eq("user_id", user.id)
      .eq("consent_type", "ai_processing")
      .is("revoked_at", null)
      .single();

    if (!consent) {
      return NextResponse.json(
        formatErrorResponse(
          createError("CONSENT_REQUIRED", "Please accept the privacy and AI-processing terms before starting document processing."),
          requestId
        ),
        { status: 403 }
      );
    }

    // Create appointment if provided
    let appointmentId: string | null = null;
    if (appointment) {
      const { data: appt } = await admin
        .from("appointments")
        .insert({
          user_id: user.id,
          portfolio_id: portfolioId,
          starts_at: appointment.startsAt,
          timezone: appointment.timezone,
          specialty: appointment.specialty || null,
          clinician_name: appointment.clinicianName || null,
          location: appointment.location || null,
          status: "planned",
        })
        .select("id")
        .single();
      appointmentId = appt?.id || null;
    }

    // Create agent run
    const maxSteps = parseInt(process.env.AGENT_MAX_STEPS || "12");
    const maxRetries = parseInt(process.env.AGENT_MAX_RETRIES || "2");

    const initialState = {
      runId: "",
      userId: user.id,
      portfolioId,
      goal,
      status: "running",
      currentAgentState: "intake" as const,
      currentStep: 0,
      maxSteps,
      retryCount: 0,
      maxRetries,
      documentIds,
      verifiedExtractionIds: [],
      uncertainExtractionIds: [],
      blockedOn: null,
    };

    const { data: run, error: runError } = await admin
      .from("agent_runs")
      .insert({
        user_id: user.id,
        portfolio_id: portfolioId,
        goal,
        state: initialState,
        status: "running",
        current_step: 0,
      })
      .select("id")
      .single();

    if (runError || !run) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INTERNAL_ERROR", "Could not start processing."),
          requestId
        ),
        { status: 500 }
      );
    }

    // Update initial state with run ID
    initialState.runId = run.id;
    await admin
      .from("agent_runs")
      .update({ state: initialState })
      .eq("id", run.id);

    // Record first step (intake)
    await admin.from("agent_steps").insert({
      user_id: user.id,
      run_id: run.id,
      sequence: 1,
      phase: "observe",
      public_summary: `Goal received: "${goal}". ${documentIds.length} document(s) queued for processing.`,
      tool_name: null,
      tool_status: "succeeded",
    });

    // Audit
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "run_started",
      resource_type: "agent_run",
      resource_id: run.id,
      metadata: { documentCount: documentIds.length },
    });

    return NextResponse.json({
      data: {
        runId: run.id,
        status: "running",
        initialStep: {
          phase: "observe",
          summary: `Goal received: "${goal}". ${documentIds.length} document(s) queued for processing.`,
        },
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
