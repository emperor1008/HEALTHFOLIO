/**
 * Single authoritative source for all agent tool names.
 * Import from here in registry, AI schemas, and tests.
 */
export const ALL_TOOL_NAMES = [
  "document.ingest",
  "document.extract",
  "document.replace",
  "timeline.build",
  "clarification.request",
  "brief.generate",
  "checklist.generate",
  "calendar.export_ics",
  "reminder.create",
  "pdf.export",
] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];
