/**
 * Intent Router for Ask Healthfolio
 *
 * Categorizes user messages into intent types before deciding whether
 * to retrieve personal documents, call the AI model, or use deterministic
 * product-help answers.
 */

import { z } from "zod";

export const IntentType = z.enum([
  "PRODUCT_HELP",
  "PERSONAL_RECORD_QUESTION",
  "GENERAL_HEALTH_EDUCATION",
  "PERSONALIZED_MEDICAL_ADVICE",
  "EMERGENCY_OR_URGENT",
  "UNKNOWN",
]);

export type IntentTypeValue = z.infer<typeof IntentType>;

export const IntentResultSchema = z.object({
  intent: IntentType,
  confidence: z.number().min(0).max(1),
  requiresDocuments: z.boolean(),
  requiresReferenceRetrieval: z.boolean(),
  requiresClarification: z.boolean(),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

// ─── Deterministic Patterns ───────────────────────────────────────────────

const PRODUCT_HELP_PATTERNS = [
  /\bwhat\s+can\s+healthfolio\s+do\b/i,
  /\bhow\s+(do\s+i|can\s+i|to)\b.*\b(upload|add|submit|export|download|share|view|see|use|start|create|set up)\b/i,
  /\bcan\s+healthfolio\b/i,
  /\bwhere\s+(can\s+i|do)\b.*\b(see|find|view|access|get)\b/i,
  /\bhow\s+does\s+(ocr|upload|extract|process|timeline|brief|export|calendar|reminder|ai|assistant)\b/i,
  /\bdoes\s+healthfolio\s+(support|accept|allow|have|provide|offer|work|handle)\b/i,
  /\bwhat\s+(files?|formats?|documents?|types?)\s+(does|can|are|is)\b/i,
  /\bhow\s+(?:does\s+)?(?:healthfolio\s+)?(?:keep|protect|store|handle|maintain)\s+.*\b(secure|private|safe|data|privacy)\b/i,
  /\bhow\s+(secure|private|safe)\b/i,
  /\bwhat\s+(is|are)\s+healthfolio\b/i,
  /\btell\s+me\s+about\s+healthfolio\b/i,
  /\bhealthfolio\s+features?\b/i,
  /\bwhat\s+features?\b/i,
];

const EMERGENCY_PATTERNS = [
  /\b(emergency|urgent|call\s*(911|ambulance|108|112)|call\s+an?\s+(ambulance|doctor|hospital))\b/i,
  /\b(chest\s*pain|stroke|seizure|overdose|poisoning|anaphyla|suicid|bleeding\s+heavily|cannot\s+breathe|choking)\b/i,
  /\b(heart\s*attack|unconscious|not\s+breathing)\b/i,
];

const PERSONALIZED_ADVICE_PATTERNS = [
  /\b(treat(?:ment|ing))\b/i,
  /\b(should\s+i\s+(?:stop|start|take|change|reduce|increase|continue)(?:\s+taking)?\s+(?:my|the|this)\s+(?:med|medication|medicine|drug|pill|tablet|dose))\b/i,
  /\b(what\s+dose\s+should\s+i|dosage\s+should\s+i|how\s+much\s+should\s+i\s+take)\b/i,
  /\b(diagnos(?:e|is|ed|ing))\b/i,
  /\b(do\s+i\s+have|am\s+i\s+(?:sick|diagnosed|positive|negative))\b/i,
  /\b(what\s+(?:disease|condition|illness)\s+(?:do\s+i|am\s+i))\b/i,
  /\b(create\s+a\s+(?:diet|treatment|medication|plan)\s+(?:to|for|that))\b/i,
  /\b(tell\s+me\s+what\s+(?:disease|illness|condition))\b/i,
  /\b(am\s+i\s+(?:safe|ok|fine|in\s+danger))\b/i,
  /\b(should\s+i\s+(?:stop|start|change)\s+(?:taking\s+)?(?:my|the|this)\s+(?:medicine|medication|drug|pill))\b/i,
];

const GENERAL_HEALTH_PATTERNS = [
  /\b(what\s+food|diet|eat|nutrition|exercise|workout|sleep|stress|vitamin|supplement)\b/i,
  /\b(is\s+(?:it\s+)?(?:healthy|safe|good|bad)\s+to)\b/i,
  /\b(should\s+i\s+(?:eat|drink|exercise|sleep|walk|run|yoga))\b/i,
  /\b(benefits?\s+of)\b/i,
  /\b(how\s+(?:much|many)\s+(?:water|sleep|exercise))\b/i,
  /\b(health(?:y)?\s+(?:eating|food|diet|tips?|habits?))\b/i,
];

const PERSONAL_RECORD_PATTERNS = [
  /\b(my|me|i)\s+(?:latest|recent|previous|last|current|first|most\s+recent)\s+\b(report|result|test|prescription|medicine|medication|drug|appointment|visit|lab|scan|x-?ray|mri|ct|blood|urine|hba1c|cholesterol|glucose|pressure|weight|bmi|vaccination|dose|dosage)\b/i,
  /\b(latest|recent|previous|last|earliest|first|most\s+recent)\s+\b(report|result|test|prescription|visit|appointment|lab|scan|record)\b/i,
  /\b(what\s+(?:was|is|were))\s+(?:my|the)\s+\b(report|result|test|prescription|medicine|medication|drug|appointment|visit|lab|scan|blood|urine|hba1c|cholesterol|glucose|pressure|weight|bmi|vaccination|dose|dosage|record|document|result)\b/i,
  /\b(compare|difference|change|improvement|worsen)\b.*\b(between|in|of|across)\s+(?:my|the)\s+(?:reports?|results?|tests?|records?)\b/i,
  /\b(which\s+document|where\s+(?:is|was|can\s+i\s+find))\s+(?:is|was|contains?|has)\b/i,
  /\b(show\s+me|find|list|summarize)\s+(?:my|the|all)\s+(?:report|result|test|prescription|medicine|medication|drug|appointment|visit|lab|scan|record|document|results?|tests?|records?|documents?)\b/i,
  /\b(contradict|conflict|disagree|different|inconsistent)\b.*\b(between|in|of|across)\s+(?:my|the)\s+(?:reports?|results?|tests?|records?)\b/i,
  /\b(which|what)\s+(?:medicines?|medications?|drugs?|pills?|tablets?)\s+(?:are|is|were|have\s+been)\s+\w+\s+(?:in|on)\s+(?:my|the)\s+(?:prescription|report|document|record)/i,
  /\b(which|what)\s+(?:medicines?|medications?|drugs?|pills?|tablets?)\s+(?:are|is|were|have\s+been)\s+(?:in|on)\s+(?:my|the)\s+(?:prescription|report|document|record)/i,
  /\b(which|what)\s+(?:medicines?|medications?|drugs?|pills?|tablets?)\s+(?:are|is|were|have\s+been)\s+(?:in|on|my|the)\s+(?:prescription|report|document|record)/i,
];

// ─── Deterministic Classification ─────────────────────────────────────────

function matchPatterns(text: string, patterns: RegExp[]): number {
  let score = 0;
  for (const p of patterns) {
    if (p.test(text)) score++;
  }
  return score;
}

/**
 * Classify intent using deterministic pattern matching only.
 * Returns null when patterns are not conclusive enough.
 */
export function classifyIntentDeterministic(text: string): IntentResult | null {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;

  // Emergency — highest priority
  const emergencyScore = matchPatterns(trimmed, EMERGENCY_PATTERNS);
  if (emergencyScore > 0) {
    return {
      intent: "EMERGENCY_OR_URGENT",
      confidence: 0.95,
      requiresDocuments: false,
      requiresReferenceRetrieval: false,
      requiresClarification: false,
    };
  }

  // Personalized medical advice — reject before checking records
  const adviceScore = matchPatterns(trimmed, PERSONALIZED_ADVICE_PATTERNS);
  if (adviceScore > 0) {
    return {
      intent: "PERSONALIZED_MEDICAL_ADVICE",
      confidence: 0.9,
      requiresDocuments: false,
      requiresReferenceRetrieval: false,
      requiresClarification: false,
    };
  }

  // Product help — no documents needed
  const productScore = matchPatterns(trimmed, PRODUCT_HELP_PATTERNS);
  if (productScore > 0) {
    return {
      intent: "PRODUCT_HELP",
      confidence: 0.9,
      requiresDocuments: false,
      requiresReferenceRetrieval: false,
      requiresClarification: false,
    };
  }

  // General health education — may need clarification
  const generalScore = matchPatterns(trimmed, GENERAL_HEALTH_PATTERNS);
  if (generalScore > 0) {
    // Check if it also looks personal (mentions personal health terms)
    const personalScore = matchPatterns(trimmed, PERSONAL_RECORD_PATTERNS);
    const hasPersonalTerms = /\b(my|i|me)\b.*\b(cholesterol|blood|pressure|weight|bmi|sugar|glucose|hba1c|condition|disease|symptom|diagnosis)\b/i.test(trimmed) ||
      /\b(cholesterol|blood|pressure|weight|bmi|sugar|glucose|hba1c|condition|disease|symptom|diagnosis)\b.*\b(my|i|me)\b/i.test(trimmed);
    if (personalScore > 0 || hasPersonalTerms) {
      // Ambiguous — could be personal or general
      return {
        intent: "GENERAL_HEALTH_EDUCATION",
        confidence: 0.6,
        requiresDocuments: false,
        requiresReferenceRetrieval: false,
        requiresClarification: true,
      };
    }
    return {
      intent: "GENERAL_HEALTH_EDUCATION",
      confidence: 0.75,
      requiresDocuments: false,
      requiresReferenceRetrieval: true,
      requiresClarification: false,
    };
  }

  // Personal record question
  const recordScore = matchPatterns(trimmed, PERSONAL_RECORD_PATTERNS);
  if (recordScore > 0) {
    return {
      intent: "PERSONAL_RECORD_QUESTION",
      confidence: 0.8,
      requiresDocuments: true,
      requiresReferenceRetrieval: false,
      requiresClarification: false,
    };
  }

  // Ambiguous — default to personal record (the user is in a medical record app)
  return null;
}

/**
 * Full intent classification.
 * Uses deterministic patterns first, falls back to AI for ambiguous cases.
 */
export async function classifyIntent(
  text: string,
  aiClassify?: (text: string) => Promise<IntentResult>
): Promise<IntentResult> {
  // Try deterministic first
  const deterministic = classifyIntentDeterministic(text);
  if (deterministic && deterministic.confidence >= 0.75) {
    return deterministic;
  }

  // For ambiguous cases, try AI classification if available
  if (aiClassify) {
    try {
      const result = await aiClassify(text);
      return IntentResultSchema.parse(result);
    } catch {
      // AI classification failed — fall through to default
    }
  }

  // Default: treat as personal record question (the user is in a medical app)
  if (deterministic) return deterministic;

  return {
    intent: "PERSONAL_RECORD_QUESTION",
    confidence: 0.5,
    requiresDocuments: true,
    requiresReferenceRetrieval: false,
    requiresClarification: false,
  };
}
