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
  "MEDICINE_LOOKUP",
  "TEST_LOOKUP",
  "REPORT_EXPLANATION",
  "HEALTH_TREND_QUESTION",
  "MEDICATION_ROUTINE_QUESTION",
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

const MEDICINE_LOOKUP_PATTERNS = [
  /\bwhat\s+(?:is|are|does)\s+(?:\w+\s+){0,3}(?:medication|medicine|drug|tablet|pill|capsule|syrup|injection)\b/i,
  /\b(tell\s+me\s+about|information\s+about|what\s+is)\s+(?:my\s+)?(?:\w+\s+){0,2}(?:tablets?|capsules?|medicine|medication|drug|syrup)\b/i,
  /\b(metformin|paracetamol|amoxicillin|azithromycin|amlodipine|losartan|telmisartan|atorvastatin|rosuvastatin|pantoprazole|omeprazole|cetirizine|montelukast|salbutamol|levothyroxine|warfarin|aspirin|clopidogrel|ramipril|enalapril|metoprolol|bisoprolol|insulin|prednisolone|doxycycline)\b/i,
  /\bhow\s+(?:does|should|much|long)\b.*\b(metformin|paracetamol|amoxicillin|azithromycin|tablets?|pills?|capsules?|medicine|medication|drug|dose|dosing)\b/i,
];

const TEST_LOOKUP_PATTERNS = [
  /\bwhat\s+(?:is|are|does)\s+(?:\w+\s+){0,3}(?:test|result|level|count|reading|value)\b/i,
  /\b(tell\s+me\s+about|what\s+is|explain)\s+(?:my\s+)?(?:\w+\s+){0,2}(?:hba1c|cholesterol|glucose|creatinine|tsh|hemoglobin|platelet|vitamin|b12|uric|bun|esr|crp|ldl|hdl|triglyceride|bilirubin|wbc|rbc)\b/i,
  /\b(hba1c|hemoglobin\s+a1c|fasting\s+(?:blood\s+)?sugar|random\s+(?:blood\s+)?sugar|ldl|hdl|triglycerides?|tsh|creatinine|uric\s+acid|vitamin\s+d|vitamin\s+b12|platelets?|esr|crp|wbc|rbc|cbc)\b/i,
  /\bwhat\s+does\s+(?:my|the)\s+\w+\s+result\s+mean\b/i,
  /\b(is|are)\s+(?:my|the)\s+(?:\w+\s+){0,2}(results?|values?|levels?|readings?)\s+(?:normal|high|low|ok|fine|good|bad|safe|dangerous|concerning)\b/i,
];

const REPORT_EXPLANATION_PATTERNS = [
  /\b(explain|what\s+does|tell\s+me\s+about|summarize|interpret)\s+(?:my|the|this)\s+(?:\w+\s+){0,2}(?:report|lab|result|result|test|scan|prescription|discharge)\b/i,
  /\bwhat\s+(?:is|does)\s+(?:this|the|my)\s+report\s+(?:say|show|mean|indicate)\b/i,
  /\bcan\s+you\s+(?:explain|interpret|summarize|break\s+down)\s+(?:my|the|this)\s+(?:\w+\s+){0,2}report\b/i,
];

const HEALTH_TREND_PATTERNS = [
  /\b(compare|comparison|difference|change|trend|improvement|worsen|better|higher|lower|increasing|decreasing)\b.*\b(between|in|of|over|across|through)\s+(?:my|the)\s+(?:\w+\s+){0,2}(?:results?|tests?|reports?|records?)\b/i,
  /\b(am\s+i\s+(?:getting|becoming|improving|worsening))\b/i,
  /\b(has|have)\s+(?:my|the)\s+\w+\s+(?:improved|worsened|changed|increased|decreased|gone\s+(?:up|down))\b/i,
  /\bmy\s+(?:\w+\s+){0,2}(?:trend|progress|change|history)\b/i,
];

const ROUTINE_QUESTION_PATTERNS = [
  /\b(reminder|routine|schedule|when\s+(?:should|do)\s+i\s+take|next\s+dose|missed\s+dose)\b/i,
  /\b(medication\s+routine|medicine\s+schedule|pill\s+reminder|drug\s+schedule)\b/i,
  /\bwhat\s+(?:is|are|was)\s+(?:my|the)\s+(?:\w+\s+){0,2}(?:routine|schedule|reminder|dose|timing)\b/i,
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

  // Medicine lookup
  const medicineScore = matchPatterns(trimmed, MEDICINE_LOOKUP_PATTERNS);
  if (medicineScore > 0) {
    return {
      intent: "MEDICINE_LOOKUP" ,
      confidence: 0.85,
      requiresDocuments: false,
      requiresReferenceRetrieval: true,
      requiresClarification: false,
    };
  }

  // Test lookup
  const testScore = matchPatterns(trimmed, TEST_LOOKUP_PATTERNS);
  if (testScore > 0) {
    const hasMyTerms = /\b(my|i|me|my\s+)\b/i.test(trimmed);
    return {
      intent: (hasMyTerms ? "PERSONAL_RECORD_QUESTION" : "TEST_LOOKUP") ,
      confidence: hasMyTerms ? 0.8 : 0.85,
      requiresDocuments: hasMyTerms,
      requiresReferenceRetrieval: !hasMyTerms,
      requiresClarification: false,
    };
  }

  // Report explanation
  const reportScore = matchPatterns(trimmed, REPORT_EXPLANATION_PATTERNS);
  if (reportScore > 0) {
    return {
      intent: "REPORT_EXPLANATION" ,
      confidence: 0.85,
      requiresDocuments: true,
      requiresReferenceRetrieval: false,
      requiresClarification: false,
    };
  }

  // Health trend question
  const trendScore = matchPatterns(trimmed, HEALTH_TREND_PATTERNS);
  if (trendScore > 0) {
    return {
      intent: "HEALTH_TREND_QUESTION" ,
      confidence: 0.8,
      requiresDocuments: true,
      requiresReferenceRetrieval: false,
      requiresClarification: false,
    };
  }

  // Medication routine question
  const routineScore = matchPatterns(trimmed, ROUTINE_QUESTION_PATTERNS);
  if (routineScore > 0) {
    return {
      intent: "MEDICATION_ROUTINE_QUESTION" ,
      confidence: 0.8,
      requiresDocuments: true,
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
