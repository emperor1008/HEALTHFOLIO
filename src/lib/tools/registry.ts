import { z } from "zod";
import { ALL_TOOL_NAMES, type ToolName } from "./tool-names";

/**
 * Agent states — explicit state machine.
 */
export const AGENT_STATES = [
  "intake",
  "ingest",
  "extract",
  "duplicate_check",
  "classify",
  "organize",
  "relate",
  "review_required",
  "plan",
  "execute",
  "verify",
  "adapt",
  "complete",
  "blocked",
  // Feature 4: Test Report Intelligence states
  "inspect",
  "identify",
  "validate",
  "compare",
  "summarize",
  // Feature 6: Medication Routine Agent states
  "conflict_check",
  "confirmation_required",
  "schedule",
  "active",
  "paused",
  "revision_required",
] as const;

export type AgentState = (typeof AGENT_STATES)[number];

/**
 * Tool allowlist — only these tools can be invoked by the agent.
 * Derived from the single authoritative source in tool-names.ts.
 */
export const ALLOWED_TOOLS = ALL_TOOL_NAMES;

export type { ToolName };

/**
 * Agent states that allow specific tools.
 */
export const TOOL_STATE_MAP: Record<ToolName, AgentState[]> = {
  "document.ingest": ["intake", "ingest"],
  "document.extract": ["ingest", "extract"],
  "document.replace": ["adapt", "review_required"],
  "timeline.build": ["extract", "verify", "execute"],
  "clarification.request": ["extract", "review_required", "execute", "verify"],
  "brief.generate": ["execute", "verify"],
  "checklist.generate": ["execute", "verify"],
  "calendar.export_ics": ["execute", "verify"],
  "reminder.create": ["execute", "verify"],
  "pdf.export": ["execute", "verify", "complete"],
  "measurement.extract": ["extract", "verify", "execute"],
  "measurement.verify": ["review_required", "verify", "execute"],
  "trend.compute": ["verify", "execute", "complete"],
  "trend.rebuild": ["verify", "execute", "adapt", "complete"],
  // Feature 2: Document Organization
  "document.check_duplicate": ["intake", "duplicate_check"],
  "document.classify_ai": ["extract", "classify"],
  "document.extract_metadata": ["classify", "organize"],
  "document.extract_prescription_items": ["classify", "organize"],
  "document.organize": ["organize", "verify"],
  "document.find_relationships": ["organize", "relate"],
  "document.verify_organization": ["verify", "complete"],
  // Feature 4: Test Report Intelligence
  "report.inspect": ["intake", "ingest"],
  "report.extract_text": ["extract"],
  "report.extract_measurements": ["extract", "classify"],
  "test.resolve_identity": ["classify", "identify"],
  "measurement.validate_range": ["validate", "compare"],
  "measurement.request_review": ["review_required"],
  "report.generate_safe_summary": ["summarize", "verify"],
  "test.retrieve_information": ["summarize", "verify"],
  "report.finalize": ["verify", "complete"],
  // Feature 6: Medication Routine Agent
  "routine.inspect_prescription": ["intake", "inspect"],
  "routine.extract_schedule": ["extract", "classify"],
  "routine.validate_schedule": ["validate", "compare"],
  "routine.detect_conflicts": ["conflict_check", "validate"],
  "routine.request_confirmation": ["confirmation_required", "review_required"],
  "routine.activate": ["schedule", "confirmation_required"],
  "routine.generate_occurrences": ["schedule", "active"],
  "routine.pause": ["active", "revision_required"],
  "routine.revise": ["revision_required", "active"],
  "routine.invalidate": ["active", "revision_required"],
  "reminder.record_response": ["active", "complete"],
  "routine.complete": ["verify", "complete"],
};

/**
 * Valid state transitions.
 */
export const STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  intake: ["ingest", "duplicate_check", "blocked"],
  duplicate_check: ["extract", "blocked", "adapt"],
  ingest: ["extract", "duplicate_check", "blocked", "adapt"],
  extract: ["classify", "review_required", "verify", "blocked", "adapt"],
  classify: ["organize", "review_required", "blocked", "adapt"],
  organize: ["relate", "verify", "blocked", "adapt"],
  relate: ["verify", "blocked", "adapt"],
  review_required: ["extract", "classify", "organize", "verify", "adapt", "blocked"],
  plan: ["execute", "blocked"],
  execute: ["verify", "blocked", "adapt"],
  verify: ["complete", "adapt", "blocked"],
  adapt: ["ingest", "extract", "classify", "organize", "execute", "blocked"],
  complete: [],
  blocked: ["adapt", "ingest"],
  // Feature 4: Test Report Intelligence transitions
  inspect: ["extract", "blocked"],
  identify: ["validate", "review_required", "blocked"],
  validate: ["compare", "review_required", "blocked"],
  compare: ["summarize", "review_required", "blocked"],
  summarize: ["verify", "blocked"],
  // Feature 6: Medication Routine Agent states
  conflict_check: ["validate", "confirmation_required", "blocked"],
  confirmation_required: ["schedule", "active", "blocked"],
  schedule: ["active", "revision_required", "blocked"],
  active: ["revision_required", "paused", "complete", "blocked"],
  revision_required: ["schedule", "active", "complete", "blocked"],
  paused: ["active", "complete", "blocked"],
};

export function isValidTransition(from: AgentState, to: AgentState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isToolAllowed(toolName: string): toolName is ToolName {
  return (ALLOWED_TOOLS as readonly string[]).includes(toolName);
}

export function canToolRunInState(
  toolName: string,
  agentState: string
): boolean {
  if (!isToolAllowed(toolName)) return false;
  const allowedStates = TOOL_STATE_MAP[toolName];
  return allowedStates.includes(agentState as AgentState);
}

/**
 * Tool input schemas for validation.
 */
export const ToolInputSchemas: Record<ToolName, z.ZodType> = {
  "document.ingest": z.object({
    documentId: z.string(),
    portfolioId: z.string(),
  }),
  "document.extract": z.object({
    documentId: z.string(),
    pageNumber: z.number().int().positive().optional(),
  }),
  "document.replace": z.object({
    documentId: z.string(),
    replacementDocumentId: z.string(),
    reason: z.string().optional(),
  }),
  "timeline.build": z.object({
    portfolioId: z.string(),
    extractionIds: z.array(z.string()),
  }),
  "clarification.request": z.object({
    documentId: z.string().optional(),
    extractionIds: z.array(z.string()).optional(),
    message: z.string().min(1),
    requestType: z.enum(["review", "replace", "correct", "exclude"]),
  }),
  "brief.generate": z.object({
    portfolioId: z.string(),
    appointmentId: z.string().optional(),
  }),
  "checklist.generate": z.object({
    portfolioId: z.string(),
    goal: z.string(),
  }),
  "calendar.export_ics": z.object({
    appointmentId: z.string(),
  }),
  "reminder.create": z.object({
    appointmentId: z.string(),
    remindAt: z.string().optional(),
    message: z.string().min(1),
  }),
  "pdf.export": z.object({
    briefId: z.string(),
  }),
  "measurement.extract": z.object({
    documentId: z.string(),
    pageNumber: z.number().int().positive(),
  }),
  "measurement.verify": z.object({
    measurementId: z.string(),
    decision: z.enum(["verified", "corrected", "rejected"]),
    correctedValue: z.number().nullable().optional(),
    correctedValueText: z.string().nullable().optional(),
  }),
  "trend.compute": z.object({
    normalizedTestName: z.string(),
  }),
  "trend.rebuild": z.object({
    documentId: z.string(),
  }),
  // Feature 2: Document Organization
  "document.check_duplicate": z.object({
    documentId: z.string(),
    fileHash: z.string(),
  }),
  "document.classify_ai": z.object({
    documentId: z.string(),
    extractedText: z.string(),
    mimeType: z.string(),
  }),
  "document.extract_metadata": z.object({
    documentId: z.string(),
    classificationResult: z.record(z.unknown()),
  }),
  "document.extract_prescription_items": z.object({
    documentId: z.string(),
    classificationResult: z.record(z.unknown()),
  }),
  "document.organize": z.object({
    documentId: z.string(),
    category: z.string(),
    confidence: z.number(),
  }),
  "document.find_relationships": z.object({
    documentId: z.string(),
  }),
  "document.verify_organization": z.object({
    documentId: z.string(),
  }),
  // Feature 4: Test Report Intelligence
  "report.inspect": z.object({
    documentId: z.string(),
  }),
  "report.extract_text": z.object({
    documentId: z.string(),
  }),
  "report.extract_measurements": z.object({
    documentId: z.string(),
  }),
  "test.resolve_identity": z.object({
    measurementId: z.string(),
    proposedTestKey: z.string(),
  }),
  "measurement.validate_range": z.object({
    measurementId: z.string(),
  }),
  "measurement.request_review": z.object({
    measurementId: z.string(),
    reason: z.string().min(1),
  }),
  "report.generate_safe_summary": z.object({
    documentId: z.string(),
  }),
  "test.retrieve_information": z.object({
    testKey: z.string(),
  }),
  "report.finalize": z.object({
    documentId: z.string(),
  }),
  // Feature 6: Medication Routine Agent
  "routine.inspect_prescription": z.object({
    prescriptionItemId: z.string(),
  }),
  "routine.extract_schedule": z.object({
    prescriptionItemId: z.string(),
    extractedText: z.string(),
  }),
  "routine.validate_schedule": z.object({
    planId: z.string(),
  }),
  "routine.detect_conflicts": z.object({
    userId: z.string(),
    planId: z.string().optional(),
  }),
  "routine.request_confirmation": z.object({
    planId: z.string(),
  }),
  "routine.activate": z.object({
    planId: z.string(),
    timezone: z.string(),
    confirmedTimeSlots: z.array(z.object({
      localTime: z.string(),
      sourceType: z.enum(["prescription", "user_selected", "system_suggested"]),
    })),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  "routine.generate_occurrences": z.object({
    planId: z.string(),
  }),
  "routine.pause": z.object({
    planId: z.string(),
    reason: z.string().optional(),
  }),
  "routine.revise": z.object({
    planId: z.string(),
    revisedTimeSlots: z.array(z.object({
      localTime: z.string(),
      sourceType: z.enum(["prescription", "user_selected", "system_suggested"]),
    })),
    reason: z.string().min(1),
  }),
  "routine.invalidate": z.object({
    planId: z.string(),
    reason: z.string().min(1),
  }),
  "reminder.record_response": z.object({
    occurrenceId: z.string(),
    action: z.enum(["taken", "skipped", "snoozed", "not_now"]),
    clientTimezone: z.string(),
    clientRequestId: z.string(),
    reason: z.string().optional(),
    snoozeMinutes: z.number().int().min(1).max(60).optional(),
  }),
  "routine.complete": z.object({
    planId: z.string(),
  }),
};

export function validateToolInput(
  toolName: string,
  input: unknown
): { valid: boolean; data?: unknown; error?: string } {
  if (!isToolAllowed(toolName)) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const schema = ToolInputSchemas[toolName];
  if (!schema) {
    return { valid: false, error: `No schema for tool: ${toolName}` };
  }

  try {
    const data = schema.parse(input);
    return { valid: true, data };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return {
        valid: false,
        error: `Invalid input for ${toolName}: ${e.issues.map((i) => i.message).join(", ")}`,
      };
    }
    return { valid: false, error: `Validation failed for ${toolName}` };
  }
}

/**
 * Get the next state after a tool executes successfully.
 */
export function getNextState(
  currentState: AgentState,
  toolName: ToolName,
  hasPendingReviews: boolean,
  hasUnprocessedDocs: boolean
): AgentState {
  if (toolName === "document.ingest") return "ingest";
  if (toolName === "document.extract") {
    if (hasPendingReviews) return "review_required";
    if (hasUnprocessedDocs) return "extract";
    return "verify";
  }
  if (toolName === "document.replace") return "extract";
  if (toolName === "timeline.build") {
    if (hasUnprocessedDocs) return "extract";
    return "execute";
  }
  if (toolName === "clarification.request") return "review_required";
  if (toolName === "brief.generate") return "verify";
  if (toolName === "checklist.generate") return currentState;
  if (toolName === "calendar.export_ics") return currentState;
  if (toolName === "reminder.create") return currentState;
  if (toolName === "pdf.export") return "complete";
  if (toolName === "measurement.extract") {
    if (hasPendingReviews) return "review_required";
    return "extract";
  }
  if (toolName === "measurement.verify") return "execute";
  if (toolName === "trend.compute") return currentState;
  if (toolName === "trend.rebuild") return currentState;
  // Feature 2: Document Organization
  if (toolName === "document.check_duplicate") return "extract";
  if (toolName === "document.classify_ai") return "organize";
  if (toolName === "document.extract_metadata") return "organize";
  if (toolName === "document.extract_prescription_items") return "organize";
  if (toolName === "document.organize") return "relate";
  if (toolName === "document.find_relationships") return "verify";
  if (toolName === "document.verify_organization") return "complete";
  // Feature 4: Test Report Intelligence
  if (toolName === "report.inspect") return "extract";
  if (toolName === "report.extract_text") return "classify";
  if (toolName === "report.extract_measurements") {
    if (hasPendingReviews) return "review_required";
    return "compare";
  }
  if (toolName === "test.resolve_identity") return "validate";
  if (toolName === "measurement.validate_range") return "summarize";
  if (toolName === "measurement.request_review") return "review_required";
  if (toolName === "report.generate_safe_summary") return "verify";
  if (toolName === "test.retrieve_information") return "verify";
  if (toolName === "report.finalize") return "complete";
  // Feature 6: Medication Routine Agent
  if (toolName === "routine.inspect_prescription") return "extract";
  if (toolName === "routine.extract_schedule") return "validate";
  if (toolName === "routine.validate_schedule") return "conflict_check";
  if (toolName === "routine.detect_conflicts") return "confirmation_required";
  if (toolName === "routine.request_confirmation") return "schedule";
  if (toolName === "routine.activate") return "active";
  if (toolName === "routine.generate_occurrences") return "active";
  if (toolName === "routine.pause") return "paused";
  if (toolName === "routine.revise") return "active";
  if (toolName === "routine.invalidate") return "complete";
  if (toolName === "reminder.record_response") return currentState;
  if (toolName === "routine.complete") return "complete";
  return currentState;
}
