/**
 * Plain-language labels for the closed broad-concept set (Phase 2 shared).
 *
 * Extracted from CareRequestWizard so the guided symptom checker and the
 * wizard render IDENTICAL wording for the same concept in every language —
 * a concept must never be named differently in two places.
 *
 * Wording rules: broad symptom area only; never a disease, condition name,
 * diagnosis, or severity judgment.
 */

import type { SymptomConcept } from "./concepts";

type LabelLang = "en" | "hi" | "or";

export const CONCEPT_LABELS: Record<SymptomConcept, Record<LabelLang, string>> = {
  chest_discomfort: { en: "chest discomfort", hi: "सीने में दबाव/दर्द", or: "ଛାତିରେ ଅସ୍ୱାଭାବିକତା" },
  difficulty_breathing: { en: "difficulty breathing", hi: "सांस लेने में दिक्कत", or: "ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ" },
  fever: { en: "fever", hi: "बुखार", or: "ଜ୍ୱର" },
  fainting: { en: "fainting or collapse", hi: "बेहोशी या गिर जाना", or: "ଅଜ୍ଞାନ ହେବା" },
  severe_bleeding: { en: "severe bleeding", hi: "बहुत खून बहना", or: "ପ୍ରଚଣ୍ଡ ରକ୍ତସ୍ରାବ" },
  weakness_one_side: { en: "weakness on one side of the body", hi: "शरीर के एक तरफ कमज़ोरी", or: "ଶରୀରର ଗୋଟିଏ ପାଖରେ ଦୁର୍ବଳତା" },
  severe_headache: { en: "severe headache", hi: "तेज़ सिरदर्द", or: "ପ୍ରଚଣ୍ଡ ମୁଣ୍ଡ ବୁରୁଡ଼" },
  vomiting: { en: "vomiting", hi: "उल्टी", or: "ବାନ୍ତି" },
  pregnancy_concern: { en: "pregnancy-related concern", hi: "गर्भावस्था से जुड़ी समस्या", or: "ଗର୍ଭାବସ୍ଥା ସମ୍ବନ୍ଧୀୟ ସମସ୍ୟା" },
  injury: { en: "injury", hi: "चोट", or: "ଆଘାତ" },
  abdominal_pain: { en: "stomach pain", hi: "पेट दर्द", or: "ପେଟ ଯନ୍ତ୍ରଣା" },
};

/** Label for one concept in the given UI language. */
export function conceptLabel(concept: SymptomConcept, lang: LabelLang): string {
  return CONCEPT_LABELS[concept][lang];
}

/** Comma-separated labels for a list of concepts. */
export function conceptLabels(concepts: readonly SymptomConcept[], lang: LabelLang): string {
  return concepts.map((c) => CONCEPT_LABELS[c][lang]).join(", ");
}
