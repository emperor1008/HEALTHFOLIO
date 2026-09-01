import { describe, it, expect } from "vitest";
import {
  canToolRunInState,
  isToolAllowed,
  getNextState,
  AGENT_STATES,
} from "@/lib/tools/registry";

describe("Agent state machine", () => {
  describe("Tool state permissions", () => {
    it("document.ingest is allowed in intake state", () => {
      expect(canToolRunInState("document.ingest", "intake")).toBe(true);
    });

    it("document.ingest is NOT allowed in running state (database status)", () => {
      expect(canToolRunInState("document.ingest", "running")).toBe(false);
    });

    it("document.ingest is NOT allowed in complete state", () => {
      expect(canToolRunInState("document.ingest", "complete")).toBe(false);
    });

    it("document.extract is allowed in ingest state", () => {
      expect(canToolRunInState("document.extract", "ingest")).toBe(true);
    });

    it("document.extract is allowed in extract state", () => {
      expect(canToolRunInState("document.extract", "extract")).toBe(true);
    });

    it("timeline.build is allowed in extract state", () => {
      expect(canToolRunInState("timeline.build", "extract")).toBe(true);
    });

    it("timeline.build is allowed in verify state", () => {
      expect(canToolRunInState("timeline.build", "verify")).toBe(true);
    });

    it("pdf.export is allowed in complete state", () => {
      expect(canToolRunInState("pdf.export", "complete")).toBe(true);
    });

    it("brief.generate is NOT allowed in intake state", () => {
      expect(canToolRunInState("brief.generate", "intake")).toBe(false);
    });

    it("unknown tool is not allowed", () => {
      expect(isToolAllowed("fake.tool")).toBe(false);
    });
  });

  describe("State transitions", () => {
    it("intake → ingest after document.ingest", () => {
      expect(getNextState("intake", "document.ingest", false, true)).toBe("ingest");
    });

    it("ingest → extract after document.extract with no pending reviews", () => {
      expect(getNextState("ingest", "document.extract", false, false)).toBe("verify");
    });

    it("ingest → extract after document.extract with pending reviews", () => {
      expect(getNextState("ingest", "document.extract", true, false)).toBe("review_required");
    });

    it("extract → execute after timeline.build", () => {
      expect(getNextState("extract", "timeline.build", false, false)).toBe("execute");
    });

    it("execute → verify after brief.generate", () => {
      expect(getNextState("execute", "brief.generate", false, false)).toBe("verify");
    });

    it("complete state stays complete after pdf.export", () => {
      expect(getNextState("complete", "pdf.export", false, false)).toBe("complete");
    });
  });

  describe("Agent state initialization", () => {
    it("all defined states are lowercase", () => {
      for (const state of AGENT_STATES) {
        expect(state).toBe(state.toLowerCase());
      }
    });

    it("intake is a valid agent state", () => {
      expect(AGENT_STATES).toContain("intake");
    });

    it("'running' is NOT a valid agent state (it's a database status)", () => {
      expect(AGENT_STATES).not.toContain("running");
    });

    it("'complete' is a valid agent state", () => {
      expect(AGENT_STATES).toContain("complete");
    });
  });

  describe("Tool allowlist", () => {
    it("all 10 tools are in the allowlist", () => {
      const expected = [
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
      ];
      for (const tool of expected) {
        expect(isToolAllowed(tool)).toBe(true);
      }
    });

    it("arbitrary tool names are rejected", () => {
      expect(isToolAllowed("shell.exec")).toBe(false);
      expect(isToolAllowed("sql.query")).toBe(false);
      expect(isToolAllowed("http.request")).toBe(false);
      expect(isToolAllowed("")).toBe(false);
    });
  });
});
