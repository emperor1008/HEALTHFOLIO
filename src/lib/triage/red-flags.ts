/**
 * Deterministic, versioned emergency red-flag rules engine (Part 2).
 *
 * SAFETY CONTRACT
 * - Pure, offline, synchronous functions. No LLM, no network, no randomness.
 * - Evaluates ONLY: guided selections, normalized broad symptom concepts,
 *   user-confirmed yes/no follow-up answers, and age group (only where a
 *   rule needs it and only when the user provided it).
 * - Never produces a disease name, diagnosis, medicine, dosage, or
 *   reassurance. Output is a care-routing category + triggered rule IDs.
 * - The engine CANNOT tell a user they are safe: "routine" is a routing
 *   outcome, never a health claim. UI must not phrase routine as "you are OK".
 *
 * AUDITABILITY
 * - Every rule has a stable ID, a human-readable description, and a
 *   clinical-safety source reference string. RULES_VERSION is bumped when
 *   rules change; the version and triggered IDs are stored with the packet.
 *
 * PRIORITY: any emergency rule ⇒ EMERGENCY, regardless of everything else.
 */

import type { AgeGroup, BodyArea, SymptomCategory, SymptomConcept } from "./concepts";
import { isAgeGroup } from "./concepts";

export const RULES_VERSION = "2026.09-part2.1";

/** Trigger inputs the engine is allowed to reason over. */
export interface TriageInput {
  concepts: SymptomConcept[];
  category?: SymptomCategory | null;
  bodyArea?: BodyArea | null;
  /** Yes/no follow-up answers, keyed by stable follow-up ID. All optional. */
  followUps?: Partial<Record<FollowUpId, boolean>>;
  /** Provided only when the user explicitly gave it. Optional. */
  ageGroup?: AgeGroup | null;
}

export type TriageCategory = "emergency" | "urgent" | "routine";

export interface TriggeredRule {
  id: string;
  /** Internal description for audit logs — NOT for patient display. */
  description: string;
  source: string;
}

export interface TriageResult {
  category: TriageCategory;
  triggered: TriggeredRule[];
  rulesVersion: string;
}

/** Stable follow-up question IDs (used by rules and UI). */
export const FOLLOW_UP_IDS = [
  "breathing_worse_at_rest",
  "chest_pressure_spreading",
  "bleeding_wont_stop",
  "vomiting_cannot_keep_fluids",
  "fever_three_days_or_more",
  "headache_sudden_worst_ever",
  "injury_from_major_trauma",
  "symptoms_suddenly_worse",
] as const;
export type FollowUpId = (typeof FOLLOW_UP_IDS)[number];

export function isFollowUpId(value: unknown): value is FollowUpId {
  return typeof value === "string" && (FOLLOW_UP_IDS as readonly string[]).includes(value);
}

/**
 * Rule definitions. Each condition is a pure predicate over TriageInput.
 * Sources cite the public, widely recognized basis for the sign grouping;
 * wording here is for clinicians/auditors, not patients.
 */
interface RuleDef {
  id: string;
  category: Exclude<TriageCategory, "routine">;
  description: string;
  source: string;
  when: (input: TriageInput) => boolean;
}

const has = (c: SymptomConcept, input: TriageInput) => input.concepts.includes(c);

const RULE_DEFS: RuleDef[] = [
  // ── EMERGENCY NOW ────────────────────────────────────────────────────────
  {
    id: "EM-01",
    category: "emergency",
    description: "Severe breathing difficulty at rest",
    source: "WHO/IMAI acute care guidance; textbook emergency signs (severe respiratory distress)",
    when: (i) =>
      has("difficulty_breathing", i) && (i.followUps?.breathing_worse_at_rest === true || i.ageGroup === "older_adult"),
  },
  {
    id: "EM-02",
    category: "emergency",
    description: "Chest discomfort with spreading pressure or collapse features",
    source: "Standard acute coronary syndrome warning-sign checklists (public emergency guidance)",
    when: (i) => has("chest_discomfort", i) && i.followUps?.chest_pressure_spreading === true,
  },
  {
    id: "EM-03",
    category: "emergency",
    description: "Unconsciousness, collapse, or seizure activity",
    source: "Basic emergency care signs of reduced responsiveness or active seizure",
    when: (i) => has("fainting", i),
  },
  {
    id: "EM-04",
    category: "emergency",
    description: "Stroke warning signs (one-sided weakness, facial droop, speech loss)",
    source: "Public stroke FAST-sign criteria",
    when: (i) => has("weakness_one_side", i),
  },
  {
    id: "EM-05",
    category: "emergency",
    description: "Uncontrolled or severe bleeding",
    source: "Bleeding-control first-aid emergency criteria",
    when: (i) => has("severe_bleeding", i) || i.followUps?.bleeding_wont_stop === true,
  },
  {
    id: "EM-06",
    category: "emergency",
    description: "Severe allergic-reaction signs (rapid swelling with breathing difficulty)",
    source: "Anaphylaxis first-response public criteria (combination sign)",
    when: (i) => has("difficulty_breathing", i) && has("vomiting", i) && i.followUps?.symptoms_suddenly_worse === true,
  },
  {
    id: "EM-07",
    category: "emergency",
    description: "Major trauma / injury from high-impact event",
    source: "Trauma triage mechanism-of-injury public criteria",
    when: (i) => has("injury", i) && i.followUps?.injury_from_major_trauma === true,
  },
  {
    id: "EM-08",
    category: "emergency",
    description: "Pregnancy bleeding or severe pregnancy warning signs",
    source: "WHO pregnancy danger-sign list (bleeding, severe symptoms during pregnancy)",
    when: (i) => has("pregnancy_concern", i) && (has("severe_bleeding", i) || i.followUps?.symptoms_suddenly_worse === true),
  },
  {
    id: "EM-09",
    category: "emergency",
    description: "Sudden worst-ever headache",
    source: "Sudden severe headache emergency presentation (public health guidance)",
    when: (i) =>
      has("severe_headache", i) &&
      (i.followUps?.headache_sudden_worst_ever === true || i.followUps?.symptoms_suddenly_worse === true),
  },
  {
    id: "EM-10",
    category: "emergency",
    description: "Vomiting with inability to keep fluids down in a vulnerable person",
    source: "Dehydration danger signs in vulnerable groups (WHO/UNICEF guidance)",
    when: (i) =>
      has("vomiting", i) &&
      i.followUps?.vomiting_cannot_keep_fluids === true &&
      (i.ageGroup === "child" || i.ageGroup === "older_adult"),
  },
  {
    id: "EM-11",
    category: "emergency",
    description: "Emergency flags for infants and young children",
    source: "WHO/IMCI infant danger signs applied conservatively",
    when: (i) =>
      i.category === "child_health" &&
      i.ageGroup === "child" &&
      (has("difficulty_breathing", i) || has("fainting", i) || has("severe_bleeding", i)),
  },

  // ── URGENT CLINICAL CONTACT ──────────────────────────────────────────────
  {
    id: "UR-01",
    category: "urgent",
    description: "Breathing difficulty without emergency features",
    source: "Acute respiratory symptom referral guidance",
    when: (i) => has("difficulty_breathing", i),
  },
  {
    id: "UR-02",
    category: "urgent",
    description: "Chest discomfort without emergency features",
    source: "Chest symptom referral guidance",
    when: (i) => has("chest_discomfort", i),
  },
  {
    id: "UR-03",
    category: "urgent",
    description: "Prolonged or high fever",
    source: "Fever referral duration thresholds (public health guidance)",
    when: (i) => has("fever", i) && i.followUps?.fever_three_days_or_more === true,
  },
  {
    id: "UR-04",
    category: "urgent",
    description: "Persistent vomiting",
    source: "Fluid-loss referral guidance",
    when: (i) => has("vomiting", i) && i.followUps?.vomiting_cannot_keep_fluids === true,
  },
  {
    id: "UR-05",
    category: "urgent",
    description: "Severe headache without sudden onset",
    source: "Headache referral guidance",
    when: (i) => has("severe_headache", i),
  },
  {
    id: "UR-06",
    category: "urgent",
    description: "Pregnancy-related concern",
    source: "Antenatal contact guidance for new or concerning symptoms",
    when: (i) => has("pregnancy_concern", i),
  },
  {
    id: "UR-07",
    category: "urgent",
    description: "Significant injury not from major trauma",
    source: "Injury assessment referral guidance",
    when: (i) => has("injury", i),
  },
  {
    id: "UR-08",
    category: "urgent",
    description: "Abdominal pain",
    source: "Acute abdominal symptom referral guidance",
    when: (i) => has("abdominal_pain", i),
  },
  {
    id: "UR-09",
    category: "urgent",
    description: "Symptoms suddenly worse",
    source: "Clinical escalation on acute deterioration",
    when: (i) => i.followUps?.symptoms_suddenly_worse === true,
  },
];

/** Evaluate every rule; emergency always wins over urgent. */
export function evaluateTriage(input: TriageInput): TriageResult {
  const safeInput: TriageInput = {
    ...input,
    followUps: input.followUps ?? {},
    ageGroup: isAgeGroup(input.ageGroup) ? input.ageGroup : null,
  };

  const triggered: TriggeredRule[] = [];
  for (const rule of RULE_DEFS) {
    let hit = false;
    try {
      hit = rule.when(safeInput);
    } catch {
      hit = false; // a rule bug must never crash intake
    }
    if (hit) {
      triggered.push({ id: rule.id, description: rule.description, source: rule.source });
    }
  }

  const hasEmergency = triggered.some((t) => t.id.startsWith("EM-"));
  const category: TriageCategory = hasEmergency ? "emergency" : triggered.length > 0 ? "urgent" : "routine";

  return { category, triggered, rulesVersion: RULES_VERSION };
}

/** Suggested follow-up questions for the current intake state (UI ordering). */
export function suggestedFollowUps(input: TriageInput): FollowUpId[] {
  const c = input.concepts;
  const out: FollowUpId[] = [];
  if (c.includes("difficulty_breathing")) out.push("breathing_worse_at_rest");
  if (c.includes("chest_discomfort")) out.push("chest_pressure_spreading");
  if (c.includes("severe_bleeding")) out.push("bleeding_wont_stop");
  if (c.includes("vomiting")) out.push("vomiting_cannot_keep_fluids");
  if (c.includes("fever")) out.push("fever_three_days_or_more");
  if (c.includes("severe_headache")) out.push("headache_sudden_worst_ever");
  if (c.includes("injury")) out.push("injury_from_major_trauma");
  if (c.length > 0) out.push("symptoms_suddenly_worse");
  return out;
}
