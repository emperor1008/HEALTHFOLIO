import { z } from "zod";
import { ALL_TOOL_NAMES, type ToolName } from "./tool-names";

/**
 * Agent states — explicit state machine.
 */
export const AGENT_STATES = [
  "intake",
  "ingest",
  "extract",
  "review_required",
  "plan",
  "execute",
  "verify",
  "adapt",
  "complete",
  "blocked",
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
};

/**
 * Valid state transitions.
 */
export const STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  intake: ["ingest", "blocked"],
  ingest: ["extract", "blocked", "adapt"],
  extract: ["review_required", "verify", "blocked", "adapt"],
  review_required: ["extract", "verify", "adapt", "blocked"],
  plan: ["execute", "blocked"],
  execute: ["verify", "blocked", "adapt"],
  verify: ["complete", "adapt", "blocked"],
  adapt: ["ingest", "extract", "execute", "blocked"],
  complete: [],
  blocked: ["adapt", "ingest"],
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
  return currentState;
}
