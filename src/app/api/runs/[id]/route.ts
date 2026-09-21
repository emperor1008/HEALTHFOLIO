import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(
          createError("AUTH_REQUIRED", "Authentication required"),
          requestId
        ),
        { status: 401 }
      );
    }

    const runId = (await params).id;
    const admin = await createAdminClient();

    const { data: run, error: runError } = await admin
      .from("agent_runs")
      .select("id, goal, status, current_step, state, created_at, completed_at")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();

    if (runError || !run) {
      return NextResponse.json(
        formatErrorResponse(
          createError("NOT_FOUND", "Run not found."),
          requestId
        ),
        { status: 404 }
      );
    }

    const { data: steps } = await admin
      .from("agent_steps")
      .select("*")
      .eq("run_id", runId)
      .eq("user_id", user.id)
      .order("sequence", { ascending: true });

    return NextResponse.json({
      data: {
        run,
        steps: steps || [],
      },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(
        createError("INTERNAL_ERROR", "Something went wrong"),
        requestId
      ),
      { status: 500 }
    );
  }
}
