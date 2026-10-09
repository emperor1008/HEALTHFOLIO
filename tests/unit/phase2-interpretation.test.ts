/**
 * Phase 2 — two-layer interpretation safety tests (pure, offline).
 *
 * Proves the safety contract of interpretation.ts:
 * - Layer 1 output is strictly validated; unknown concepts/follow-up ids are
 *   DROPPED, never promoted;
 * - the deterministic normalizer always runs (AI outage changes nothing);
 * - AI can ADD concepts, never REMOVE them; nothing understood ⇒ uncertain
 *   (clarify, never reassurance);
 * - duration maps only onto the ONE reviewed duration-based rule (UR-03)
 *   and explicit answers always win;
 * - Layer 2 decisions come from the deterministic engine ONLY:
 *     MANDATORY red-flag override test — an AI "routine-looking" story can
 *     never downgrade an engine emergency/urgent result;
 * - decisions never contain diagnosis wording — only rule ids and i18n keys;
 * - multilingual normalization (en / hi / romanized / or / mixed).
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeInterpretation,
  mergeSymptomConcepts,
  durationToFollowUps,
  mergeFollowUpAnswers,
  buildTriageDecision,
  evaluateAndDecide,
  CANONICAL_CONCEPT_IDS,
  CANONICAL_FOLLOW_UP_IDS,
} from "@/lib/triage/interpretation";
import { evaluateTriage, RULES_VERSION } from "@/lib/triage/red-flags";
import { normalizeSymptomText } from "@/lib/triage/normalizer";

const NOW = "2026-10-02T00:00:00.000Z";

// ── Layer 1: sanitize ──────────────────────────────────────────────────────

describe("sanitizeInterpretation (Layer 1 validation)", () => {
  const valid = {
    concepts: [{ id: "fever", confidence: 0.9 }],
    duration: { value: 2, unit: "days" },
    severity: "moderate",
    suggestedFollowUpId: "fever_three_days_or_more",
  };

  it("accepts a valid payload", () => {
    const out = sanitizeInterpretation(valid);
    expect(out).not.toBeNull();
    expect(out?.concepts).toEqual(["fever"]);
    expect(out?.duration).toEqual({ value: 2, unit: "days" });
    expect(out?.severity).toBe("moderate");
    expect(out?.suggestedFollowUpId).toBe("fever_three_days_or_more");
    expect(out?.droppedFollowUp).toBe(false);
  });

  it("rejects a payload that does not match the strict schema", () => {
    expect(sanitizeInterpretation({ concepts: "fever" })).toBeNull();
    expect(sanitizeInterpretation(null)).toBeNull();
    expect(sanitizeInterpretation({ concepts: [], extra: true })).toBeNull(); // strict()
    expect(
      sanitizeInterpretation({ ...valid, duration: { value: -1, unit: "days" } })
    ).toBeNull();
  });

  it("drops non-canonical concept ids instead of promoting them", () => {
    const out = sanitizeInterpretation({
      ...valid,
      concepts: [
        { id: "dengue", confidence: 0.99 },
        { id: "fever", confidence: 0.4 },
      ],
    });
    expect(out?.concepts).toEqual(["fever"]);
    expect(out?.droppedConcepts).toEqual(["dengue"]);
  });

  it("drops an unknown follow-up id and flags it", () => {
    const out = sanitizeInterpretation({ ...valid, suggestedFollowUpId: "give_antibiotics" });
    expect(out?.suggestedFollowUpId).toBeNull();
    expect(out?.droppedFollowUp).toBe(true);
  });

  it("treats all-low-confidence AI output with no surviving concept as empty", () => {
    const out = sanitizeInterpretation({
      ...valid,
      concepts: [{ id: "totally_unknown", confidence: 0.1 }],
    });
    expect(out?.concepts).toEqual([]);
    expect(out?.droppedConcepts).toEqual(["totally_unknown"]);
  });

  it("canonical vocabularies are the closed sets", () => {
    expect(CANONICAL_CONCEPT_IDS).toContain("chest_discomfort");
    expect(CANONICAL_CONCEPT_IDS).not.toContain("dengue");
    expect(CANONICAL_FOLLOW_UP_IDS).toContain("fever_three_days_or_more");
    expect(CANONICAL_FOLLOW_UP_IDS).toHaveLength(8);
  });
});

// ── Merge: AI can add, never remove ────────────────────────────────────────

describe("mergeSymptomConcepts (deterministic merge)", () => {
  it("runs the deterministic normalizer even with no AI at all", () => {
    const out = mergeSymptomConcepts({ text: "mujhe bukhar hai", aiConcepts: null });
    expect(out.concepts).toContain("fever");
    expect(out.uncertain).toBe(false);
  });

  it("AI adds concepts the normalizer missed but cannot remove any", () => {
    const out = mergeSymptomConcepts({
      text: "मुझे बुखार है",
      aiConcepts: ["vomiting"],
    });
    expect(out.concepts).toEqual(expect.arrayContaining(["fever", "vomiting"]));
    expect(out.fromText).toContain("fever");
    expect(out.fromAi).toContain("vomiting");
  });

  it("user-confirmed selections always survive", () => {
    const out = mergeSymptomConcepts({
      text: "",
      aiConcepts: [],
      userConfirmed: ["injury"],
    });
    expect(out.concepts).toEqual(["injury"]);
    expect(out.uncertain).toBe(false);
  });

  it("nothing understood ⇒ uncertain (never reassurance)", () => {
    const out = mergeSymptomConcepts({ text: "asdf qwerty zzz", aiConcepts: [] });
    expect(out.concepts).toEqual([]);
    expect(out.uncertain).toBe(true);
  });
});

// ── Duration → the one reviewed duration-based rule ────────────────────────

describe("duration mapping", () => {
  it("≥3 days maps onto fever_three_days_or_more only", () => {
    expect(durationToFollowUps({ value: 3, unit: "days" })).toEqual({
      fever_three_days_or_more: true,
    });
    expect(durationToFollowUps({ value: 72, unit: "hours" })).toEqual({
      fever_three_days_or_more: true,
    });
    expect(durationToFollowUps({ value: 2, unit: "weeks" })).toEqual({
      fever_three_days_or_more: true,
    });
    expect(durationToFollowUps({ value: 2, unit: "days" })).toEqual({});
    expect(durationToFollowUps(null)).toEqual({});
  });

  it("explicit answers override duration-derived hints", () => {
    expect(
      mergeFollowUpAnswers({ value: 5, unit: "days" }, { fever_three_days_or_more: false })
    ).toEqual({ fever_three_days_or_more: false });
    expect(mergeFollowUpAnswers({ value: 1, unit: "days" }, {})).toEqual({});
  });

  it("duration ≥3 days with fever triggers exactly UR-03 (urgent)", () => {
    const decision = evaluateAndDecide({
      concepts: ["fever"],
      followUps: {},
      duration: { value: 4, unit: "days" },
      nowIso: NOW,
    });
    expect(decision.urgency).toBe("urgent");
    expect(decision.ruleIds).toContain("UR-03");
    expect(decision.rulesVersion).toBe(RULES_VERSION);
  });
});

// ── Layer 2: decision precedence + MANDATORY red-flag override ─────────────

describe("buildTriageDecision (deterministic authority)", () => {
  const emergencyResult = evaluateTriage({ concepts: ["fainting"] });
  const urgentResult = evaluateTriage({ concepts: ["difficulty_breathing"] });
  const routineResult = evaluateTriage({ concepts: [] });

  it("emergency wins outright", () => {
    const d = buildTriageDecision({ result: emergencyResult, understood: true }, NOW);
    expect(d.urgency).toBe("emergency");
    expect(d.nextAction).toBe("seek_emergency_help");
    expect(d.safetyMessageKey).toBe("safeEmergency");
    expect(d.ruleIds.every((id) => id.startsWith("EM-"))).toBe(true);
  });

  it("urgent wins over 'not understood'", () => {
    const d = buildTriageDecision({ result: urgentResult, understood: false }, NOW);
    expect(d.urgency).toBe("urgent"); // uncertainty only ever softens routine
    expect(d.safetyMessageKey).toBe("safeUrgent");
  });

  it("uncertain only when nothing was understood AND engine is routine", () => {
    const d = buildTriageDecision({ result: routineResult, understood: false }, NOW);
    expect(d.urgency).toBe("uncertain");
    expect(d.nextAction).toBe("clarify_or_request_review");
    expect(d.safetyMessageKey).toBe("safeUncertain");
  });

  it("understood + no red flag ⇒ routine routing (never a health claim)", () => {
    const d = buildTriageDecision(
      { result: evaluateTriage({ concepts: ["fever"] }), understood: true },
      NOW
    );
    expect(d.urgency).toBe("routine");
    expect(d.reasonCode).toBe("routine_no_red_flag");
    expect(d.nextAction).toBe("talk_to_a_doctor");
    expect(d.safetyMessageKey).toBe("safeRoutine");
  });

  it("MANDATORY red-flag override: AI non-red-flag story never downgrades engine emergency", () => {
    // Layer 1 "understands" only a benign-looking fever; the patient ALSO
    // confirmed fainting (or the normalizer found it). Engine → EM-03.
    const merged = mergeSymptomConcepts({
      text: "behosh ho gaya",
      aiConcepts: ["fever"], // AI saw only fever
      userConfirmed: ["fainting"],
    });
    expect(merged.concepts).toEqual(expect.arrayContaining(["fever", "fainting"]));

    const engine = evaluateTriage({ concepts: merged.concepts, followUps: {} });
    expect(engine.category).toBe("emergency");

    // Even with understood=false (worst case), the engine's emergency stands.
    const d = buildTriageDecision({ result: engine, understood: false }, NOW);
    expect(d.urgency).toBe("emergency");
    expect(d.safetyMessageKey).toBe("safeEmergency");
    expect(d.ruleIds).toContain("EM-03");
  });

  it("MANDATORY red-flag override: AI cannot downgrade an engine urgent result", () => {
    const engine = evaluateTriage({ concepts: ["chest_discomfort"], followUps: {} });
    expect(engine.category).toBe("urgent");
    const d = buildTriageDecision({ result: engine, understood: false }, NOW);
    expect(d.urgency).toBe("urgent");
    expect(d.safetyMessageKey).toBe("safeUrgent");
  });

  it("decisions carry no diagnosis or free-text medical prose", () => {
    const d = buildTriageDecision({ result: emergencyResult, understood: true }, NOW);
    const allowedMessageKeys = ["safeEmergency", "safeUrgent", "safeRoutine", "safeUncertain"];
    expect(allowedMessageKeys).toContain(d.safetyMessageKey);
    for (const code of [d.reasonCode, ...d.ruleIds]) {
      expect(code.toLowerCase()).not.toMatch(/diagnos|disease|prescrib|pill|tablet/);
    }
    expect(Object.keys(d).sort()).toEqual(
      ["evaluatedAt", "nextAction", "reasonCode", "ruleIds", "rulesVersion", "safetyMessageKey", "urgency"].sort()
    );
  });
});

// ── Multilingual normalization feeding the engine ──────────────────────────

describe("multilingual symptom understanding", () => {
  it("en / hi / romanized / or / mixed all reach the same canonical concept", () => {
    const samples: Array<[string, string]> = [
      ["en", "I have fever since two days"],
      ["hi", "मुझे बुखार है"],
      ["romanized", "mujhe bukhar hai"],
      ["or", "ମୋର ଜ୍ୱର ଅଛି"],
      ["mixed", "bukhar aur vomiting hai"],
    ];
    for (const [, text] of samples) {
      const out = mergeSymptomConcepts({ text, aiConcepts: null });
      expect(out.concepts, text).toContain("fever");
      expect(out.uncertain, text).toBe(false);
    }
    expect(
      mergeSymptomConcepts({ text: "bukhar aur vomiting hai", aiConcepts: null }).concepts
    ).toContain("vomiting");
  });

  it("AI outage does not change what the engine sees for recognizable text", () => {
    const text = "मुझे बुखार है";
    const withAi = mergeSymptomConcepts({ text, aiConcepts: ["vomiting"] });
    const withoutAi = mergeSymptomConcepts({ text, aiConcepts: null });
    for (const c of withoutAi.concepts) {
      expect(withAi.concepts).toContain(c); // AI can add, never remove
    }
    const decision = evaluateAndDecide({
      concepts: withoutAi.concepts,
      followUps: {},
      duration: null,
      nowIso: NOW,
    });
    expect(decision.urgency).toBe("routine");
    expect(decision.rulesVersion).toBe(RULES_VERSION);
  });

  it("normalizer never invents concepts outside the closed set", () => {
    const r = normalizeSymptomText("maybe dengue or covid with fever");
    for (const c of r.concepts) expect(CANONICAL_CONCEPT_IDS).toContain(c);
  });
});
