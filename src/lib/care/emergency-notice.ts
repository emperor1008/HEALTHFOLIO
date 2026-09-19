/**
 * Emergency-safety notice detection (multilingual).
 *
 * Scans free text for immediate-danger wording and — only when found —
 * displays the fixed emergency safety notice. It never classifies, never
 * diagnoses, and never blocks submission.
 */

const EMERGENCY_KEYWORDS: Record<string, string[]> = {
  en: [
    "chest pain",
    "can't breathe",
    "cant breathe",
    "cannot breathe",
    "difficulty breathing",
    "trouble breathing",
    "unconscious",
    "severe bleeding",
    "bleeding heavily",
    "suicide",
    "suicidal",
    "heart attack",
    "stroke",
    "seizure",
    "overdose",
    "emergency",
    "ambulance",
    "not breathing",
  ],
  hi: [
    "सीने में दर्द",
    "सांस नहीं",
    "सांस लेने में",
    "बेहोश",
    "बहुत खून",
    "खून निकल",
    "दिल का दौरा",
    "लकवा",
    "दौरा पड़",
    "आपातकाल",
    "एम्बुलेंस",
  ],
  or: [
    "ଛାତି ଯନ୍ତ୍ରଣା",
    "ନିଶ୍ୱାସ",
    "ଅଚେତନ",
    "ରକ୍ତ",
    "ହୃଦୟ",
    "ଆପାତକାଳ",
    "ଆମ୍ବୁଲାନ୍ସ",
  ],
};

/** Case-insensitive scan across all language keyword sets (union approach). */
export function detectEmergencyText(text: string): boolean {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return false;
  for (const keywords of Object.values(EMERGENCY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) return true;
    }
  }
  return false;
}
