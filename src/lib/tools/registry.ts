import { z } from "zod";

/**
 * Tool allowlist - only these tools can be invoked by the agent.
 */
export const ALLOWED_TOOLS = [
  "document.ingest",
  "document.extract",
  "timeline.build",
  "clarification.request",
  "brief.generate",
  "checklist.generate",
  "reminder.create",
  "calendar.export_ics",
  "pdf.export",
] as const;

export type ToolName = (typeof ALLOWED_TOOLS)[number];

/**
 * Agent states that allow specific tools.
 */
export const TOOL_STATE_MAP: Record<ToolName, string[]> = {
  "document.ingest": ["intake"],
  "document.extract": ["extracting"],
  "timeline.build": ["extracting", "executing"],
  "clarification.request": ["extracting", "review_required", "executing"],
  "brief.generate": ["executing"],
  "checklist.generate": ["executing"],
  "reminder.create": ["executing"],
  "calendar.export_ics": ["executing"],
  "pdf.export": ["executing"],
};

/**
 * Forbidden medical actions that must never appear as tool names or parameters.
 */
const FORBIDDEN_ACTIONS = [
  "diagnose",
  "prescribe",
  "treat",
  "medication_change",
  "dose_adjust",
  "emergency_assessment",
];

export function isToolAllowed(toolName: string): toolName is ToolName {
  return (ALLOWED_TOOLS as readonly string[]).includes(toolName);
}

export function canToolRunInState(
  toolName: string,
  agentState: string
): boolean {
  if (!isToolAllowed(toolName)) return false;
  const allowedStates = TOOL_STATE_MAP[toolName];
  return allowedStates.includes(agentState);
}

export function isForbiddenAction(toolName: string, input: Record<string, unknown>): boolean {
  // Check tool name
  if (FORBIDDEN_ACTIONS.some((f) => toolName.toLowerCase().includes(f))) {
    return true;
  }

  // Check input for medical safety violations
  const inputStr = JSON.stringify(input).toLowerCase();
  return FORBIDDEN_ACTIONS.some((f) => inputStr.includes(f));
}

/**
 * Tool input schemas for validation.
 */
export const ToolInputSchemas = {
  "document.ingest": z.object({
    documentId: z.string(),
    portfolioId: z.string(),
  }),
  "document.extract": z.object({
    documentId: z.string(),
    pageNumber: z.number().int().positive().optional(),
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
    appointmentId: z.string().optional(),
  }),
  "reminder.create": z.object({
    appointmentId: z.string(),
    remindAt: z.string(),
    message: z.string().min(1),
  }),
  "calendar.export_ics": z.object({
    appointmentId: z.string(),
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
