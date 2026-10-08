/**
 * Voice assistant — controlled intent vocabulary (spec §4, §5, §75).
 *
 * SAFETY CONTRACT
 * - CLOSED intent set. The assistant can only ever produce one of these
 *   intents — nothing else is executable, no matter what the AI returns.
 * - Every command is validated with VoiceCommandSchema BEFORE any action.
 * - Entities carry raw wording for medical content (symptomText) but it is
 *   never executed directly — the deterministic triage engine re-derives
 *   canonical concepts from it. Symptom concepts themselves only come from
 *   the deterministic normalizer, never from free AI text.
 * - Risk classes drive confirmation strictness (spec §75, §76).
 */

import { z } from "zod";
import { isLanguage, type Language } from "@/lib/i18n";
import { isSymptomConcept, type SymptomConcept } from "@/lib/triage/concepts";

// ─── Intent vocabulary ──────────────────────────────────────────────

export const VOICE_INTENTS = [
  "CHECK_SYMPTOMS",
  "TALK_TO_DOCTOR",
  "CHECK_DOCTOR_AVAILABILITY",
  "CHECK_MEDICINE",
  "OPEN_HEALTH_CARD",
  "READ_HEALTH_CARD",
  "EXPLAIN_TRIAGE",
  "EXPLAIN_OFFLINE_STATUS",
  "EXPLAIN_SYNC_STATUS",
  "START_CONSULTATION",
  "SWITCH_TO_AUDIO",
  "REPEAT",
  "CHANGE_LANGUAGE",
  "HELP",
  "CANCEL",
  "END_SESSION",
] as const;

export type VoiceIntent = (typeof VOICE_INTENTS)[number];

export function isVoiceIntent(value: unknown): value is VoiceIntent {
  return (
    typeof value === "string" &&
    (VOICE_INTENTS as readonly string[]).includes(value)
  );
}

// ─── Safety risk classes (spec §75) ────────────────────────────────

export const VOICE_RISK_CLASSES = [
  "READ_ONLY",
  "LOW_RISK_NAVIGATION",
  "USER_CONFIRMATION_REQUIRED",
  "CLINICAL_SAFETY_SENSITIVE",
  "DESTRUCTIVE",
] as const;

export type VoiceRiskClass = (typeof VOICE_RISK_CLASSES)[number];

/**
 * Fixed classification per intent. Mutations and safety-sensitive flows get
 * stricter confirmation; nothing voice-triggered is ever unclassified.
 */
export const VOICE_INTENT_RISK: Record<VoiceIntent, VoiceRiskClass> = {
  CHECK_SYMPTOMS: "CLINICAL_SAFETY_SENSITIVE",
  TALK_TO_DOCTOR: "LOW_RISK_NAVIGATION",
  CHECK_DOCTOR_AVAILABILITY: "READ_ONLY",
  CHECK_MEDICINE: "READ_ONLY",
  OPEN_HEALTH_CARD: "READ_ONLY",
  READ_HEALTH_CARD: "READ_ONLY",
  EXPLAIN_TRIAGE: "READ_ONLY",
  EXPLAIN_OFFLINE_STATUS: "READ_ONLY",
  EXPLAIN_SYNC_STATUS: "READ_ONLY",
  START_CONSULTATION: "USER_CONFIRMATION_REQUIRED",
  SWITCH_TO_AUDIO: "USER_CONFIRMATION_REQUIRED",
  REPEAT: "READ_ONLY",
  CHANGE_LANGUAGE: "LOW_RISK_NAVIGATION",
  HELP: "READ_ONLY",
  CANCEL: "LOW_RISK_NAVIGATION",
  END_SESSION: "USER_CONFIRMATION_REQUIRED",
};

/** Intents that must ask the user to confirm before executing. */
export const CONFIRMATION_REQUIRED_INTENTS: ReadonlySet<VoiceIntent> =
  new Set<VoiceIntent>([
    "START_CONSULTATION",
    "SWITCH_TO_AUDIO",
    "END_SESSION",
  ]);

/** Intents that may run without any confirmation. */
export const READ_ONLY_INTENTS: ReadonlySet<VoiceIntent> = new Set<VoiceIntent>([
  "CHECK_DOCTOR_AVAILABILITY",
  "CHECK_MEDICINE",
  "OPEN_HEALTH_CARD",
  "READ_HEALTH_CARD",
  "EXPLAIN_TRIAGE",
  "EXPLAIN_OFFLINE_STATUS",
  "EXPLAIN_SYNC_STATUS",
  "REPEAT",
  "HELP",
]);

// ─── Structured command schema ─────────────────────────────────────

/**
 * Entities: only fields the router knows how to handle. `symptomText` is
 * raw user wording — it is re-normalized by the deterministic normalizer
 * and never trusted as a concept. `symptoms` only ever contains concepts
 * produced by that normalizer.
 */
export const VoiceEntitiesSchema = z
  .object({
    symptomText: z.string().max(200).optional(),
    symptoms: z.array(z.string()).max(20).optional(),
    medicineName: z.string().max(120).optional(),
    language: z.enum(["en", "hi", "or"]).optional(),
    duration: z.string().max(40).optional(),
    /** Yes/no answer to a clarification question. */
    answer: z.boolean().optional(),
  })
  .strict();

export type VoiceEntities = z.infer<typeof VoiceEntitiesSchema>;

/**
 * The only command shape the VoiceActionRouter accepts. `source` records
 * which interpreter produced it (deterministic tables or validated AI
 * output) and `confidence` is an INTERNAL routing hint — it must never be
 * presented to the user as a medical probability (spec §32).
 */
export const VoiceCommandSchema = z
  .object({
    intent: z.enum(VOICE_INTENTS),
    language: z.enum(["en", "hi", "or"]),
    entities: VoiceEntitiesSchema,
    source: z.enum(["deterministic", "ai"]),
    confidence: z.enum(["high", "low"]),
    /**
     * Fingerprint of the transcript that produced this command. Used for
     * session-level deduplication so a repeated ASR emission cannot
     * double-execute a mutation (spec §73, §74).
     */
    fingerprint: z.string().max(128),
  })
  .strict();

export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;

/** Validate unknown (possibly AI-generated) output into a VoiceCommand. */
export function parseVoiceCommand(raw: unknown): VoiceCommand | null {
  const parsed = VoiceCommandSchema.safeParse(raw);
  if (!parsed.success) return null;
  const cmd = parsed.data;
  // Belt-and-braces: drop symptom entity values that are not real concepts.
  if (cmd.entities.symptoms) {
    cmd.entities.symptoms = cmd.entities.symptoms.filter(isSymptomConcept);
  }
  return cmd;
}

/**
 * Build a command with a stable fingerprint from its semantic content.
 * Two identical utterances in one session share a fingerprint.
 */
export function commandFingerprint(
  intent: VoiceIntent,
  entities: VoiceEntities,
  language: Language
): string {
  const payload = JSON.stringify({ intent, entities, language });
  // djb2 — stable, dependency-free, non-crypto (dedup only, not security).
  let hash = 5381;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 33) ^ payload.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
