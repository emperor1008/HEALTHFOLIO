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
  "measurement.extract",
  "measurement.verify",
  "trend.compute",
  "trend.rebuild",
  // Feature 2: Document Organization
  "document.check_duplicate",
  "document.classify_ai",
  "document.extract_metadata",
  "document.extract_prescription_items",
  "document.organize",
  "document.find_relationships",
  "document.verify_organization",
  // Feature 4: Test Report Intelligence
  "report.inspect",
  "report.extract_text",
  "report.extract_measurements",
  "test.resolve_identity",
  "measurement.validate_range",
  "measurement.request_review",
  "report.generate_safe_summary",
  "test.retrieve_information",
  "report.finalize",
  // Feature 6: Medication Routine Agent
  "routine.inspect_prescription",
  "routine.extract_schedule",
  "routine.validate_schedule",
  "routine.detect_conflicts",
  "routine.request_confirmation",
  "routine.activate",
  "routine.generate_occurrences",
  "routine.pause",
  "routine.revise",
  "routine.invalidate",
  "reminder.record_response",
  "routine.complete",
] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];
