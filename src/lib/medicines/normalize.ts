/**
 * Medicine name normalization — deterministic name cleaning and matching.
 * No AI involved — purely algorithmic.
 */

/**
 * Normalize a medicine name for consistent matching.
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common suffixes like "tablet", "capsule" (for matching only)
 * - Remove special characters except hyphens
 */
export function normalizeMedicineName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract strength from a medicine name string.
 * Examples: "Paracetamol 500mg", "Amoxicillin 250 mg/5ml"
 */
export function extractStrength(name: string): string | null {
  // Match patterns like "500mg", "250 mg", "10 mg/ml", "500mg/5ml"
  const match = name.match(/(\d+(?:\.\d+)?)\s*(mg|ml|g|mcg|iu|units?|%)/i);
  return match ? match[0] : null;
}

/**
 * Extract dose form from a medicine name string.
 */
export function extractDoseForm(name: string): string | null {
  const forms = [
    "tablet", "capsule", "injection", "syrup", "suspension",
    "solution", "cream", "ointment", "gel", "drops", "inhaler",
    "patch", "suppository", "powder", "granules", "effervescent",
    "extended-release", "controlled-release", "sustained-release",
  ];

  const lower = name.toLowerCase();
  for (const form of forms) {
    if (lower.includes(form)) {
      return form;
    }
  }

  return null;
}

/**
 * Extract route from a medicine name string.
 */
export function extractRoute(name: string): string | null {
  const routes = [
    "oral", "intravenous", "intramuscular", "subcutaneous",
    "topical", "inhaled", "nasal", "ophthalmic", "rectal",
    "sublingual", "transdermal", "epidural", "intrathecal",
  ];

  const lower = name.toLowerCase();
  for (const route of routes) {
    if (lower.includes(route)) {
      return route;
    }
  }

  return null;
}

/**
 * Check if a name looks like a brand name vs generic.
 * Brand names are typically capitalized and don't contain common generic words.
 */
export function isLikelyBrandName(name: string): boolean {
  const lower = name.toLowerCase();
  const genericIndicators = [
    "paracetamol", "ibuprofen", "aspirin", "amoxicillin",
    "metformin", "atorvastatin", "omeprazole", "amlodipine",
    "losartan", "ciprofloxacin", "doxycycline", "azithromycin",
    "cetirizine", "loratadine", "ranitidine", "pantoprazole",
  ];

  // If it matches a known generic, it's not a brand
  if (genericIndicators.some((g) => lower.includes(g))) {
    return false;
  }

  // Brand names often start with capital letters
  return /^[A-Z]/.test(name) && !lower.includes("mg") && !lower.includes("tablet");
}

/**
 * Calculate similarity between two medicine names.
 * Simple Levenshtein-based similarity for fuzzy matching.
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeMedicineName(name1);
  const n2 = normalizeMedicineName(name2);

  if (n1 === n2) return 1.0;

  // Simple substring check
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;

  // Levenshtein distance
  const len1 = n1.length;
  const len2 = n2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = n1[i - 1] === n2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;
  return 1 - matrix[len1][len2] / maxLen;
}

/**
 * Determine if two formulations match exactly.
 */
export function doFormulationsMatch(
  strength1: string | null,
  form1: string | null,
  route1: string | null,
  strength2: string | null,
  form2: string | null,
  route2: string | null
): { match: boolean; confidence: number } {
  let confidence = 0;
  let match = true;

  // Strength must match
  if (strength1 && strength2) {
    if (normalizeMedicineName(strength1) === normalizeMedicineName(strength2)) {
      confidence += 0.4;
    } else {
      match = false;
    }
  } else if (strength1 || strength2) {
    // One has strength, other doesn't — partial match
    confidence += 0.2;
  } else {
    // Neither has strength — cannot confirm
    confidence += 0.1;
  }

  // Form should match
  if (form1 && form2) {
    if (normalizeMedicineName(form1) === normalizeMedicineName(form2)) {
      confidence += 0.3;
    } else {
      match = false;
    }
  } else {
    confidence += 0.1;
  }

  // Route should match
  if (route1 && route2) {
    if (normalizeMedicineName(route1) === normalizeMedicineName(route2)) {
      confidence += 0.3;
    } else {
      match = false;
    }
  } else {
    confidence += 0.1;
  }

  return { match, confidence: Math.min(confidence, 1.0) };
}
