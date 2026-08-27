import { describe, it, expect } from "vitest";
import {
  isToolAllowed,
  canToolRunInState,
  isForbiddenAction,
  validateToolInput,
  ALLOWED_TOOLS,
} from "@/lib/tools/registry";

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

    it("should allow brief.generate in executing state", () => {
      expect(canToolRunInState("brief.generate", "executing")).toBe(true);
    });

    it("should not allow unknown tools in any state", () => {
      expect(canToolRunInState("unknown.tool", "intake")).toBe(false);
    });
  });

  describe("isForbiddenAction", () => {
    it("should block diagnosis actions", () => {
      expect(isForbiddenAction("diagnose", {})).toBe(true);
    });

    it("should block prescription actions", () => {
      expect(isForbiddenAction("prescribe", {})).toBe(true);
    });

    it("should block treatment actions", () => {
      expect(isForbiddenAction("treat", {})).toBe(true);
    });

    it("should not block legitimate tools", () => {
      expect(isForbiddenAction("document.ingest", { documentId: "123" })).toBe(false);
      expect(isForbiddenAction("timeline.build", { portfolioId: "123" })).toBe(false);
      expect(isForbiddenAction("brief.generate", { portfolioId: "123" })).toBe(false);
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
  });
});
