import { describe, it, expect } from "vitest";
import { checkSafetyBoundary } from "@/lib/ai/safety";

describe("checkSafetyBoundary", () => {
  it("blocks diagnosis requests", () => {
    expect(checkSafetyBoundary("What is my diagnosis?")).toEqual(
      expect.objectContaining({ allowed: false, violationType: "diagnosis" })
    );
  });

  it("blocks treatment requests", () => {
    expect(checkSafetyBoundary("What treatment should I take?")).toEqual(
      expect.objectContaining({ allowed: false, violationType: "treatment" })
    );
  });

  it("blocks medication change requests", () => {
    expect(checkSafetyBoundary("Should I stop my medication?")).toEqual(
      expect.objectContaining({ allowed: false, violationType: "medication_change" })
    );
  });

  it("blocks emergency requests", () => {
    const result = checkSafetyBoundary("I think I'm having a stroke");
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe("emergency");
    expect(result.response).toContain("emergency services");
  });

  it("allows normal consultation prep", () => {
    expect(checkSafetyBoundary("Organize my medical records for my appointment")).toEqual(
      expect.objectContaining({ allowed: true })
    );
  });

  it("allows document organization", () => {
    expect(checkSafetyBoundary("Help me prepare my lab reports for my doctor")).toEqual(
      expect.objectContaining({ allowed: true })
    );
  });
});
