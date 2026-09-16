import { describe, it, expect } from "vitest";
import {
  formatActivity,
  extractObservedCount,
  extractUncertainCount,
  extractVerifiedCount,
  type AgentRunInput,
  type AgentStepInput,
} from "@/lib/agent/activity-format";

function makeRun(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    id: "run-1",
    goal: "Process uploaded document",
    status: "complete",
    current_step: 5,
    ...overrides,
  };
}

function makeStep(overrides: Partial<AgentStepInput> = {}): AgentStepInput {
  return {
    sequence: 1,
    phase: "act",
    public_summary: "",
    tool_name: null,
    tool_status: "succeeded",
    error_code: null,
    ...overrides,
  };
}

describe("count extraction from real step summaries", () => {
  it("extracts observed test-value counts", () => {
    expect(extractObservedCount(["8 test values detected"])).toBe(8);
    expect(extractObservedCount(["Found 3 test values"])).toBe(3);
    expect(extractObservedCount(["no counts here"])).toBeNull();
  });

  it("extracts uncertain counts", () => {
    expect(extractUncertainCount(["Review required for 1 uncertain value"])).toBe(1);
    expect(extractUncertainCount(["2 conflicting items found"])).toBe(2);
  });

  it("extracts verified counts", () => {
    expect(extractVerifiedCount(["Added 7 verified values to tracking"])).toBe(7);
  });
});

describe("formatActivity", () => {
  it("formats a complete lab-report run with observed counts", () => {
    const run = makeRun({ status: "complete", goal: "Process uploaded document" });
    const steps = [
      makeStep({ sequence: 1, public_summary: "8 test values detected", tool_name: "document.extract" }),
      makeStep({ sequence: 2, public_summary: "Review required for 1 uncertain value", tool_name: "clarification.request" }),
      makeStep({ sequence: 3, public_summary: "Added 7 verified values to Health Tracking", tool_name: "measurement.upsert" }),
    ];

    const result = formatActivity(run, steps);

    expect(result.goal).toBe("Organize this medical record");
    expect(result.observed).toContain("8 test values detected");
    expect(result.decision).toBe("Review required for 1 uncertain value");
    // The action count comes from the step that actually reported it
    expect(result.action).toBe("Added 7 verified values to Health Tracking");
    expect(result.evaluation).toBe("Timeline updated");
    expect(result.adaptation).toBe("Nothing further needed right now");
  });

  it("formats a waiting-for-user run honestly", () => {
    const run = makeRun({ status: "waiting_for_user" });
    const steps = [
      makeStep({ sequence: 1, public_summary: "Extracted information needs review.", tool_name: "clarification.request" }),
    ];

    const result = formatActivity(run, steps);

    expect(result.evaluation).toBe("Paused until you review");
    expect(result.adaptation).toBe("Waiting for your confirmation");
    expect(result.decision).toBe("Review required before continuing");
  });

  it("never invents counts when steps carry none", () => {
    const run = makeRun({ status: "running", current_step: 2 });
    const steps = [makeStep({ sequence: 1, public_summary: "Goal received" })];

    const result = formatActivity(run, steps);

    expect(result.observed).toBeNull();
    expect(result.action).toBeNull();
    expect(result.evaluation).toBe("Step 2 in progress");
    expect(result.adaptation).toBe("Continuing to the next step");
  });

  it("omits lines that cannot be derived", () => {
    const result = formatActivity(makeRun({ status: "unknown_status" }), []);
    expect(result.observed).toBeNull();
    expect(result.decision).toBeNull();
    expect(result.action).toBeNull();
    expect(result.evaluation).toBeNull();
    expect(result.adaptation).toBeNull();
  });

  it("reports failure without exposing technical error codes", () => {
    const steps = [
      makeStep({ sequence: 1, tool_status: "failed", error_code: "OCR_TIMEOUT" }),
    ];
    const result = formatActivity(makeRun({ status: "failed" }), steps);

    expect(result.evaluation).toBe("Could not finish — your data is unchanged");
    expect(JSON.stringify(result)).not.toContain("OCR_TIMEOUT");
  });
});
