/**
 * Deterministic test-name normalization.
 *
 * Groups obvious equivalent labels without changing medical meaning.
 * This is a reviewed alias registry, NOT a free-form LLM merge.
 *
 * Rules:
 * - Preserve original_test_name permanently.
 * - Unknown tests get a stable normalized form but are NOT merged with others.
 * - Ambiguous normalization requires human review.
 */

/** Lowercase, trimmed, punctuation-stripped form for matching */
function canonical(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reviewed alias registry: maps canonical forms → normalized group key.
 * Each entry means "these labels are medically equivalent".
 *
 * Add new entries only after expert review.
 */
const ALIAS_REGISTRY: Record<string, string> = {
  // HbA1c variants
  "hemoglobin a1c": "hba1c",
  "glycated hemoglobin": "hba1c",
  "hba1c": "hba1c",
  "hba 1c": "hba1c",
  "hba1c hplc": "hba1c",
  "haemoglobin a1c": "hba1c",
  "glycohemoglobin": "hba1c",

  // Fasting Blood Glucose
  "fasting blood glucose": "fasting_blood_glucose",
  "fbg": "fasting_blood_glucose",
  "fasting plasma glucose": "fasting_blood_glucose",
  "fasting glucose": "fasting_blood_glucose",
  "fbs": "fasting_blood_glucose",
  "blood sugar fasting": "fasting_blood_glucose",
  "blood glucose fasting": "fasting_blood_glucose",

  // Random Blood Sugar (distinct from fasting)
  "random blood glucose": "random_blood_glucose",
  "rbg": "random_blood_glucose",
  "random plasma glucose": "random_blood_glucose",
  "random glucose": "random_blood_glucose",
  "blood sugar random": "random_blood_glucose",

  // Total Cholesterol
  "total cholesterol": "total_cholesterol",
  "cholesterol total": "total_cholesterol",
  "serum cholesterol": "total_cholesterol",
  "cholesterol": "total_cholesterol",

  // LDL (separate from total)
  "ldl cholesterol": "ldl_cholesterol",
  "ldl": "ldl_cholesterol",
  "low density lipoprotein": "ldl_cholesterol",
  "low-density lipoprotein": "ldl_cholesterol",

  // HDL (separate from total)
  "hdl cholesterol": "hdl_cholesterol",
  "hdl": "hdl_cholesterol",
  "high density lipoprotein": "hdl_cholesterol",
  "high-density lipoprotein": "hdl_cholesterol",

  // Triglycerides
  "triglycerides": "triglycerides",
  "triglyceride": "triglycerides",
  "tg": "triglycerides",
  "serum triglycerides": "triglycerides",

  // Creatinine (NOT creatinine clearance)
  "creatinine": "creatinine",
  "serum creatinine": "creatinine",
  "s. creatinine": "creatinine",
  "blood creatinine": "creatinine",

  // Creatinine Clearance (distinct from creatinine)
  "creatinine clearance": "creatinine_clearance",
  "crcl": "creatinine_clearance",

  // TSH
  "tsh": "tsh",
  "thyroid stimulating hormone": "tsh",
  "thyroid-stimulating hormone": "tsh",
  "thyrotropin": "tsh",

  // Free T4 (separate from total T4)
  "free t4": "free_t4",
  "ft4": "free_t4",
  "free thyroxine": "free_t4",

  // Total T4 (separate from free T4)
  "total t4": "total_t4",
  "t4": "total_t4",
  "thyroxine": "total_t4",

  // Free T3
  "free t3": "free_t3",
  "ft3": "free_t3",
  "free triiodothyronine": "free_t3",

  // Hemoglobin
  "hemoglobin": "hemoglobin",
  "haemoglobin": "hemoglobin",
  "hgb": "hemoglobin",
  "hb": "hemoglobin",

  // White Blood Cell Count
  "white blood cell count": "wbc",
  "wbc": "wbc",
  "leukocyte count": "wbc",
  "total leukocyte count": "wbc",
  "tlc": "wbc",

  // Platelet Count
  "platelet count": "platelet_count",
  "platelets": "platelet_count",
  "plt": "platelet_count",

  // Blood Urea Nitrogen
  "blood urea nitrogen": "bun",
  "bun": "bun",
  "urea nitrogen": "bun",

  // Urea
  "urea": "urea",
  "blood urea": "urea",
  "s. urea": "urea",
  "serum urea": "urea",

  // ALT / SGPT
  "alt": "alt_sgpt",
  "sgpt": "alt_sgpt",
  "alanine aminotransferase": "alt_sgpt",

  // AST / SGOT
  "ast": "ast_sgot",
  "sgot": "ast_sgot",
  "aspartate aminotransferase": "ast_sgot",

  // Vitamin D
  "vitamin d": "vitamin_d",
  "25-hydroxyvitamin d": "vitamin_d",
  "25 oh vitamin d": "vitamin_d",
  "25 hydroxyvitamin d": "vitamin_d",

  // Vitamin B12
  "vitamin b12": "vitamin_b12",
  "b12": "vitamin_b12",
  "serum b12": "vitamin_b12",

  // Iron
  "serum iron": "iron",
  "iron": "iron",

  // Ferritin
  "ferritin": "ferritin",
  "serum ferritin": "ferritin",

  // ESR
  "esr": "esr",
  "erythrocyte sedimentation rate": "esr",
  "sedimentation rate": "esr",

  // CRP
  "crp": "crp",
  "c reactive protein": "crp",
  "c-reactive protein": "crp",
};

/**
 * Normalize a test name to a stable group key.
 *
 * - Looks up in ALIAS_REGISTRY first.
 * - Falls back to a stable canonical form.
 * - Never merges unknown tests automatically.
 */
export function normalizeTestName(originalName: string): string {
  const key = canonical(originalName);
  return ALIAS_REGISTRY[key] || key;
}

/**
 * Normalize a unit string for comparison.
 * e.g., "mg/dL" and "mg / dL" → "mg/dl"
 */
export function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  return unit
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Build a stable fingerprint for deduplication.
 * Prevents storing the same measurement from the same evidence twice.
 */
export function buildSourceFingerprint(params: {
  documentId: string;
  pageNumber: number;
  normalizedTestName: string;
  evidenceText: string;
}): string {
  const parts = [
    params.documentId,
    String(params.pageNumber),
    params.normalizedTestName,
    params.evidenceText.toLowerCase().trim().substring(0, 200),
  ];
  // Simple stable hash — no crypto needed for dedup
  return parts.join("::");
}

/**
 * Check whether two test names are medically distinct.
 * Returns false when they share a normalized form (i.e., they are equivalent).
 */
export function areTestsEquivalent(a: string, b: string): boolean {
  return normalizeTestName(a) === normalizeTestName(b);
}
