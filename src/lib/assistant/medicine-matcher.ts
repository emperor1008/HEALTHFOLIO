/**
 * Medicine Name Matcher for Ask Healthfolio
 *
 * Matches user-entered medicine names against authoritative sources (RxNorm).
 * Handles typos, brand/generic relationships, and ambiguous formulations.
 */

// ─── Medicine Matching Types ───────────────────────────────────────────────

export interface MedicineMatch {
  /** The matched canonical name */
  canonicalName: string;
  /** The original query term */
  queryTerm: string;
  /** Match confidence 0-1 */
  confidence: number;
  /** How the match was found */
  matchMethod:
    | "exact"
    | "alias"
    | "rxnorm_exact"
    | "rxnorm_approximate"
    | "brand_generic"
    | "prefix"
    | "typo_correction"
    | "none";
  /** Alternative candidates if ambiguous */
  alternatives: string[];
  /** Whether correction was applied */
  wasCorrected: boolean;
}

// ─── Common brand→generic mapping (Indian market + global) ─────────────────

const BRAND_GENERIC_MAP: Record<string, string> = {
  // Anti-diabetic
  glycomet: "metformin",
  gluconorm: "metformin",
  glucophage: "metformin",
  glyclade: "glipizide",
  amaryl: "glimepiride",
  glimerit: "glimepiride",
  jardiance: "empagliflozin",
  ozempic: "semaglutide",
  januvia: "sitagliptin",

  // Cardiovascular
  telma: "telmisartan",
  telmikind: "telmisartan",
  telmichem: "telmisartan",
  dimicard: "telmisartan",
  amlodac: "amlodipine",
  amlogard: "amlodipine",
  stamlo: "amlodipine",
  losar: "losartan",
  losacar: "losartan",
  atorva: "atorvastatin",
  atorvast: "atorvastatin",
  lipvas: "atorvastatin",
  crestor: "rosuvastatin",
  rosuvas: "rosuvastatin",
  rozwyn: "rosuvastatin",
  clopidogrel: "clopidogrel",
  ecosprin: "aspirin",
  ecospirin: "aspirin",
  disprin: "aspirin",
  cartia: "aspirin",
  ramistar: "ramipril",
  cardace: "ramipril",
  envas: "enalapril",
  metolar: "metoprolol",
  "met xl": "metoprolol",
  lobet: "bisoprolol",

  // Antibiotics
  azee: "azithromycin",
  azithral: "azithromycin",
  azimax: "azithromycin",
  azithrocin: "azithromycin",
  mox: "moxifloxacin",
  moxikind: "amoxicillin",
  augmentin: "amoxicillin/clavulanate",
  clamoxyl: "amoxicillin",
  cefakind: "cefixime",
  cefixime: "cefixime",
  oftax: "ofloxacin",
  oflo: "ofloxacin",
  pan: "pantoprazole",
  pantodac: "pantoprazole",
  pantop: "pantoprazole",
  pantocid: "pantoprazole",
  odipan: "pantoprazole",
  ppi: "pantoprazole",
  razo: "rabeprazole",
  rablet: "rabeprazole",
  nexpro: "esomeprazole",
  nexium: "esomeprazole",
  ranidom: "ranitidine",

  // Pain/NSAIDs
  combiflam: "ibuprofen+paracetamol",
  brufen: "ibuprofen",
  vilta: "aceclofenac",
  zoled: "aceclofenac",
  diclogest: "diclofenac",
  voltaren: "diclofenac",
  voveran: "diclofenac",

  // Respiratory
  asthalin: "salbutamol",
  asthamist: "salbutamol",
  duolin: "ipratropium+salbutamol",
  singulair: "montelukast",
  montair: "montelukast",

  allegra: "fexofenadine",
  cetizin: "cetirizine",
  alozad: "cetirizine",
  levosiz: "levocetirizine",

  // Thyroid
  thyrox: "levothyroxine",
  eltroxin: "levothyroxine",
  euthyrox: "levothyroxine",

  // Steroids
  deltacortril: "prednisolone",
  omnacortil: "prednisolone",
  wysolone: "prednisolone",
  zenflox: "prednisolone",

  // Others
  crocin: "paracetamol",
  calpol: "paracetamol",
  dolo: "paracetamol",
  doxolin: "doxophylline",
 薄荷糖: "paracetamol",
};

// ─── Known aliases (non-brand, common synonyms) ────────────────────────────

const MEDICINE_ALIASES: Record<string, string> = {
  met: "metformin",
  metro: "metformin",
  "blood sugar pill": "metformin",
  "cholesterol pill": "atorvastatin",
  statin: "atorvastatin",
  "bp medicine": "amlodipine",
  "bp tablet": "amlodipine",
  "thyroid pill": "levothyroxine",
  "thyroid medicine": "levothyroxine",
  ppis: "pantoprazole",
  "acid reflux medicine": "pantoprazole",
};

// ─── Matching Functions ────────────────────────────────────────────────────

/**
 * Match a medicine name against known medicines.
 * Returns the best match with confidence scoring.
 */
export function matchMedicineName(queryTerm: string): MedicineMatch {
  const lower = queryTerm.toLowerCase().trim();

  // 1. Exact match in brand→generic map
  for (const [brand, generic] of Object.entries(BRAND_GENERIC_MAP)) {
    if (lower === brand.toLowerCase()) {
      return {
        canonicalName: generic,
        queryTerm,
        confidence: 0.95,
        matchMethod: "brand_generic",
        alternatives: findAlternatives(generic),
        wasCorrected: true,
      };
    }
  }

  // 2. Alias match
  for (const [alias, canonical] of Object.entries(MEDICINE_ALIASES)) {
    if (lower === alias.toLowerCase()) {
      return {
        canonicalName: canonical,
        queryTerm,
        confidence: 0.90,
        matchMethod: "alias",
        alternatives: findAlternatives(canonical),
        wasCorrected: true,
      };
    }
  }

  // 3. Check typo corrections
  const TYPO_CORRECTIONS: Record<string, string> = {
    metformine: "metformin",
    metforman: "metformin",
    amoxycillin: "amoxicillin",
    amoxilin: "amoxicillin",
    amoxicilin: "amoxicillin",
    paracetemol: "paracetamol",
    doxycyline: "doxycycline",
    azithromycine: "azithromycin",
    amlodipene: "amlodipine",
    losartin: "losartan",
    telmisartin: "telmisartan",
    atorvastine: "atorvastatin",
    rosuvastine: "rosuvastatin",
    pantaprazole: "pantoprazole",
    omeprazol: "omeprazole",
    ibuprofin: "ibuprofen",
    diclofinac: "diclofenac",
    ramipril: "ramipril",
    rampiril: "ramipril",
    metoprolal: "metoprolol",
    aspirine: "aspirin",
    warfrin: "warfarin",
    insuline: "insulin",
    thyroxin: "thyroxine",
    levthyroxine: "levothyroxine",
    montelukust: "montelukast",
    cetrezine: "cetirizine",
    salbutomol: "salbutamol",
  };

  for (const [typo, correct] of Object.entries(TYPO_CORRECTIONS)) {
    if (lower === typo) {
      return {
        canonicalName: correct,
        queryTerm,
        confidence: 0.85,
        matchMethod: "typo_correction",
        alternatives: findAlternatives(correct),
        wasCorrected: true,
      };
    }
  }

  // 4. Exact match against canonical names
  for (const [brand, generic] of Object.entries(BRAND_GENERIC_MAP)) {
    if (lower === generic.toLowerCase()) {
      return {
        canonicalName: generic,
        queryTerm,
        confidence: 1.0,
        matchMethod: "exact",
        alternatives: [],
        wasCorrected: false,
      };
    }
  }

  // 5. Prefix match
  const prefixMatches: string[] = [];
  const canonicalNames = new Set(Object.values(BRAND_GENERIC_MAP));
  for (const name of Array.from(canonicalNames)) {
    if (name.toLowerCase().startsWith(lower) && lower.length >= 3) {
      prefixMatches.push(name);
    }
  }

  if (prefixMatches.length === 1) {
    return {
      canonicalName: prefixMatches[0],
      queryTerm,
      confidence: 0.75,
      matchMethod: "prefix",
      alternatives: [],
      wasCorrected: true,
    };
  }

  if (prefixMatches.length > 1 && prefixMatches.length <= 4) {
    return {
      canonicalName: prefixMatches[0],
      queryTerm,
      confidence: 0.6,
      matchMethod: "prefix",
      alternatives: prefixMatches.slice(1, 4),
      wasCorrected: false,
    };
  }

  // 6. Damerau-Levenshtein fuzzy match (simple implementation)
  const fuzzyMatch = findFuzzyMatch(lower, canonicalNames);
  if (fuzzyMatch && fuzzyMatch.distance <= 2 && fuzzyMatch.distance > 0) {
    const maxLen = Math.max(lower.length, fuzzyMatch.name.length);
    const confidence = Math.max(0.5, 1 - fuzzyMatch.distance / maxLen);
    return {
      canonicalName: fuzzyMatch.name,
      queryTerm,
      confidence,
      matchMethod: "rxnorm_approximate",
      alternatives: fuzzyMatch.alternatives,
      wasCorrected: true,
    };
  }

  // 7. No match
  return {
    canonicalName: queryTerm,
    queryTerm,
    confidence: 0,
    matchMethod: "none",
    alternatives: [],
    wasCorrected: false,
  };
}

/**
 * Get correction confidence label for display.
 */
export function getCorrectionLabel(confidence: number): {
  label: string;
  showAutoCorrect: boolean;
  showAskUser: boolean;
} {
  if (confidence >= 0.92) {
    return { label: "Showing results for", showAutoCorrect: true, showAskUser: false };
  }
  if (confidence >= 0.75) {
    return { label: "Did you mean", showAutoCorrect: false, showAskUser: true };
  }
  return { label: "Possible matches", showAutoCorrect: false, showAskUser: true };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function findAlternatives(canonical: string): string[] {
  const alts = new Set<string>();
  for (const generic of Object.values(BRAND_GENERIC_MAP)) {
    if (generic === canonical) continue;
    // Find brands for the same generic
    for (const [brand, g] of Object.entries(BRAND_GENERIC_MAP)) {
      if (g === generic && generic === canonical) {
        alts.add(brand);
      }
    }
  }
  return Array.from(alts).slice(0, 5);
}

function findFuzzyMatch(
  query: string,
  candidates: Set<string>
): { name: string; distance: number; alternatives: string[] } | null {
  let best: { name: string; distance: number } | null = null;
  const closeMatches: string[] = [];

  for (const candidate of Array.from(candidates)) {
    const lowerCandidate = candidate.toLowerCase();
    const distance = damerauLevenshtein(query, lowerCandidate);
    const maxLen = Math.max(query.length, lowerCandidate.length);

    if (distance <= Math.min(2, Math.floor(maxLen * 0.3))) {
      if (!best || distance < best.distance) {
        if (best) closeMatches.push(best.name);
        best = { name: candidate, distance };
      } else if (distance <= 3) {
        closeMatches.push(candidate);
      }
    }
  }

  if (best) {
    return { ...best, alternatives: closeMatches.slice(0, 3) };
  }
  return null;
}

/**
 * Damerau-Levenshtein distance (simple implementation for short strings).
 */
function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const d: number[][] = [];

  for (let i = 0; i <= la; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= lb; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      // Transposition
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[la][lb];
}
