import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider } from "@/lib/ai/provider";
import { isToolAllowed, canToolRunInState, isForbiddenAction, validateToolInput } from "@/lib/tools/registry";
import { checkSafetyBoundary } from "@/lib/ai/safety";
import { executeTool } from "./tools";

export interface AgentRunState {
  runId: string;
  userId: string;
  portfolioId: string;
  goal: string;
  status: string;
  currentStep: number;
  maxSteps: number;
  retryCount: number;
  maxRetries: number;
  documentIds: string[];
  verifiedExtractionIds: string[];
  uncertainExtractionIds: string[];
  blockedOn: string | null;
}

type StepResult = {
  phase: string;
  summary: string;
  toolName?: string;
  toolStatus: string;
  errorCode?: string;
  requiresUserAction: boolean;
};

/**
 * Execute one bounded agent step: Observe → Decide → Act → Verify → Adapt.
 */
export async function executeAgentStep(runId: string, userId: string): Promise<StepResult> {
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("agent_runs").select("*")
    .eq("id", runId).eq("user_id", userId).single();

  if (!run) return blocked("NOT_FOUND", "Run not found or access denied.");

  const state: AgentRunState = run.state;
  const maxSteps = parseInt(process.env.AGENT_MAX_STEPS || "12");
  const maxRetries = parseInt(process.env.AGENT_MAX_RETRIES || "2");

  if (state.currentStep >= maxSteps) {
    await saveRun(admin, runId, "complete", state);
    return { phase: "complete", summary: "Step limit reached.", toolStatus: "succeeded", requiresUserAction: false };
  }

  state.currentStep++;

  // Load context
  const [{ data: documents }, { data: extractions }] = await Promise.all([
    admin.from("documents").select("id, status").eq("portfolio_id", state.portfolioId).eq("user_id", userId),
    admin.from("extractions").select("id, verification_status").in("document_id", state.documentIds),
  ]);

  const pending = extractions?.filter((e) => e.verification_status === "pending") || [];
  const verified = extractions?.filter((e) => e.verification_status === "user_confirmed" || e.verification_status === "user_corrected") || [];
  const unprocessed = documents?.filter((d) => d.status === "uploaded" || d.status === "processing") || [];

  // Decide: AI suggestion or deterministic fallback
  const decision = await decide(state, run.status, { unprocessed, pending, verified });

  // Safety + validation gates
  const safety = checkSafetyBoundary(decision.reasoning + " " + JSON.stringify(decision.toolInput));
  if (!safety.allowed) return failStep(admin, runId, state, decision, "SAFETY_VIOLATION", safety.response);
  if (isForbiddenAction(decision.toolName, decision.toolInput)) return failStep(admin, runId, state, decision, "SAFETY_VIOLATION");
  if (!isToolAllowed(decision.toolName)) return failStep(admin, runId, state, decision, "INVALID_TOOL");
  if (!canToolRunInState(decision.toolName, run.status)) return failStep(admin, runId, state, decision, "INVALID_STATE");

  const validation = validateToolInput(decision.toolName, decision.toolInput);
  if (!validation.valid) return failStep(admin, runId, state, decision, "INVALID_INPUT");

  // Execute
  const result = await executeTool(decision.toolName, validation.data as Record<string, unknown>, userId, state);

  if (!result.success) {
    state.retryCount++;
    if (state.retryCount >= maxRetries) {
      await recordStep(admin, runId, state, decision.toolName, "failed", result.errorCode);
      await saveRun(admin, runId, "blocked", state);
      return blocked(result.errorCode || "TOOL_FAILED", `Action could not complete after ${maxRetries} attempts.`);
    }
    state.currentStep--;
    await recordStep(admin, runId, state, decision.toolName, "succeeded", undefined, `Retrying (attempt ${state.retryCount + 1})`);
    return { phase: "adapt", summary: `Retrying (attempt ${state.retryCount + 1}).`, toolName: decision.toolName, toolStatus: "succeeded", requiresUserAction: false };
  }

  state.retryCount = 0;
  await recordStep(admin, runId, state, decision.toolName, "succeeded");
  await saveRun(admin, runId, "running", state);

  // Check if user review is needed
  if (pending.length > 0 && decision.toolName === "document.extract") {
    await saveRun(admin, runId, "waiting_for_user", state);
    return { phase: "review_required", summary: "Extracted information needs your review.", toolName: decision.toolName, toolStatus: "succeeded", requiresUserAction: true };
  }

  // Check completion
  if (unprocessed.length === 0 && pending.length === 0 && verified.length > 0) {
    const { data: briefs } = await admin.from("briefs").select("id")
      .eq("portfolio_id", state.portfolioId).eq("user_id", userId).limit(1);
    if (briefs?.length) {
      await saveRun(admin, runId, "complete", state);
      return { phase: "complete", summary: "Preparation complete.", toolStatus: "succeeded", requiresUserAction: false };
    }
  }

  return { phase: "execute", summary: `Step ${state.currentStep}: ${decision.reasoning}`, toolName: decision.toolName, toolStatus: "succeeded", requiresUserAction: false };
}

// --- Helpers ---

function blocked(errorCode: string, summary: string): StepResult {
  return { phase: "blocked", summary, toolStatus: "blocked", errorCode, requiresUserAction: true };
}

function failStep(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  state: AgentRunState,
  decision: { toolName: string; reasoning: string },
  errorCode: string,
  summary?: string
): Promise<StepResult> {
  return recordStep(admin, runId, state, decision.toolName, "blocked", errorCode, summary)
    .then(() => blocked(errorCode, summary || "Action blocked by safety policy."));
}

async function decide(
  state: AgentRunState,
  status: string,
  ctx: { unprocessed: Array<{ id: string; status: string }>; pending: Array<{ id: string }>; verified: Array<{ id: string }> }
): Promise<{ toolName: string; toolInput: Record<string, unknown>; reasoning: string }> {
  // Try AI first
  try {
    const provider = getAIProvider();
    const action = await provider.suggestNextAction(state.goal, status, {
      unprocessedCount: ctx.unprocessed.length,
      pendingCount: ctx.pending.length,
      verifiedCount: ctx.verified.length,
    });
    if (isToolAllowed(action.toolName) && canToolRunInState(action.toolName, status)) {
      return { toolName: action.toolName, toolInput: action.toolInput as Record<string, unknown>, reasoning: action.reasoning };
    }
  } catch { /* fall through to deterministic */ }

  // Deterministic fallback
  if (ctx.unprocessed.length > 0) {
    const doc = ctx.unprocessed.find((d) => d.status === "uploaded");
    if (doc) return { toolName: "document.ingest", toolInput: { documentId: doc.id, portfolioId: state.portfolioId }, reasoning: "Processing uploaded document." };
  }
  if (ctx.pending.length > 0) {
    return { toolName: "clarification.request", toolInput: { message: "Extracted information needs review.", requestType: "review" }, reasoning: "Awaiting user review." };
  }
  if (ctx.verified.length > 0) {
    return { toolName: "timeline.build", toolInput: { portfolioId: state.portfolioId, extractionIds: [] }, reasoning: "Building verified timeline." };
  }
  return { toolName: "clarification.request", toolInput: { message: "Waiting for documents or review.", requestType: "review" }, reasoning: "No actions available." };
}

async function recordStep(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  state: AgentRunState,
  toolName: string,
  toolStatus: string,
  errorCode?: string,
  summaryOverride?: string
) {
  await admin.from("agent_steps").insert({
    user_id: state.userId,
    run_id: runId,
    sequence: state.currentStep,
    phase: toolStatus === "blocked" ? "verify" : "act",
    public_summary: summaryOverride || `${toolName}: ${toolStatus}`,
    tool_name: toolName,
    tool_status: toolStatus,
    error_code: errorCode || null,
  });
}

async function saveRun(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  status: string,
  state: AgentRunState
) {
  const update: Record<string, unknown> = { status, state, current_step: state.currentStep };
  if (status === "complete" || status === "failed") update.completed_at = new Date().toISOString();
  await admin.from("agent_runs").update(update).eq("id", runId);
}
