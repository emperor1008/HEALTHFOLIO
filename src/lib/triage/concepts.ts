/**
 * Broad symptom concepts — the ONLY outputs the normalizer may produce.
 *
 * This is a deliberate closed set (Part 2 safety boundary):
 * - Every entry is a broad, plain-language symptom area, never a disease,
 *   condition name, or severity judgment by itself.
 * - No module outside this file may add or infer concepts.
 * - The triage engine reasons ONLY over these concepts (plus guided
 *   selections and user-confirmed follow-up answers).
 */

export const SYMPTOM_CONCEPTS = [
  "chest_discomfort",
  "difficulty_breathing",
  "fever",
  "fainting",
  "severe_bleeding",
  "weakness_one_side",
  "severe_headache",
  "vomiting",
  "pregnancy_concern",
  "injury",
  "abdominal_pain",
] as const;

export type SymptomConcept = (typeof SYMPTOM_CONCEPTS)[number];

export function isSymptomConcept(value: unknown): value is SymptomConcept {
  return typeof value === "string" && (SYMPTOM_CONCEPTS as readonly string[]).includes(value);
}

/** Normalize a list of unknown values to valid concepts (drops anything else). */
export function toSymptomConcepts(values: unknown[]): SymptomConcept[] {
  const out: SymptomConcept[] = [];
  for (const v of values) {
    if (isSymptomConcept(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Body areas selectable in the wizard. */
export const BODY_AREAS = ["head_face", "chest", "stomach", "arm_leg", "whole_body", "not_sure"] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export function isBodyArea(value: unknown): value is BodyArea {
  return typeof value === "string" && (BODY_AREAS as readonly string[]).includes(value);
}

/** Guided symptom categories shown on step 2 of the wizard. */
export const SYMPTOM_CATEGORIES = [
  "breathing_or_chest",
  "fever_or_infection",
  "pain_or_injury",
  "stomach_concern",
  "pregnancy_related",
  "child_health",
  "other",
] as const;
export type SymptomCategory = (typeof SYMPTOM_CATEGORIES)[number];

export function isSymptomCategory(value: unknown): value is SymptomCategory {
  return typeof value === "string" && (SYMPTOM_CATEGORIES as readonly string[]).includes(value);
}

/** Broad age groups. Used ONLY where a safety rule requires it, and only when the user provides it. */
export const AGE_GROUPS = ["adult", "child", "older_adult", "not_sure"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export function isAgeGroup(value: unknown): value is AgeGroup {
  return typeof value === "string" && (AGE_GROUPS as readonly string[]).includes(value);
}
