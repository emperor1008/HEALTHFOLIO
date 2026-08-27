import { describe, it, expect } from "vitest";
import { checkSafetyBoundary } from "@/lib/ai/safety";

describe("AI Safety Module", () => {
  describe("checkSafetyBoundary", () => {
    it("should block diagnosis requests", () => {
      const result = checkSafetyBoundary("What is my diagnosis?");
      expect(result.allowed).toBe(false);
      expect(result.violationType).toBe("diagnosis");
      expect(result.response).toContain("does not diagnose");
    });

    it("should block treatment requests", () => {
      const result = checkSafetyBoundary("What treatment should I take?");
      expect(result.allowed).toBe(false);
      expect(result.violationType).toBe("treatment");
    });

    it("should block medication change requests", () => {
      const result = checkSafetyBoundary("Should I stop my medication?");
      expect(result.allowed).toBe(false);
      expect(result.violationType).toBe("medication_change");
    });

    it("should block emergency requests", () => {
      const result = checkSafetyBoundary("I think I'm having a stroke");
      expect(result.allowed).toBe(false);
      expect(result.violationType).toBe("emergency");
      expect(result.response).toContain("emergency services");
    });

    it("should allow normal consultation prep", () => {
      const result = checkSafetyBoundary("Organize my medical records for my appointment");
      expect(result.allowed).toBe(true);
    });

    it("should allow document organization", () => {
      const result = checkSafetyBoundary("Help me prepare my lab reports for my doctor");
      expect(result.allowed).toBe(true);
    });
  });
});
