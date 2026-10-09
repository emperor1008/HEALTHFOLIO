/**
 * Symptom interpretation + structured triage decision (Phase 2).
 *
 * TWO-LAYER SAFETY ARCHITECTURE
 *
 * Layer 1 — interpretation (this file's schemas + the AI provider wrapper):
 *   understands language, maps to BROAD canonical concepts, duration,
 *   severity, and at most a suggested clarification id. Output is always
 *   schema-validated; unknown concepts/follow-ups are discarded, never
 *   promoted. Layer 1 can never reach the safety engine unvalidated.
 *
 * Layer 2 — deterministic safety engine (red-flags.ts):
 *   the FINAL authority on urgency. `buildTriageDecision` derives the
 *   patient-facing decision exclusively from `evaluateTriage` output; an
 *   "uncertain" outcome only ever softens a ROUTINE result when nothing was
 *   understood — an engine emergency/urgent result always wins.
 *
 * Everything here is pure and offline (no network, no LLM, no I/O) so the
 * same code runs in the browser without connectivity and on the server.
 */

import { z } from "zod";
import { SYMPTOM_CONCEPTS, isSymptomConcept, type SymptomConcept } from "./concepts";
import {
  FOLLOW_UP_IDS,
  isFollowUpId,
  evaluateTriage,
  type FollowUpId,
  type TriageResult,
} from "./red-flags";
import { normalizeSymptomText, type Confidence } from "./normalizer";

// ── Layer 1 schemas ────────────────────────────────────────────────────────

export const InterpretationLanguageSchema = z.enum(["en", "hi", "or"]);
export type InterpretationLanguage = z.infer<typeof InterpretationLanguageSchema>;

export const SymptomDurationSchema = z.object({
  value: z.number().int().min(0).max(3650),
  unit: z.enum(["hours", "days", "weeks", "months"]),
});
export type SymptomDuration = z.infer<typeof SymptomDurationSchema>;

export const SymptomSeveritySchema = z.enum(["mild", "moderate", "severe"]);
export type SymptomSeverity = z.infer<typeof SymptomSeveritySchema>;

/**
 * Strict schema for LAYER 1 (AI) output. `.strict()`: unknown keys or wrong
 * shapes invalidate the whole response and the caller falls back safely.
 * `language` is intentionally NOT part of the model contract — the request
 * language is authoritative (one less way for a model to fail).
 */
export const ModelInterpretationSchema = z
  .object({
    concepts: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(20),
    duration: SymptomDurationSchema.nullable(),
    severity: SymptomSeveritySchema.nullable(),
    suggestedFollowUpId: z.string().max(40).nullable(),
  })
  .strict();

export type ModelInterpretation = z.infer<typeof ModelInterpretationSchema>;

/** Layer 1 result after validation — only canonical values survive. */
export interface SanitizedInterpretation {
  concepts: SymptomConcept[];
  /** Non-canonical concept ids the model produced (safe to log; never used). */
  droppedConcepts: string[];
  duration: SymptomDuration | null;
  severity: SymptomSeverity | null;
  /** Present only when the id is in the reviewed follow-up set. */
  suggestedFollowUpId: FollowUpId | null;
  /** True when a suggested follow-up id was discarded as unknown. */
  droppedFollowUp: boolean;
}

/**
 * Validate + canonicalize raw Layer 1 output.
 * Returns null when the payload does not match the strict schema at all —
 * the caller then uses the deterministic path only.
 */
export function sanitizeInterpretation(raw: unknown): SanitizedInterpretation | null {
  const parsed = ModelInterpretationSchema.safeParse(raw);
  if (!parsed.success) return null;

  const concepts: SymptomConcept[] = [];
  const droppedConcepts: string[] = [];
  for (const entry of parsed.data.concepts) {
    if (isSymptomConcept(entry.id)) {
      if (!concepts.includes(entry.id)) concepts.push(entry.id);
    } else if (!droppedConcepts.includes(entry.id)) {
      droppedConcepts.push(entry.id);
    }
  }

  const suggested = parsed.data.suggestedFollowUpId;
  const followUpOk = suggested !== null && isFollowUpId(suggested);

  return {
    concepts,
    droppedConcepts,
    duration: parsed.data.duration,
    severity: parsed.data.severity,
    suggestedFollowUpId: followUpOk ? suggested : null,
    droppedFollowUp: suggested !== null && !followUpOk,
  };
}

// ── Deterministic merge ────────────────────────────────────────────────────

export interface MergeConceptsInput {
  /** The patient's own words (may be empty when they only tapped buttons). */
  text: string;
  /** Canonical concepts from Layer 1 (already sanitized). */
  aiConcepts?: readonly SymptomConcept[] | null;
  /** Concepts the patient explicitly picked/confirmed in the guided flow. */
  userConfirmed?: readonly SymptomConcept[] | null;
}

export interface MergedConcepts {
  /** Union of deterministic + AI + user concepts. AI can ADD, never REMOVE. */
  concepts: SymptomConcept[];
  /**
   * True when nothing validated could be understood — the UI must respond
   * with clarification or clinical review, NEVER with reassurance.
   */
  uncertain: boolean;
  confidence: Record<string, Confidence>;
  fromText: SymptomConcept[];
  fromAi: SymptomConcept[];
  fromUser: SymptomConcept[];
}

/**
 * PIPELINE (Phase 2 spec §31):
 *   input → AI concepts (validated) → deterministic normalizer → merge →
 *   safety engine. Unknown AI concepts were already discarded upstream;
 *   the deterministic path always runs so an AI outage changes nothing
 *   about what the safety engine sees for locally-recognizable text.
 */
export function mergeSymptomConcepts(input: MergeConceptsInput): MergedConcepts {
  const normalized = normalizeSymptomText(input.text);

  const fromText = normalized.concepts;
  const fromAi = (input.aiConcepts ?? []).filter(isSymptomConcept);
  const fromUser = (input.userConfirmed ?? []).filter(isSymptomConcept);

  const concepts: SymptomConcept[] = [];
  const push = (list: readonly SymptomConcept[]) => {
    for (const c of list) if (!concepts.includes(c)) concepts.push(c);
  };
  push(fromText);
  push(fromAi);
  push(fromUser);

  return {
    concepts,
    uncertain: concepts.length === 0,
    confidence: normalized.confidence,
    fromText,
    fromAi,
    fromUser,
  };
}

// ── Duration → rule-relevant follow-up mapping ─────────────────────────────

function durationToDays(duration: SymptomDuration): number {
  switch (duration.unit) {
    case "hours":
      return duration.value / 24;
    case "days":
      return duration.value;
    case "weeks":
      return duration.value * 7;
    case "months":
      return duration.value * 30;
  }
}

/**
 * Deterministic mapping of a validated duration onto the ONE follow-up whose
 * reviewed rule is duration-based (`fever_three_days_or_more` → UR-03).
 * No new clinical rules are invented; explicit answers always win.
 */
export function durationToFollowUps(
  duration: SymptomDuration | null
): Partial<Record<FollowUpId, boolean>> {
  if (!duration) return {};
  if (durationToDays(duration) >= 3) return { fever_three_days_or_more: true };
  return {};
}

/** Explicit clarification answers override duration-derived hints. */
export function mergeFollowUpAnswers(
  duration: SymptomDuration | null,
  explicit: Partial<Record<FollowUpId, boolean>>
): Partial<Record<FollowUpId, boolean>> {
  return { ...durationToFollowUps(duration), ...explicit };
}

// ── Layer 2: structured decision ───────────────────────────────────────────

export type TriageUrgency = "emergency" | "urgent" | "routine" | "uncertain";

export type TriageNextAction =
  | "seek_emergency_help"
  | "seek_urgent_clinical_review"
  | "talk_to_a_doctor"
  | "clarify_or_request_review";

export type SafetyMessageKey = "safeEmergency" | "safeUrgent" | "safeRoutine" | "safeUncertain";

/**
 * The patient-facing decision. `reasonCode` is a stable rule id or fixed
 * routing code — never free-form medical prose. `safetyMessageKey` is an
 * i18n key (the UI renders the translated message).
 */
export interface TriageDecision {
  urgency: TriageUrgency;
  reasonCode: string;
  nextAction: TriageNextAction;
  safetyMessageKey: SafetyMessageKey;
  ruleIds: string[];
  rulesVersion: string;
  evaluatedAt: string;
}

export interface DecisionInput {
  /** Output of the deterministic engine (Layer 2). */
  result: TriageResult;
  /** Whether any validated concept was understood from the patient's input. */
  understood: boolean;
}

/**
 * Build the decision from the DETERMINISTIC engine only.
 * Precedence: engine emergency → engine urgent → (nothing understood →
 * uncertain) → routine. Layer 1 output is never an input here.
 */
export function buildTriageDecision(input: DecisionInput, nowIso?: string): TriageDecision {
  const { result, understood } = input;
  const ruleIds = result.triggered.map((t) => t.id);
  const base = {
    ruleIds,
    rulesVersion: result.rulesVersion,
    evaluatedAt: nowIso ?? new Date().toISOString(),
  };

  if (result.category === "emergency") {
    return {
      ...base,
      urgency: "emergency",
      reasonCode: ruleIds.find((id) => id.startsWith("EM-")) ?? "em_rule_triggered",
      nextAction: "seek_emergency_help",
      safetyMessageKey: "safeEmergency",
    };
  }
  if (result.category === "urgent") {
    return {
      ...base,
      urgency: "urgent",
      reasonCode: ruleIds.find((id) => id.startsWith("UR-")) ?? "ur_rule_triggered",
      nextAction: "seek_urgent_clinical_review",
      safetyMessageKey: "safeUrgent",
    };
  }
  if (!understood) {
    return {
      ...base,
      urgency: "uncertain",
      reasonCode: "uncertain_input",
      nextAction: "clarify_or_request_review",
      safetyMessageKey: "safeUncertain",
    };
  }
  return {
    ...base,
    urgency: "routine",
    reasonCode: "routine_no_red_flag",
    nextAction: "talk_to_a_doctor",
    safetyMessageKey: "safeRoutine",
  };
}

/** One-call evaluation used by the guided checker (pure, offline). */
export function evaluateAndDecide(input: {
  concepts: SymptomConcept[];
  followUps: Partial<Record<FollowUpId, boolean>>;
  duration: SymptomDuration | null;
  nowIso?: string;
}): TriageDecision {
  const merged = mergeFollowUpAnswers(input.duration, input.followUps);
  const result = evaluateTriage({ concepts: input.concepts, followUps: merged });
  return buildTriageDecision({ result, understood: input.concepts.length > 0 }, input.nowIso);
}

/** Canonical concept list (for prompts and validation messages). */
export const CANONICAL_CONCEPT_IDS: readonly string[] = SYMPTOM_CONCEPTS;
export const CANONICAL_FOLLOW_UP_IDS: readonly string[] = FOLLOW_UP_IDS;
