import { describe, it, expect } from "vitest";
import {
  isToolAllowed,
  canToolRunInState,
  validateToolInput,
  isValidTransition,
  getNextState,
  ALLOWED_TOOLS,
  AGENT_STATES,
} from "@/lib/tools/registry";
import { ALL_TOOL_NAMES } from "@/lib/tools/tool-names";

describe("Tool Registry", () => {
  describe("isToolAllowed", () => {
    it("should allow all registered tools", () => {
      for (const tool of ALLOWED_TOOLS) {
        expect(isToolAllowed(tool)).toBe(true);
      }
    });

    it("should reject unknown tools", () => {
      expect(isToolAllowed("unknown.tool")).toBe(false);
      expect(isToolAllowed("diagnose")).toBe(false);
      expect(isToolAllowed("prescribe")).toBe(false);
      expect(isToolAllowed("shell.exec")).toBe(false);
      expect(isToolAllowed("sql.query")).toBe(false);
    });
  });

  describe("canToolRunInState", () => {
    it("should allow document.ingest in intake state", () => {
      expect(canToolRunInState("document.ingest", "intake")).toBe(true);
    });

    it("should not allow document.ingest in complete state", () => {
      expect(canToolRunInState("document.ingest", "complete")).toBe(false);
    });

    it("should allow brief.generate in execute state", () => {
      expect(canToolRunInState("brief.generate", "execute")).toBe(true);
    });

    it("should not allow unknown tools in any state", () => {
      expect(canToolRunInState("unknown.tool", "intake")).toBe(false);
    });
  });

  describe("validateToolInput", () => {
    it("should validate correct document.ingest input", () => {
      const result = validateToolInput("document.ingest", {
        documentId: "abc-123",
        portfolioId: "def-456",
      });
      expect(result.valid).toBe(true);
    });

    it("should reject invalid document.ingest input", () => {
      const result = validateToolInput("document.ingest", {
        missingField: true,
      });
      expect(result.valid).toBe(false);
    });

    it("should reject unknown tool", () => {
      const result = validateToolInput("unknown.tool", {});
      expect(result.valid).toBe(false);
    });

    it("should validate correct brief.generate input", () => {
      const result = validateToolInput("brief.generate", {
        portfolioId: "abc-123",
      });
      expect(result.valid).toBe(true);
    });

    it("should validate document.replace input", () => {
      const result = validateToolInput("document.replace", {
        documentId: "old-doc",
        replacementDocumentId: "new-doc",
      });
      expect(result.valid).toBe(true);
    });

    it("should validate checklist.generate input", () => {
      const result = validateToolInput("checklist.generate", {
        portfolioId: "abc-123",
        goal: "Prepare for cardiology appointment",
      });
      expect(result.valid).toBe(true);
    });

    it("should validate calendar.export_ics input", () => {
      const result = validateToolInput("calendar.export_ics", {
        appointmentId: "appt-123",
      });
      expect(result.valid).toBe(true);
    });

    it("should reject document.replace with missing replacementDocumentId", () => {
      const result = validateToolInput("document.replace", {
        documentId: "old-doc",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("isValidTransition", () => {
    it("should allow intake to ingest", () => {
      expect(isValidTransition("intake", "ingest")).toBe(true);
    });

    it("should allow ingest to extract", () => {
      expect(isValidTransition("ingest", "extract")).toBe(true);
    });

    it("should allow extract to review_required", () => {
      expect(isValidTransition("extract", "review_required")).toBe(true);
    });

    it("should allow review_required to extract after user action", () => {
      expect(isValidTransition("review_required", "extract")).toBe(true);
    });

    it("should allow execute to verify", () => {
      expect(isValidTransition("execute", "verify")).toBe(true);
    });

    it("should allow verify to complete", () => {
      expect(isValidTransition("verify", "complete")).toBe(true);
    });

    it("should not allow complete to any state", () => {
      expect(isValidTransition("complete", "intake")).toBe(false);
      expect(isValidTransition("complete", "extract")).toBe(false);
    });

    it("should allow blocked to adapt", () => {
      expect(isValidTransition("blocked", "adapt")).toBe(true);
    });

    it("should allow adapt to extract for document replacement", () => {
      expect(isValidTransition("adapt", "extract")).toBe(true);
    });
  });

  describe("getNextState", () => {
    it("should transition to ingest after document.ingest", () => {
      expect(getNextState("intake", "document.ingest", false, true)).toBe("ingest");
    });

    it("should transition to review_required when pending reviews exist", () => {
      expect(getNextState("extract", "document.extract", true, false)).toBe("review_required");
    });

    it("should transition to verify when no pending and no unprocessed", () => {
      expect(getNextState("extract", "document.extract", false, false)).toBe("verify");
    });

    it("should transition to extract when more docs to process", () => {
      expect(getNextState("extract", "document.extract", false, true)).toBe("extract");
    });
  });

  describe("New tools", () => {
    it("should include all 42 tools in allowlist", () => {
      expect(ALLOWED_TOOLS).toHaveLength(42);
    });

    it("should include document.replace in allowlist", () => {
      expect(isToolAllowed("document.replace")).toBe(true);
    });

    it("should include checklist.generate in allowlist", () => {
      expect(isToolAllowed("checklist.generate")).toBe(true);
    });

    it("should include calendar.export_ics in allowlist", () => {
      expect(isToolAllowed("calendar.export_ics")).toBe(true);
    });

    it("should include pdf.export in allowlist", () => {
      expect(isToolAllowed("pdf.export")).toBe(true);
    });
  });

  describe("Tool name single source", () => {
    it("should derive ALLOWED_TOOLS from ALL_TOOL_NAMES", () => {
      expect(ALLOWED_TOOLS).toEqual(ALL_TOOL_NAMES);
    });

    it("should have exactly 30 tool names", () => {
      expect(ALL_TOOL_NAMES).toHaveLength(42);
    });

    it("should contain all expected tool names", () => {
      expect(ALL_TOOL_NAMES).toContain("document.ingest");
      expect(ALL_TOOL_NAMES).toContain("document.extract");
      expect(ALL_TOOL_NAMES).toContain("document.replace");
      expect(ALL_TOOL_NAMES).toContain("timeline.build");
      expect(ALL_TOOL_NAMES).toContain("clarification.request");
      expect(ALL_TOOL_NAMES).toContain("brief.generate");
      expect(ALL_TOOL_NAMES).toContain("checklist.generate");
      expect(ALL_TOOL_NAMES).toContain("calendar.export_ics");
      expect(ALL_TOOL_NAMES).toContain("reminder.create");
      expect(ALL_TOOL_NAMES).toContain("pdf.export");
      expect(ALL_TOOL_NAMES).toContain("measurement.extract");
      expect(ALL_TOOL_NAMES).toContain("measurement.verify");
      expect(ALL_TOOL_NAMES).toContain("trend.compute");
      expect(ALL_TOOL_NAMES).toContain("trend.rebuild");
      expect(ALL_TOOL_NAMES).toContain("document.check_duplicate");
      expect(ALL_TOOL_NAMES).toContain("document.classify_ai");
      expect(ALL_TOOL_NAMES).toContain("document.extract_metadata");
      expect(ALL_TOOL_NAMES).toContain("document.extract_prescription_items");
      expect(ALL_TOOL_NAMES).toContain("document.organize");
      expect(ALL_TOOL_NAMES).toContain("document.find_relationships");
      expect(ALL_TOOL_NAMES).toContain("document.verify_organization");
    });
  });

  describe("AI schema validates all tools", () => {
    it("should validate all 14 tools through AgentNextActionSchema", async () => {
      const { AgentNextActionSchema } = await import("@/lib/ai/schemas");
      for (const tool of ALL_TOOL_NAMES) {
        const result = AgentNextActionSchema.safeParse({
          toolName: tool,
          toolInput: {},
          reasoning: "Test",
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject unknown tools through AgentNextActionSchema", async () => {
      const { AgentNextActionSchema } = await import("@/lib/ai/schemas");
      const result = AgentNextActionSchema.safeParse({
        toolName: "diagnose.condition",
        toolInput: {},
        reasoning: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("should reject arbitrary tool names", async () => {
      const { AgentNextActionSchema } = await import("@/lib/ai/schemas");
      for (const name of ["shell.exec", "sql.query", "file.read", "unknown"]) {
        const result = AgentNextActionSchema.safeParse({
          toolName: name,
          toolInput: {},
          reasoning: "Test",
        });
        expect(result.success).toBe(false);
      }
    });
  });
});
