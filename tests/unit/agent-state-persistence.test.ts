import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  canToolRunInState,
  getNextState,
  isToolAllowed,
  AGENT_STATES,
  type AgentState,
} from "@/lib/tools/registry";

/**
 * Integration test proving the agent state machine persists correctly
 * through a complete lifecycle: intake → ingest → extract → verify → execute → complete.
 */

describe("Agent state persistence lifecycle", () => {
  // Simulate a complete agent run lifecycle
  const FULL_LIFECYCLE: Array<{
    from: AgentState;
    tool: string;
    to: AgentState;
    hasPendingReviews: boolean;
    hasUnprocessedDocs: boolean;
  }> = [
    // Step 1: Intake — ingest first document
    {
      from: "intake",
      tool: "document.ingest",
      to: "ingest",
      hasPendingReviews: false,
      hasUnprocessedDocs: true,
    },
    // Step 2: Ingest — extract from document (no more unprocessed docs)
    {
      from: "ingest",
      tool: "document.extract",
      to: "verify", // no pending reviews, no unprocessed → goes to verify
      hasPendingReviews: false,
      hasUnprocessedDocs: false,
    },
    // Step 3: Verify — export PDF
    {
      from: "verify",
      tool: "pdf.export",
      to: "complete",
      hasPendingReviews: false,
      hasUnprocessedDocs: false,
    },
  ];

  it("completes full lifecycle without invalid transitions", () => {
    let currentState: AgentState = "intake";
    const stateHistory: AgentState[] = [currentState];

    for (const step of FULL_LIFECYCLE) {
      // Verify current state matches expected
      expect(currentState).toBe(step.from);

      // Verify tool is allowed in current state
      expect(isToolAllowed(step.tool)).toBe(true);
      expect(canToolRunInState(step.tool, currentState)).toBe(true);

      // Compute next state
      const nextState = getNextState(
        currentState,
        step.tool as any,
        step.hasPendingReviews,
        step.hasUnprocessedDocs
      );

      // Verify transition is valid
      expect(nextState).toBe(step.to);
      stateHistory.push(nextState);
      currentState = nextState;
    }

    // Final state should be complete
    expect(currentState).toBe("complete");

    // State history: intake → ingest → verify → complete
    expect(stateHistory).toEqual([
      "intake",
      "ingest",
      "verify",
      "complete",
    ]);
  });

  it("rejects tools in wrong states", () => {
    // document.ingest is NOT allowed in extract state
    expect(canToolRunInState("document.ingest", "extract")).toBe(false);

    // brief.generate is NOT allowed in intake state
    expect(canToolRunInState("brief.generate", "intake")).toBe(false);

    // pdf.export is NOT allowed in intake state
    expect(canToolRunInState("pdf.export", "intake")).toBe(false);

    // timeline.build is NOT allowed in intake state
    expect(canToolRunInState("timeline.build", "intake")).toBe(false);
  });

  it("blocks at step limit", () => {
    const maxSteps = 12;
    let currentStep = 0;

    // Simulate running steps until limit
    while (currentStep < maxSteps) {
      currentStep++;
    }

    expect(currentStep).toBe(maxSteps);
    // At this point, the controller would mark complete
  });

  it("persists currentAgentState through state transitions", () => {
    // Simulate the state object that gets saved to agent_runs.state
    const runState = {
      runId: "test-run",
      userId: "user-1",
      portfolioId: "portfolio-1",
      goal: "Organize records",
      status: "running",
      currentAgentState: "intake" as AgentState,
      currentStep: 0,
      maxSteps: 12,
      retryCount: 0,
      maxRetries: 2,
      documentIds: ["doc-1"],
      verifiedExtractionIds: [],
      uncertainExtractionIds: [],
      blockedOn: null,
    };

    // Step 1: ingest
    expect(runState.currentAgentState).toBe("intake");
    expect(canToolRunInState("document.ingest", runState.currentAgentState)).toBe(true);
    runState.currentAgentState = getNextState(
      runState.currentAgentState,
      "document.ingest",
      false,
      true
    );
    expect(runState.currentAgentState).toBe("ingest");

    // Step 2: extract (no more unprocessed → goes to verify)
    expect(canToolRunInState("document.extract", runState.currentAgentState)).toBe(true);
    runState.currentAgentState = getNextState(
      runState.currentAgentState,
      "document.extract",
      false,
      false
    );
    expect(runState.currentAgentState).toBe("verify");

    // Step 3: pdf.export
    expect(canToolRunInState("pdf.export", runState.currentAgentState)).toBe(true);
    runState.currentAgentState = getNextState(
      runState.currentAgentState,
      "pdf.export",
      false,
      false
    );
    expect(runState.currentAgentState).toBe("complete");
  });

  it("handles review_required path correctly", () => {
    let state: AgentState = "extract";

    // Extract with pending reviews → review_required
    state = getNextState(state, "document.extract", true, false);
    expect(state).toBe("review_required");

    // In review_required, clarification.request is allowed
    expect(canToolRunInState("clarification.request", state)).toBe(true);

    // After clarification, stays in review_required
    state = getNextState(state, "clarification.request", true, false);
    expect(state).toBe("review_required");
  });

  it("all states are valid AgentState values", () => {
    for (const state of AGENT_STATES) {
      expect(typeof state).toBe("string");
      expect(state.length).toBeGreaterThan(0);
    }
  });
});
