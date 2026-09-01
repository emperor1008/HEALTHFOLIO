/**
 * Test identity normalization and matching for laboratory reports.
 *
 * Builds on existing normalization.ts but adds:
 * - Panel-based identity (test + specimen + method)
 * - LOINC code candidates
 * - Distinct test identity prevention (e.g., fasting vs random glucose)
 */

import { normalizeTestName, normalizeUnit } from "@/lib/measurements/normalization";

/**
 * Build a stable test key from extracted measurement fields.
 * The key uniquely identifies a "kind of test" across reports.
 *
 * Key format: normalized_test_name[:specimen][:method]
 *
 * Examples:
 *   "hba1c" — generic HbA1c
 *   "fasting_blood_glucose::serum::enzymatic" — specific glucose test
 *   "hemoglobin::whole_blood" — hemoglobin in whole blood
 */
export function buildTestKey(params: {
  rawTestName: string;
  specimen?: string | null;
  method?: string | null;
}): string {
  const parts = [normalizeTestName(params.rawTestName)];

  if (params.specimen) {
    const normalizedSpecimen = params.specimen
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .trim();
    if (normalizedSpecimen) parts.push(normalizedSpecimen);
  }

  if (params.method) {
    const normalizedMethod = params.method
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .trim();
    if (normalizedMethod) parts.push(normalizedMethod);
  }

  return parts.join("::");
}

/**
 * Check if two test keys refer to the same test identity.
 * Returns true only if they normalize to the same key.
 */
export function areTestKeysEquivalent(keyA: string, keyB: string): boolean {
  return keyA === keyB;
}

/**
 * Check if two measurements can be compared in a trend.
 * Requires: same test key, same unit, same specimen type (when known).
 */
export function canMeasurementsTrend(params: {
  testKeyA: string;
  unitA: string | null;
  specimenA: string | null;
  testKeyB: string;
  unitB: string | null;
  specimenB: string | null;
}): { compatible: boolean; reason?: string } {
  // Same test identity
  if (params.testKeyA !== params.testKeyB) {
    return {
      compatible: false,
      reason: "These are different tests.",
    };
  }

  // Same unit
  const unitA = normalizeUnit(params.unitA);
  const unitB = normalizeUnit(params.unitB);
  if (unitA !== unitB) {
    return {
      compatible: false,
      reason: "These results use different units and cannot yet be compared safely.",
    };
  }

  // Same specimen (when both are known)
  if (params.specimenA && params.specimenB) {
    const specA = params.specimenA.toLowerCase().replace(/\s+/g, "_").trim();
    const specB = params.specimenB.toLowerCase().replace(/\s+/g, "_").trim();
    if (specA !== specB) {
      return {
        compatible: false,
        reason: "These results come from different specimen types.",
      };
    }
  }

  return { compatible: true };
}

/**
 * Panel grouping — group measurements into logical lab panels.
 * Common panel names: "Complete Blood Count", "Lipid Panel", "Thyroid Panel", etc.
 */
export interface PanelGroup {
  panelName: string | null;
  measurements: Array<{
    testKey: string;
    rawTestName: string;
    normalizedTestName: string;
  }>;
}

/**
 * Group extracted measurements by panel name.
 * Measurements without a panel get grouped under null.
 */
export function groupMeasurementsByPanel(
  measurements: Array<{
    panelName?: string | null;
    rawTestName: string;
  }>
): PanelGroup[] {
  const groups = new Map<string | null, PanelGroup>();

  for (const m of measurements) {
    const panelName = m.panelName || null;
    const key = panelName || "__unpaneled__";

    if (!groups.has(key)) {
      groups.set(key, { panelName, measurements: [] });
    }

    const group = groups.get(key)!;
    group.measurements.push({
      testKey: buildTestKey({ rawTestName: m.rawTestName }),
      rawTestName: m.rawTestName,
      normalizedTestName: normalizeTestName(m.rawTestName),
    });
  }

  return Array.from(groups.values());
}

/**
 * Known aliases that should NOT be merged.
 * These tests look similar but are medically distinct.
 */
export const DISTINCT_TEST_PAIRS: Array<[string, string, string]> = [
  [
    "fasting_blood_glucose",
    "random_blood_glucose",
    "Fasting glucose and random glucose are different tests",
  ],
  [
    "ldl_cholesterol",
    "hdl_cholesterol",
    "LDL and HDL are different lipid fractions",
  ],
  [
    "total_cholesterol",
    "ldl_cholesterol",
    "Total cholesterol and LDL are different measurements",
  ],
  [
    "creatinine",
    "creatinine_clearance",
    "Serum creatinine and creatinine clearance measure different things",
  ],
  [
    "free_t4",
    "total_t4",
    "Free T4 and total T4 measure different fractions",
  ],
  [
    "hemoglobin",
    "hba1c",
    "Hemoglobin and HbA1c are different measurements",
  ],
  [
    "tsh",
    "free_t3",
    "TSH and Free T3 are different thyroid measurements",
  ],
];

/**
 * Check if two test keys are known to be distinct despite similarity.
 */
export function areTestsDistinct(keyA: string, keyB: string): string | null {
  for (const [a, b, reason] of DISTINCT_TEST_PAIRS) {
    if ((keyA === a && keyB === b) || (keyA === b && keyB === a)) {
      return reason;
    }
  }
  return null;
}
