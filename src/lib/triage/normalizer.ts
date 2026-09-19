/**
 * Deterministic symptom-text normalizer (offline, no LLM, no network).
 *
 * Safety boundary:
 * - Can ONLY output concepts from the closed set in `concepts.ts`.
 * - Never outputs disease names, severities, or advice.
 * - Always preserves the user's original text unchanged (returned alongside).
 * - Low-confidence matches are reported as "uncertain" so the UI asks a
 *   neutral clarification instead of guessing.
 *
 * Matching strategy, in priority order:
 * 1. Multi-word phrase patterns (longest first) over a normalized form of
 *    the input: lowercased, punctuation collapsed, whitespace squeezed,
 *    and common typo/transliteration variants reduced via a static
 *    rewrite table (e.g. "brethles" → "breathless", "bukhar" → "fever").
 * 2. Single-token fallback for unambiguous terms.
 *
 * Everything is plain string work — no AI, no network, fully auditable.
 */

import { SYMPTOM_CONCEPTS, type SymptomConcept } from "./concepts";

const CONCEPTS: readonly SymptomConcept[] = SYMPTOM_CONCEPTS;

/**
 * Static rewrite rules applied token-wise BEFORE pattern matching.
 * Keys must be lowercase ASCII; values are canonical English terms.
 * These cover: typos, spelling variation, and common romanized Hindi terms
 * that reliably map to a broad concept. If a rewrite is not reliable, it
 * does not belong here — unknown text simply stays unmatched ("uncertain").
 */
const TOKEN_REWRITES: Record<string, string> = {
  // English typos / spelling variation
  brethless: "breathless",
  breahtless: "breathless",
  brethles: "breathless",
  breathles: "breathless",
  chestpain: "chest pain",
  cheast: "chest",
  feverish: "fever",
  fevr: "fever",
  feever: "fever",
  vomitting: "vomiting",
  vomittingg: "vomiting",
  vomittinging: "vomiting",
  stomache: "stomach",
  stomac: "stomach",
  stumach: "stomach",
  headach: "headache",
  hedache: "headache",
  headche: "headache",
  bleedingg: "bleeding",
  bleading: "bleeding",
  fainted: "fainted",
  faintd: "fainted",
  unconcious: "unconscious",
  unconshus: "unconscious",
  seizuree: "seizure",
  siezure: "seizure",
  seizur: "seizure",
  pregancy: "pregnancy",
  preganancy: "pregnancy",
  pregnency: "pregnancy",
  injuryy: "injury",
  injery: "injury",
  weekness: "weakness",
  weaknes: "weakness",
  dizzynes: "dizziness",
  diziness: "dizziness",

  // Romanized Hindi → canonical English term (reliable, broad only)
  bukhar: "fever",
  bukhaar: "fever",
  taap: "fever",
  ultee: "vomiting",
  ulti: "vomiting",
  ultiya: "vomiting",
  matin: "vomiting",
  dard: "pain",
  peeda: "pain",
  takleef: "problem",
  sar: "head",
  seer: "head",
  pet: "stomach",
  seene: "chest",
  seena: "chest",
  chakkar: "dizziness",
  behosh: "unconscious",
  behoshi: "unconscious",
  khoon: "blood",
  ragda: "bleeding",
  saans: "breath",
  saanslene: "breathing",
  haddi: "bone",
  chot: "injury",
  lakawa: "injury",

  // Odia (romanized) → canonical English term (reliable, broad only)
  jwara: "fever",
  bāndha: "stomach",
  odisa_fever: "fever",
  petajiba: "stomach",
  bandha: "stomach",
  chakunda: "dizziness",
  hada: "bone",
  netra: "eye",
};

/**
 * Native-script phrase patterns — EXACT verified translations only.
 * Devanagari (Hindi) and Odia strings map to the same broad concepts.
 * Each entry carries the language it was verified for; anything we have
 * not verified is simply absent from this table, which keeps the
 * normalizer honest about what it does and does not understand.
 */
export const NATIVE_PHRASES: Array<{ match: string; concept: SymptomConcept }> = [
  // Hindi (Devanagari) — verified broad translations
  { match: "बुखार", concept: "fever" },
  { match: "तेज़ बुखार", concept: "fever" },
  { match: "उल्टी", concept: "vomiting" },
  { match: "सांस लेने में दिक्कत", concept: "difficulty_breathing" },
  { match: "सांस लेने में तकलीफ", concept: "difficulty_breathing" },
  { match: "सीने में दर्द", concept: "chest_discomfort" },
  { match: "खून नहीं रुक रहा", concept: "severe_bleeding" },
  { match: "बहुत खून", concept: "severe_bleeding" },
  { match: "बेहोश", concept: "fainting" },
  { match: "दौरा पड़ना", concept: "fainting" },
  { match: "सिरदर्द", concept: "severe_headache" },
  { match: "तेज़ सिरदर्द", concept: "severe_headache" },
  { match: "एक तरफ कमज़ोरी", concept: "weakness_one_side" },
  { match: "पेट दर्द", concept: "abdominal_pain" },
  { match: "पेट में दर्द", concept: "abdominal_pain" },
  { match: "चोट", concept: "injury" },
  { match: "गर्भावस्था", concept: "pregnancy_concern" },
  // Odia (Odia script) — verified broad translations
  { match: "ଜ୍ୱର", concept: "fever" },
  { match: "ବାନ୍ତି", concept: "vomiting" },
  { match: "ଛାତିରେ ଯନ୍ତ୍ରଣା", concept: "chest_discomfort" },
  { match: "ନିଶ୍ୱାସ", concept: "difficulty_breathing" },
  { match: "ରକ୍ତସ୍ରାବ", concept: "severe_bleeding" },
  { match: "ଅଜ୍ଞାନ", concept: "fainting" },
  { match: "ମୁଣ୍ଡ ବୁରୁଡ଼", concept: "severe_headache" },
  { match: "ପେଟ ଯନ୍ତ୍ରଣା", concept: "abdominal_pain" },
  { match: "ଆଘାତ", concept: "injury" },
  { match: "ଗର୍ଭାବସ୍ଥା", concept: "pregnancy_concern" },
];

/** Multi-word / phrase patterns, longest first. Order matters. */
const PHRASES: Array<{ match: string; concept: SymptomConcept }> = [
  // Breathing / chest
  { match: "difficulty breathing", concept: "difficulty_breathing" },
  { match: "trouble breathing", concept: "difficulty_breathing" },
  { match: "breathless", concept: "difficulty_breathing" },
  { match: "shortness of breath", concept: "difficulty_breathing" },
  { match: "cannot breathe", concept: "difficulty_breathing" },
  { match: "saans lene me dikkat", concept: "difficulty_breathing" },
  { match: "saans lene mein dikkat", concept: "difficulty_breathing" },
  { match: "chest pain", concept: "chest_discomfort" },
  { match: "chest pressure", concept: "chest_discomfort" },
  { match: "chest tightness", concept: "chest_discomfort" },
  { match: "chest discomfort", concept: "chest_discomfort" },
  { match: "seene me dard", concept: "chest_discomfort" },
  { match: "seene mein dard", concept: "chest_discomfort" },
  // Bleeding
  { match: "severe bleeding", concept: "severe_bleeding" },
  { match: "heavy bleeding", concept: "severe_bleeding" },
  { match: "bleeding a lot", concept: "severe_bleeding" },
  { match: "blood not stopping", concept: "severe_bleeding" },
  { match: "khoon nahi ruk raha", concept: "severe_bleeding" },
  // Weakness / stroke-like
  { match: "weakness on one side", concept: "weakness_one_side" },
  { match: "one side weak", concept: "weakness_one_side" },
  { match: "face drooping", concept: "weakness_one_side" },
  { match: "slurred speech", concept: "weakness_one_side" },
  { match: "cannot speak", concept: "weakness_one_side" },
  { match: "ek taraf kamzor", concept: "weakness_one_side" },
  // Fainting / unconsciousness
  { match: "fainted", concept: "fainting" },
  { match: "fainted away", concept: "fainting" },
  { match: "unconscious", concept: "fainting" },
  { match: "collapsed", concept: "fainting" },
  { match: "seizure", concept: "fainting" },
  { match: "fits", concept: "fainting" },
  { match: "behosh ho gaya", concept: "fainting" },
  // Headache
  { match: "severe headache", concept: "severe_headache" },
  { match: "worst headache", concept: "severe_headache" },
  { match: "sudden headache", concept: "severe_headache" },
  { match: "bahut sar dard", concept: "severe_headache" },
  // Vomiting
  { match: "vomiting", concept: "vomiting" },
  { match: "throwing up", concept: "vomiting" },
  { match: "ulti aa rahi", concept: "vomiting" },
  // Fever
  { match: "fever", concept: "fever" },
  { match: "high temperature", concept: "fever" },
  { match: "bukhar", concept: "fever" },
  // Pregnancy
  { match: "pregnancy", concept: "pregnancy_concern" },
  { match: "pregnant", concept: "pregnancy_concern" },
  { match: "bleeding during pregnancy", concept: "pregnancy_concern" },
  { match: "garbhavati", concept: "pregnancy_concern" },
  // Injury
  { match: "injury", concept: "injury" },
  { match: "injured", concept: "injury" },
  { match: "hurt badly", concept: "injury" },
  { match: "fracture", concept: "injury" },
  { match: "fell down", concept: "injury" },
  { match: "accident", concept: "injury" },
  { match: "chot lag gaya", concept: "injury" },
  // Abdominal pain
  { match: "abdominal pain", concept: "abdominal_pain" },
  { match: "stomach pain", concept: "abdominal_pain" },
  { match: "belly pain", concept: "abdominal_pain" },
  { match: "pet me dard", concept: "abdominal_pain" },
  { match: "pet mein dard", concept: "abdominal_pain" },
];

// Longest-first so "difficulty breathing" wins over "breath".
PHRASES.sort((a, b) => b.match.length - a.match.length);

export type Confidence = "high" | "medium" | "uncertain";

export interface NormalizationResult {
  /** User's original text, byte-for-byte unchanged. */
  originalText: string;
  /** Concepts the normalizer is confident about (high/medium only). */
  concepts: SymptomConcept[];
  /** True when text was recognized but below confidence threshold. */
  uncertain: boolean;
  /** Per-concept confidence for UI display. */
  confidence: Record<string, Confidence>;
  /** True when no text was provided at all (nothing to normalize). */
  empty: boolean;
}

const HIGH_THRESHOLD = 0.85;
const UNCERTAIN_THRESHOLD = 0.4;

function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    // Collapse punctuation to spaces. IMPORTANT: \p{M} (combining marks)
    // must be preserved — Devanagari and Odia vowels are matras, not base
    // letters, so stripping \p{M} destroys native-script words entirely.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rewriteTokens(normalized: string): string {
  return normalized
    .split(" ")
    .map((tok) => {
      const direct = TOKEN_REWRITES[tok];
      if (direct) return direct;
      // Light suffix normalization for common English verb endings —
      // deliberately shallow so we never over-generalize.
      if (tok.length > 5 && tok.endsWith("ing") && TOKEN_REWRITES[tok.slice(0, -3)]) {
        return TOKEN_REWRITES[tok.slice(0, -3)];
      }
      if (tok.length > 4 && tok.endsWith("ed") && TOKEN_REWRITES[tok.slice(0, -2)]) {
        return TOKEN_REWRITES[tok.slice(0, -2)];
      }
      return tok;
    })
    .join(" ");
}

interface PhraseHit {
  concept: SymptomConcept;
  score: number;
}

function findPhraseHits(rewritten: string, originalNormalized: string): PhraseHit[] {
  const hits: PhraseHit[] = [];
  // Native-script entries first, then romanized/English, longest first so
  // specific phrases win over their shorter prefixes.
  const all = [...NATIVE_PHRASES, ...PHRASES].sort((a, b) => b.match.length - a.match.length);
  for (const p of all) {
    // Match against BOTH forms: token rewrites (khoon→blood) can destroy a
    // romanized phrase, so the untouched normalized text must also be checked.
    if (rewritten.includes(p.match) || originalNormalized.includes(p.match)) {
      const words = p.match.split(/\s+/).length;
      const isNative = /[\u0900-\u097F\u0B00-\u0B7F]/.test(p.match);
      // Multi-word phrases and verified native-script terms: high.
      // Single token found VERBATIM in the user's own words: high.
      // Single token only reachable via typo/rewrite correction: medium.
      const verbatim = originalNormalized.includes(p.match);
      const score = words >= 2 || isNative || verbatim ? 0.95 : 0.6;
      hits.push({ concept: p.concept, score });
    }
  }
  return hits;
}

/**
 * Normalize free symptom text into broad concepts.
 * NEVER throws on user input; unknown text simply yields no concepts.
 */
export function normalizeSymptomText(rawText: string): NormalizationResult {
  const originalText = rawText; // preserved verbatim — safety contract
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { originalText, concepts: [], uncertain: false, confidence: {}, empty: true };
  }

  const normalized = normalizeForMatching(trimmed);
  const rewritten = rewriteTokens(normalized);
  const hits = findPhraseHits(rewritten, normalized);

  // Merge duplicate concept hits keeping the best score.
  const best = new Map<SymptomConcept, number>();
  for (const h of hits) {
    const prev = best.get(h.concept) ?? 0;
    if (h.score > prev) best.set(h.concept, h.score);
  }

  const concepts: SymptomConcept[] = [];
  const confidence: Record<string, Confidence> = {};
  let uncertain = false;

  for (const [concept, score] of best) {
    if (score >= HIGH_THRESHOLD) {
      confidence[concept] = "high";
      concepts.push(concept);
    } else if (score >= UNCERTAIN_THRESHOLD) {
      confidence[concept] = "medium";
      concepts.push(concept);
    } else {
      confidence[concept] = "uncertain";
      uncertain = true;
    }
  }

  // Some text was seen but nothing matched with usable confidence.
  if (concepts.length === 0 && best.size === 0) {
    uncertain = true;
  }

  return {
    originalText,
    concepts,
    uncertain,
    confidence,
    empty: false,
  };
}
