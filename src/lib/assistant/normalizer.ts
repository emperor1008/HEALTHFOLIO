/**
 * Query Normalizer for Ask Healthfolio
 *
 * Normalizes user input while preserving medically meaningful characters.
 * Handles spelling mistakes, OCR artifacts, Unicode variants, and common typos.
 */

// ─── Common OCR / typo corrections ────────────────────────────────────────

const MEDICAL_ABBREVIATIONS: Record<string, string> = {
  // Common medical abbreviations
  hba1c: "HbA1c",
  hgb: "hemoglobin",
  hgbalc: "HbA1c",
  "hemoglobin a1c": "HbA1c",
  "hemoglobin alc": "HbA1c",
  "glycated hemoglobin": "HbA1c",
  "glycated haemoglobin": "HbA1c",
  fbs: "fasting blood sugar",
  rbs: "random blood sugar",
  ppbs: "postprandial blood sugar",
  hdl: "HDL cholesterol",
  ldl: "LDL cholesterol",
  vldl: "VLDL cholesterol",
  tsh: "TSH",
  "thyroid stimulating hormone": "TSH",
  ft4: "free T4",
  "free thyroxine": "free T4",
  tt4: "total T4",
  "total thyroxine": "total T4",
  ft3: "free T3",
  "s creat": "serum creatinine",
  "s.creat": "serum creatinine",
  "blood urea": "BUN",
  bun: "blood urea nitrogen",
  sgpt: "ALT",
  sgot: "AST",
  "urine sugar": "urine glucose",
  "urine albumin": "urine albumin",
  ecg: "ECG",
  echo: "echocardiography",
  mri: "MRI",
  ct: "CT scan",
  xray: "X-ray",
  "x-ray": "X-ray",
  bp: "blood pressure",
  bpm: "beats per minute",
  bmi: "BMI",
  wbc: "WBC",
  "white blood cell": "WBC",
  rbc: "RBC",
  "red blood cell": "RBC",
  plt: "platelets",
  esr: "ESR",
  crp: "CRP",
  "uric acid": "uric acid",
  vitd: "vitamin D",
  "vit d": "vitamin D",
  "vitamin d3": "vitamin D",
  "folic acid": "folic acid",
  b12: "vitamin B12",
  "vit b12": "vitamin B12",
  "vitamin b12": "vitamin B12",
  ua: "uric acid",
  hbsag: "HBsAg",
  antiHCV: "anti-HCV",
  "blood group": "blood group",
};

// ─── Typo correction map (common medical spelling mistakes) ────────────────

const TYPO_CORRECTIONS: Record<string, string> = {
  metformine: "metformin",
  metforman: "metformin",
  metformin: "metformin",
  amoxycillin: "amoxicillin",
  amoxilin: "amoxicillin",
  amoxicilin: "amoxicillin",
  amoxiciline: "amoxicillin",
  paracetamol: "paracetamol",
  paracetemol: "paracetamol",
  acetaminophen: "acetaminophen",
  crocin: "paracetamol",
  doxycycline: "doxycycline",
  doxycyline: "doxycycline",
  azithromycin: "azithromycin",
  azithromycine: "azithromycin",
  amlodipine: "amlodipine",
  amlodipene: "amlodipine",
  losartan: "losartan",
  losartin: "losartan",
  telmisartan: "telmisartan",
  telmisartin: "telmisartan",
  atorvastatin: "atorvastatin",
  atorvastine: "atorvastatin",
  rosuvastatin: "rosuvastatin",
  rosuvastine: "rosuvastatin",
  pantoprazole: "pantoprazole",
  pantaprazole: "pantoprazole",
  omeprazole: "omeprazole",
  omeprazol: "omeprazole",
  esomeprazole: "esomeprazole",
  levofloxacin: "levofloxacin",
  levofoxacin: "levofloxacin",
  ciprofloxacin: "ciprofloxacin",
  cefixime: "cefixime",
  cefixim: "cefixime",
  cefpodoxime: "cefpodoxime",
  ibuprofen: "ibuprofen",
  ibuprofin: "ibuprofen",
  diclofenac: "diclofenac",
  diclofinac: "diclofenac",
  aceclofenac: "aceclofenac",
  pantop: "pantoprazole",
  ramipril: "ramipril",
  rampiril: "ramipril",
  enalapril: "enalapril",
  enalipril: "enalapril",
  metoprolol: "metoprolol",
  metoprolal: "metoprolol",
  bisoprolol: "bisoprolol",
  bisoprolal: "bisoprolol",
  aspirin: "aspirin",
  aspirine: "aspirin",
  clopidogrel: "clopidogrel",
  warfarin: "warfarin",
  warfrin: "warfarin",
  insulin: "insulin",
  insuline: "insulin",
  thyroxine: "thyroxine",
  thyroxin: "thyroxine",
  levothyroxine: "levothyroxine",
  levthyroxine: "levothyroxine",
  montelukast: "montelukast",
  montelukust: "montelukast",
  cetirizine: "cetirizine",
  cetrezine: "cetirizine",
  loratadine: "loratadine",
  loratidine: "loratadine",
  salbutamol: "salbutamol",
  salbutomol: "salbutamol",
  HCQ: "hydroxychloroquine",
  hydroxychloroquin: "hydroxychloroquine",
  prednisolone: "prednisolone",
  prednisalone: "prednisolone",
  dexamethasone: "dexamethasone",
  prednisone: "prednisone",
};

// ─── Test name normalization ───────────────────────────────────────────────

export interface NormalizedQuery {
  /** Original user input */
  original: string;
  /** Cleaned text (spaces, case, Unicode) */
  cleaned: string;
  /** Any correction applied */
  correctedText: string | null;
  /** Detected medicine names */
  medicineNames: string[];
  /** Detected test names */
  testNames: string[];
  /** Detected abbreviations mapped to canonical forms */
  abbreviations: Array<{ original: string; canonical: string }>;
}

/**
 * Normalize a user query for Ask Healthfolio.
 */
export function normalizeQuery(text: string): NormalizedQuery {
  const original = text.trim();

  // Step 1: Basic cleaning
  let cleaned = original
    .replace(/[\u200B\uFEFF]/g, "") // Remove zero-width spaces
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/[""]/g, '"') // Normalize quotes
    .replace(/['']/g, "'") // Normalize apostrophes
    .trim();

  // Step 2: Check for typo corrections (whole-word matches)
  let correctedText: string | null = null;
  const lowerCleaned = cleaned.toLowerCase();

  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    if (lowerCleaned.includes(typo)) {
      correctedText = cleaned.replace(
        new RegExp(`\\b${escapeRegex(typo)}\\b`, "gi"),
        correction
      );
      break; // Apply one correction at a time
    }
  }

  const effectiveText = correctedText || cleaned;

  // Step 3: Detect abbreviations
  const abbreviations: NormalizedQuery["abbreviations"] = [];
  for (const [abbr, canonical] of Object.entries(MEDICAL_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${escapeRegex(abbr)}\\b`, "gi");
    if (regex.test(effectiveText)) {
      abbreviations.push({ original: abbr, canonical });
    }
  }

  // Step 4: Extract medicine names (simple heuristic)
  const medicineNames = extractMedicineNames(effectiveText);

  // Step 5: Extract test names
  const testNames = extractTestNames(effectiveText);

  return {
    original,
    cleaned,
    correctedText,
    medicineNames,
    testNames,
    abbreviations,
  };
}

/**
 * Simple medicine name extraction from query text.
 * Returns potential medicine names for matching against RxNorm.
 */
function extractMedicineNames(text: string): string[] {
  const names: string[] = [];
  const lower = text.toLowerCase();

  // Check known medicine names in the text
  for (const correction of Object.values(TYPO_CORRECTIONS)) {
    if (lower.includes(correction)) {
      names.push(correction);
    }
  }
  for (const typo of Object.keys(TYPO_CORRECTIONS)) {
    if (lower.includes(typo) && !names.includes(TYPO_CORRECTIONS[typo])) {
      names.push(TYPO_CORRECTIONS[typo]);
    }
  }

  // Also look for capitalized words that might be medicine names
  // (e.g., "What is Amoxilin?")
  const words = text.split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[?.!,]/g, "").toLowerCase();
    if (
      TYPO_CORRECTIONS[clean] &&
      !names.includes(TYPO_CORRECTIONS[clean])
    ) {
      names.push(TYPO_CORRECTIONS[clean]);
    }
  }

  return Array.from(new Set(names));
}

/**
 * Extract test names from query text.
 */
function extractTestNames(text: string): string[] {
  const names: string[] = [];
  const lower = text.toLowerCase();

  // Check abbreviation mappings
  for (const [abbr, canonical] of Object.entries(MEDICAL_ABBREVIATIONS)) {
    if (lower.includes(abbr)) {
      names.push(canonical);
    }
  }

  // Common test patterns
  const testPatterns = [
    /\bhba1c\b/i,
    /\bhemoglobin\s+a1c\b/i,
    /\bhemoglobin\s+alc\b/i,
    /\bfasting\s+(?:blood\s+)?(?:sugar|glucose)\b/i,
    /\brandom\s+(?:blood\s+)?(?:sugar|glucose)\b/i,
    /\bpostprandial\b/i,
    /\b(?:total|free|ldl|hdl|vldl)\s+cholesterol\b/i,
    /\btriglycerides?\b/i,
    /\b(?:serum\s+)?(?:creatinine|urea|uric\s+acid|bilirubin)\b/i,
    /\b(?:serum\s+)?(?:sgpt|sgot|alt|ast)\b/i,
    /\btsh\b/i,
    /\b(?:free|total)\s+t[34]\b/i,
    /\bcomplete\s+blood\s+(?:count|cbc)\b/i,
    /\bcbc\b/i,
    /\bplatelets?\b/i,
    /\besr\b/i,
    /\bcrp\b/i,
    /\b(?:vitamin\s+)?d[3]?\b/i,
    /\b(?:vitamin\s+)?b12\b/i,
    /\bhbsag\b/i,
    /\bblood\s+group\b/i,
  ];

  for (const pattern of testPatterns) {
    const match = pattern.exec(text);
    if (match) {
      names.push(match[0].toLowerCase());
    }
  }

  return Array.from(new Set(names));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
