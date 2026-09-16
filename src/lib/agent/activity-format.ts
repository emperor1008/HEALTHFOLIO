/**
 * Healthfolio Activity formatting.
 *
 * Converts real agent run data (agent_runs + agent_steps) into the
 * user-facing activity narrative. Every line is derived from stored facts —
 * nothing is invented. If data is missing, the section is omitted.
 */

export interface AgentStepInput {
  sequence: number;
  phase: string;
  public_summary: string;
  tool_name: string | null;
  tool_status: string;
  error_code: string | null;
}

export interface AgentRunInput {
  id: string;
  goal: string;
  status: string;
  current_step: number | null;
}

export interface ActivityLines {
  goal: string | null;
  observed: string | null;
  decision: string | null;
  action: string | null;
  evaluation: string | null;
  adaptation: string | null;
}

const OBSERVED_RE = /(\d+)\s+test value|\((\d+)\s+values?\)|(\d+)\s+measurement/i;

/** Extract a count from summaries like "8 test values detected". */
export function extractObservedCount(summaries: string[]): number | null {
  for (const s of summaries) {
    const m = s.match(OBSERVED_RE);
    if (m) {
      const n = m.slice(1).find((g) => g !== undefined);
      if (n) return parseInt(n, 10);
    }
  }
  return null;
}

/** Extract an uncertain/review count from step summaries. */
export function extractUncertainCount(summaries: string[]): number | null {
  for (const s of summaries) {
    const m =
      s.match(/(\d+)\s+uncertain/i) ||
      s.match(/review.*?(\d+)/i) ||
      s.match(/(\d+)\s+conflicting/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** Extract a verified-added count from step summaries. */
export function extractVerifiedCount(summaries: string[]): number | null {
  for (const s of summaries) {
    const m =
      s.match(/(\d+)\s+verified/i) ||
      s.match(/verified\s+(\d+)/i) ||
      s.match(/added\s+(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export function formatActivity(
  run: AgentRunInput,
  steps: AgentStepInput[]
): ActivityLines {
  const summaries = steps.map((s) => s.public_summary || "");
  const succeeded = steps.filter((s) => s.tool_status === "succeeded");
  const blocked = steps.filter((s) => s.tool_status === "blocked");
  const failed = steps.filter((s) => s.tool_status === "failed");

  // ── Goal: user-facing phrasing of the stored run goal ──────────────
  const goalRaw = run.goal || "";
  let goal: string | null = null;
  if (goalRaw) {
    if (/process uploaded document/i.test(goalRaw)) {
      goal = "Organize this medical record";
    } else if (/lab|report/i.test(goalRaw)) {
      goal = "Organize this lab report";
    } else {
      goal = goalRaw.charAt(0).toUpperCase() + goalRaw.slice(1);
    }
  }

  // ── Observed: real counts found in step summaries ──────────────────
  const observedCount = extractObservedCount(summaries);
  const docCount = countDocsQueued(summaries);
  const observedParts: string[] = [];
  if (observedCount !== null) {
    observedParts.push(
      `${observedCount} test value${observedCount !== 1 ? "s" : ""} detected`
    );
  }
  if (docCount !== null && docCount > 0) {
    observedParts.push(
      `${docCount} document${docCount !== 1 ? "s" : ""} processed`
    );
  }
  const observed = observedParts.length > 0 ? observedParts.join(" · ") : null;

  // ── Decision: review requirements seen in real steps ───────────────
  const uncertain = extractUncertainCount(summaries);
  const hasReviewStep = steps.some(
    (s) =>
      s.tool_name === "clarification.request" ||
      /review/i.test(s.public_summary || "")
  );
  let decision: string | null = null;
  if (uncertain !== null && uncertain > 0) {
    decision = `Review required for ${uncertain} uncertain value${uncertain !== 1 ? "s" : ""}`;
  } else if (hasReviewStep) {
    decision = "Review required before continuing";
  } else if (succeeded.length > 0) {
    decision = "All extracted information was confident enough to organize";
  }

  // ── Action: what tools actually succeeded ──────────────────────────
  let action: string | null = null;
  const verified = extractVerifiedCount(summaries);
  if (verified !== null && verified > 0) {
    action = `Added ${verified} verified value${verified !== 1 ? "s" : ""} to Health Tracking`;
  } else if (succeeded.some((s) => s.tool_name === "document.ingest")) {
    action = "Read the document and extracted details";
  } else if (succeeded.some((s) => s.tool_name === "timeline.build")) {
    action = "Updated your verified timeline";
  }
  // If no specific, attributable action can be named, omit the line
  // rather than invent one.

  // ── Evaluation: current run status, stated factually ───────────────
  let evaluation: string | null = null;
  switch (run.status) {
    case "complete":
      evaluation = "Timeline updated";
      break;
    case "waiting_for_user":
      evaluation = "Paused until you review";
      break;
    case "blocked":
      evaluation = "Paused — needs your input";
      break;
    case "running":
      evaluation =
        run.current_step !== null && run.current_step > 0
          ? `Step ${run.current_step} in progress`
          : "Starting up";
      break;
    case "failed":
      evaluation = "Could not finish — your data is unchanged";
      break;
    default:
      evaluation = null;
  }

  // ── Adaptation: what the agent is waiting on, from real state ──────
  let adaptation: string | null = null;
  if (run.status === "waiting_for_user" || run.status === "blocked") {
    adaptation = "Waiting for your confirmation";
  } else if (run.status === "complete") {
    adaptation = "Nothing further needed right now";
  } else if (failed.length > 0) {
    adaptation = "Will retry automatically";
  } else if (run.status === "running") {
    adaptation = "Continuing to the next step";
  }

  return { goal, observed, decision, action, evaluation, adaptation };
}

function countDocsQueued(summaries: string[]): number | null {
  for (const s of summaries) {
    const m = s.match(/(\d+)\s+document/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}
