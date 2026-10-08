/**
 * POST /api/triage/interpret — Layer 1 interpretation endpoint (Phase 2).
 *
 * Body:    { language: "en"|"hi"|"or", text: string (≤500), concepts?: string[] }
 * Success: { data: { concepts, uncertain, duration, severity,
 *                    suggestedFollowUpId, droppedConcepts, droppedFollowUp },
 *            error: null, requestId }
 * Failure: { data: null, error: { code, message }, requestId }
 *
 * Safety / privacy properties:
 *   - Better Auth session required (401 AUTH_REQUIRED otherwise).
 *   - Symptom text is length-capped, used only for interpretation, and is
 *     NEVER logged (no console output at all in this route).
 *   - AI failure returns a structured code the client tolerates by falling
 *     back to the local deterministic path (guided flow):
 *       503 AI_UNAVAILABLE        → provider not configured / unreachable
 *       504 AI_TIMEOUT            → bounded deadline exceeded
 *       502 AI_INVALID_RESPONSE   → payload failed the strict schema
 *   - The deterministic normalizer ALWAYS runs server-side too, so the
 *     merged concepts the client receives are never AI-only.
 *   - Output is interpretation only (broad concepts, duration, severity,
 *     a reviewed clarification id). Triage urgency is computed client-side
 *     by the deterministic engine — this route never returns a diagnosis,
 *     urgency, or health advice.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth-helpers";
import { createError, formatErrorResponse, generateRequestId } from "@/lib/errors";
import { interpretSymptomsWithAI, AI_INTERPRET_MAX_TEXT } from "@/lib/triage/ai-interpret";
import {
  InterpretationLanguageSchema,
  mergeSymptomConcepts,
} from "@/lib/triage/interpretation";
import { isSymptomConcept } from "@/lib/triage/concepts";

export const dynamic = "force-dynamic";

const InterpretRequestSchema = z.object({
  language: InterpretationLanguageSchema,
  text: z.string().trim().min(1).max(AI_INTERPRET_MAX_TEXT),
  /** Concepts the patient explicitly tapped in the guided flow (optional). */
  concepts: z.array(z.string().max(40)).max(20).optional(),
});

const FAILURE_STATUS: Record<string, number> = {
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_INVALID_RESPONSE: 502,
};

export async function POST(req: Request) {
  const requestId = generateRequestId();
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INVALID_REQUEST", "Invalid request body"), requestId),
      { status: 400 }
    );
  }

  const parsed = InterpretRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      formatErrorResponse(createError("INVALID_REQUEST", "Invalid symptom interpretation request"), requestId),
      { status: 400 }
    );
  }

  const { language, text } = parsed.data;
  const userConfirmed = (parsed.data.concepts ?? []).filter(isSymptomConcept);

  const result = await interpretSymptomsWithAI({ language, text });

  if (!result.ok) {
    // NOTE: no symptom text in this response or anywhere in logs.
    return NextResponse.json(
      formatErrorResponse(
        createError(
          result.reason,
          result.reason === "AI_TIMEOUT"
            ? "Language understanding timed out"
            : result.reason === "AI_INVALID_RESPONSE"
              ? "Language understanding returned an invalid response"
              : "Language understanding is unavailable right now"
        ),
        requestId
      ),
      { status: FAILURE_STATUS[result.reason] ?? 503 }
    );
  }

  const { interpretation } = result;
  const merged = mergeSymptomConcepts({
    text,
    aiConcepts: interpretation.concepts,
    userConfirmed,
  });

  return NextResponse.json({
    data: {
      concepts: merged.concepts,
      uncertain: merged.uncertain,
      duration: interpretation.duration,
      severity: interpretation.severity,
      suggestedFollowUpId: interpretation.suggestedFollowUpId,
      droppedConcepts: interpretation.droppedConcepts,
      droppedFollowUp: interpretation.droppedFollowUp,
    },
    error: null,
    requestId,
  });
}
