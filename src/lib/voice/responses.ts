/**
 * Voice assistant — response generation (spec §13, §14, §98–§100).
 *
 * LAYER 6. Controlled response templates only. The assistant never
 * free-forms medical text: every response is assembled from the
 * existing i18n dictionaries so voice wording stays identical to
 * the text UI.
 *
 * SAFETY RULES
 * - Triage category wording reuses tPhase2 safeEmergency /
 *   safeUrgent / safeRoutine VERBATIM — the deterministic engine's
 *   safety text must be the same whether it arrives by text or
 *   voice (spec §26, §98).
 * - The assistant never says a diagnosis, never says "you are
 *   safe" / "nothing is wrong", and never quotes model confidence
 *   as a medical probability (spec §27, §32).
 * - Everything passes through sanitizeForTTS before SpeechSynthesis:
 *   markdown, code, JSON, URLs and long opaque IDs are stripped
 *   (spec §100).
 */

import { tVoice, type VoiceDict } from "@/lib/i18n/voice";
import { tPhase2, type Phase2Dict } from "@/lib/i18n/phase2";
import type { Language } from "@/lib/i18n";
import type { TriageCategory } from "@/lib/triage/red-flags";
import type { FollowUpId } from "@/lib/triage/red-flags";
import { conceptLabel, conceptLabels } from "@/lib/triage/concept-labels";
import type { SymptomConcept } from "@/lib/triage/concepts";

/** A spoken-ready response: on-screen text + sanitized speech text. */
export interface VoiceResponse {
  /** Rendered on screen — the authoritative channel (spec §14). */
  text: string;
  /** Sanitized for speech synthesis; may equal text. */
  speak: string;
}

function respond(text: string): VoiceResponse {
  return { text, speak: sanitizeForTTS(text) };
}

// ─── TTS sanitization (spec §100) ─────────────────────────

/**
 * Strip anything that should never be spoken aloud: markdown
 * formatting, fenced code, JSON payloads, URLs, long opaque
 * identifiers, and control characters. Keeps ordinary
 * punctuation so the utterance stays natural.
 */
export function sanitizeForTTS(raw: string): string {
  let text = raw;
  // Strip markdown links first (keep nothing — URLs are not useful aloud).
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Strip bare URLs.
  text = text.replace(/https?:\/\/\S+|www\.\S+/gi, " ");
  // Strip fenced code blocks and inline code.
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`[^`]*`/g, " ");
  // Strip JSON / object / array payloads.
  text = text.replace(/\{[^}]{0,500}\}/g, " ");
  text = text.replace(/\[[^\]]{0,500}\]/g, " ");
  // Strip markdown emphasis / headings / list markers.
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/[*_~]{1,3}(\S[*_~]{0,200}[*_~]{0,2})\1?/g, "$2");
  // Strip long opaque IDs (hash-like tokens, UUIDs).
  text = text.replace(/\b[a-f0-9]{16,}\b/gi, " ");
  text = text.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    " "
  );
  // Strip technical error strings ("SpeechRecognitionError: network").
  text = text.replace(/\b[A-Z][a-zA-Z]+(?:Error|Exception)\b[:\w]*/g, " ");
  // Collapse leftover symbols and whitespace.
  text = text.replace(/[#*_`|>]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// ─── Chrome responses ─────────────────────────────────────

export function greeting(language: Language): VoiceResponse {
  return respond(tVoice(language, "assistantGreeting"));
}

export function helpResponse(language: Language): VoiceResponse {
  return respond(tVoice(language, "respHelp"));
}

export function unknownResponse(language: Language): VoiceResponse {
  return respond(tVoice(language, "respUnknown"));
}

export function repeatUnavailable(language: Language): VoiceResponse {
  return respond(tVoice(language, "respRepeatUnavailable"));
}

export function clarifySymptom(language: Language): VoiceResponse {
  return respond(tVoice(language, "respClarifySymptom"));
}

export function heardNothing(language: Language): VoiceResponse {
  return respond(tVoice(language, "heardNothing"));
}

export function voiceStopped(language: Language): VoiceResponse {
  return respond(tVoice(language, "voiceStopped"));
}

export function didYouMean(language: Language, word: string): VoiceResponse {
  return respond(tVoice(language, "didYouMean", { word }));
}

export function whichLanguage(language: Language): VoiceResponse {
  return respond(tVoice(language, "whichLanguage"));
}

export function languageChanged(
  language: Language,
  newLanguage: Language
): VoiceResponse {
  return respond(
    tVoice(language, "respLanguageChanged", {
      language: tVoice(language, languageNameKey(newLanguage)),
    })
  );
}

function languageNameKey(lang: Language): keyof VoiceDict {
  if (lang === "hi") return "langHi";
  if (lang === "or") return "langOr";
  return "langEn";
}

export function cancelled(language: Language): VoiceResponse {
  return respond(tVoice(language, "respCancelled"));
}

export function ended(language: Language): VoiceResponse {
  return respond(tVoice(language, "respEnded"));
}

export function sessionEnded(language: Language): VoiceResponse {
  return respond(tVoice(language, "sessionEnded"));
}

export function actionFailed(language: Language): VoiceResponse {
  return respond(tVoice(language, "respActionFailed"));
}

export function unauthorized(language: Language): VoiceResponse {
  return respond(tVoice(language, "respUnauthorized"));
}

export function duplicate(language: Language): VoiceResponse {
  return respond(tVoice(language, "respDuplicate"));
}

// ─── Symptoms + triage (spec §26–§29, §96) ─────────────

export function symptomsUnderstood(
  language: Language,
  concepts: readonly SymptomConcept[]
): VoiceResponse {
  return respond(
    tVoice(language, "respSymptomsUnderstood", {
      symptoms: conceptLabels(concepts, language),
    })
  );
}

/**
 * The deterministic triage result, spoken with the EXACT safety
 * wording the text symptom checker shows. Never embellished, never
 * softened, never a diagnosis (spec §27).
 */
export function triageResult(
  language: Language,
  category: TriageCategory
): VoiceResponse {
  const key =
    category === "emergency"
      ? "safeEmergency"
      : category === "urgent"
        ? "safeUrgent"
        : "safeRoutine";
  return respond(tPhase2(language, key));
}

/**
 * The next follow-up question from the deterministic engine,
 * reusing the Phase 2 question wording verbatim.
 */
export function followUpQuestion(
  language: Language,
  followUpId: FollowUpId
): VoiceResponse {
  const key = FOLLOW_UP_KEYS[followUpId];
  return respond(tPhase2(language, key));
}

const FOLLOW_UP_KEYS: Record<FollowUpId, keyof Phase2Dict> = {
  breathing_worse_at_rest: "scFuBreathing",
  chest_pressure_spreading: "scFuChest",
  bleeding_wont_stop: "scFuBleeding",
  vomiting_cannot_keep_fluids: "scFuVomiting",
  fever_three_days_or_more: "scFuFever",
  headache_sudden_worst_ever: "scFuHeadache",
  injury_from_major_trauma: "scFuInjury",
  symptoms_suddenly_worse: "scFuWorse",
};

/** Human label for a single symptom concept. */
export function symptomWord(
  language: Language,
  concept: SymptomConcept
): string {
  return conceptLabel(concept, language);
}

// ─── Explanations ─────────────────────────────────────────

export function triageExplain(language: Language): VoiceResponse {
  return respond(tVoice(language, "respTriageExplain"));
}

export function offlineExplain(language: Language): VoiceResponse {
  return respond(tVoice(language, "respOfflineExplain"));
}

export function syncExplain(language: Language): VoiceResponse {
  return respond(tVoice(language, "respSyncExplain"));
}

export function networkWeak(language: Language): VoiceResponse {
  return respond(tVoice(language, "respNetworkWeak"));
}

export function aiUnavailable(language: Language): VoiceResponse {
  return respond(tVoice(language, "respAiUnavailable"));
}

// ─── Recognition / permission failures (spec §64) ───────

export function micDenied(language: Language): VoiceResponse {
  return respond(tVoice(language, "respMicDenied"));
}

export function micUnavailable(language: Language): VoiceResponse {
  return respond(tVoice(language, "respMicUnavailable"));
}

export function recognitionFailed(language: Language): VoiceResponse {
  return respond(tVoice(language, "respRecognitionFailed"));
}

// ─── Doctor workflow (spec §59) ─────────────────────────

export function doctorAskLanguage(language: Language): VoiceResponse {
  return respond(tVoice(language, "respDoctorAskLanguage"));
}

export function doctorFound(
  language: Language,
  count: number,
  languageName: Language
): VoiceResponse {
  return respond(
    tVoice(language, "respDoctorFound", {
      count: String(count),
      language: tVoice(languageName, languageNameKey(languageName)),
    })
  );
}

export function doctorNone(language: Language): VoiceResponse {
  return respond(tVoice(language, "respDoctorNone"));
}

/** Real care-request status summary (spec §39): built from the
 *  patient's actual care requests, never invented availability. */
export function doctorStatus(
  language: Language,
  count: number,
  status: string
): VoiceResponse {
  return respond(
    tVoice(language, "respDoctorStatus", {
      count: String(count),
      status,
    })
  );
}

export function confirmDoctor(language: Language): VoiceResponse {
  return respond(tVoice(language, "respConfirmDoctor"));
}

// ─── Medicine / pharmacy (spec §57, §58, §95) ───────────

export function medicineFound(
  language: Language,
  pharmacy: string,
  medicine: string,
  status: string,
  confirmedAgo: string
): VoiceResponse {
  return respond(
    tVoice(language, "respMedicineFound", {
      pharmacy,
      medicine,
      status,
      time: confirmedAgo,
    })
  );
}

export function medicineNone(language: Language, medicine: string): VoiceResponse {
  return respond(tVoice(language, "respMedicineNone", { medicine }));
}

export function medicineStale(language: Language, confirmedAgo: string): VoiceResponse {
  return respond(tVoice(language, "respMedicineStale", { time: confirmedAgo }));
}

// ─── Health Card (spec §55, §56, §94) ───────────────────

export function healthCardUpdated(language: Language, time: string): VoiceResponse {
  return respond(tVoice(language, "respHealthCardUpdated", { time }));
}

export function healthCardStale(language: Language, time: string): VoiceResponse {
  return respond(tVoice(language, "respHealthCardStale", { time }));
}

export function healthCardEmpty(language: Language): VoiceResponse {
  return respond(tVoice(language, "respHealthCardEmpty"));
}

export function medicinesList(language: Language, list: string): VoiceResponse {
  return respond(tVoice(language, "respMedicinesList", { list }));
}

export function noMedicines(language: Language): VoiceResponse {
  return respond(tVoice(language, "respNoMedicines"));
}

// ─── Confirmations (spec §24, §25, §61) ─────────────────

export function shareConfirm(language: Language): VoiceResponse {
  return respond(tVoice(language, "respShareConfirm"));
}

export function confirmConsultation(language: Language): VoiceResponse {
  return respond(tVoice(language, "respConfirmConsultation"));
}

export function switchedAudio(language: Language): VoiceResponse {
  return respond(tVoice(language, "respSwitchedAudio"));
}

export function confirmEnd(language: Language): VoiceResponse {
  return respond(tVoice(language, "respConfirmEnd"));
}

export function offlineQueuePrompt(language: Language): VoiceResponse {
  return respond(tVoice(language, "respOfflineQueue"));
}
