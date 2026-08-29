import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const chatSchema = z.object({
  question: z.string().min(1).max(2000),
  requestId: z.string().uuid().optional(),
});

/**
 * POST /api/ask
 *
 * Answer a user question using intent-based routing:
 * - Product help → deterministic capability answers
 * - Personal records → Ollama AI with document retrieval
 * - General health → authoritative reference guidance
 * - Safety boundary → fixed safety response
 * - Emergency → emergency notice
 */
export async function POST(request: NextRequest) {
  // Use client-provided requestId for idempotency, or generate one
  const clientRequestId = crypto.randomUUID();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(
          createError("AUTH_REQUIRED", "Authentication required"),
          clientRequestId
        ),
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = chatSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", "Please enter a question."),
          clientRequestId
        ),
        { status: 400 }
      );
    }

    // Use client-provided requestId for idempotency
    const requestId = parsed.data.requestId || clientRequestId;
    const question = parsed.data.question.trim();

    // Import the orchestrator
    const { processQuestion } = await import("@/lib/assistant/orchestrator");

    // Gather user's extractions and documents for personal-record questions
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();

    // Fetch extractions and documents in parallel
    const [extractionsResult, documentsResult] = await Promise.all([
      supabase
        .from("extractions")
        .select(
          "id, document_id, page_number, field_type, raw_value, confidence, verification_status, evidence_locator"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("documents")
        .select("id, original_name, document_type")
        .eq("user_id", user.id),
    ]);

    const extractions = extractionsResult.data || [];
    const documents = documentsResult.data || [];

    // Process through the orchestrator
    const response = await processQuestion({
      userId: user.id,
      requestId,
      question,
      extractions,
      documents,
    });

    // Audit (non-blocking, fire-and-forget)
    void supabase.from("audit_events").insert({
      user_id: user.id,
      action: "ask_question",
      resource_type: "chat",
      metadata: {
        questionLength: question.length,
        intent: response.intent,
        answerType: response.answerType,
        sourceCount: response.sources.length,
      },
    });

    return NextResponse.json({
      data: response,
      error: null,
      requestId,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json(
      formatErrorResponse(
        createError("INTERNAL_ERROR", errorMessage),
        clientRequestId
      ),
      { status: 500 }
    );
  }
}
