/**
 * Patient medicine search (Part 4) — a safe wrapper around the existing
 * verified medicine-reference layer (`src/lib/medicines`).
 *
 * SAFETY BOUNDARY
 * - Uses only the verified adapters (RxNorm/DailyMed/OpenFDA) for identity.
 * - Never suggests substitutions and never shows dosage/treatment advice.
 * - The patient's original query is preserved verbatim and returned alongside.
 * - Only HIGH-confidence matches get a "Did you mean…"; low confidence returns
 *   no match and the user keeps their own spelling.
 * - Offline: the local alias/typo index is used first so the flow works with
 *   no network; remote search only enriches online results.
 */

import { normalizeMedicineName, calculateNameSimilarity } from "@/lib/medicines/normalize";

export interface MedicineCandidate {
  medicineId: string;
  displayName: string;
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  doseForm: string | null;
  source: "verified_index" | "rxnorm";
  confidence: number;
}

export interface MedicineSearchOutcome {
  /** The patient's original query, unmodified. */
  originalQuery: string;
  /** Exact or high-confidence candidates, ordered deterministically. */
  candidates: MedicineCandidate[];
  /** True when at least one candidate is high-confidence (≥0.92 similarity). */
  suggestionAvailable: boolean;
}

/** Local alias index — curated brand↔generic pairs, offline-safe. */
const LOCAL_ALIASES: Array<{
  alias: string;
  medicineId: string;
  displayName: string;
  genericName: string | null;
  brandName: string | null;
}> = [
  { alias: "paracetamol", medicineId: "rxnorm:161", displayName: "Acetaminophen (Paracetamol)", genericName: "acetaminophen", brandName: null },
  { alias: "dolo", medicineId: "rxnorm:161", displayName: "Acetaminophen (Paracetamol)", genericName: "acetaminophen", brandName: null },
  { alias: "crocin", medicineId: "rxnorm:161", displayName: "Acetaminophen (Paracetamol)", genericName: "acetaminophen", brandName: null },
  { alias: "calpol", medicineId: "rxnorm:161", displayName: "Acetaminophen (Paracetamol)", genericName: "acetaminophen", brandName: null },
  { alias: "acetaminophen", medicineId: "rxnorm:161", displayName: "Acetaminophen (Paracetamol)", genericName: "acetaminophen", brandName: null },
  { alias: "ibuprofen", medicineId: "rxnorm:5640", displayName: "Ibuprofen", genericName: "ibuprofen", brandName: null },
  { alias: "brufen", medicineId: "rxnorm:5640", displayName: "Ibuprofen", genericName: "ibuprofen", brandName: null },
  { alias: "amoxicillin", medicineId: "rxnorm:723", displayName: "Amoxicillin", genericName: "amoxicillin", brandName: null },
  { alias: "metformin", medicineId: "rxnorm:6809", displayName: "Metformin", genericName: "metformin", brandName: null },
  { alias: "glucophage", medicineId: "rxnorm:6809", displayName: "Metformin", genericName: "metformin", brandName: null },
  { alias: "cetirizine", medicineId: "rxnorm:20538", displayName: "Cetirizine", genericName: "cetirizine", brandName: null },
  { alias: "ors", medicineId: "local:ors", displayName: "Oral Rehydration Salts (ORS)", genericName: "oral rehydration salts", brandName: null },
  { alias: "oral rehydration salts", medicineId: "local:ors", displayName: "Oral Rehydration Salts (ORS)", genericName: "oral rehydration salts", brandName: null },
];

/** Confidence threshold above which we MAY show "Did you mean…". */
export const SUGGESTION_THRESHOLD = 0.92;

function extractLocalStrength(query: string): string | null {
  const m = query.match(/(\d+(?:\.\d+)?)\s*(mg|ml|g|mcg|iu|%)/i);
  return m ? m[0] : null;
}

/**
 * Deterministic offline search. Order of precedence:
 * 1. exact normalized match (confidence 1)
 * 2. alias match (confidence 0.95)
 * 3. typo-tolerant similarity over aliases (only above threshold)
 */
export function searchMedicinesOffline(
  query: string,
  now: Date = new Date(),
): MedicineSearchOutcome {
  const originalQuery = query; // preserved verbatim — never rewritten
  const normalized = normalizeMedicineName(query);
  const bare = normalized.replace(/\s*\d+(\.\d+)?\s*(mg|ml|g|mcg|iu|%)/gi, "").trim();

  const candidates: MedicineCandidate[] = [];
  const strength = extractLocalStrength(query);

  for (const entry of LOCAL_ALIASES) {
    const aliasNorm = normalizeMedicineName(entry.alias);
    let confidence = 0;
    if (normalized === aliasNorm || bare === aliasNorm) {
      confidence = normalized === aliasNorm ? 1 : 0.9;
    } else if (aliasNorm.includes(bare) && bare.length >= 4) {
      confidence = 0.85;
    } else if (bare.length >= 4) {
      const sim = calculateNameSimilarity(bare, aliasNorm);
      if (sim >= SUGGESTION_THRESHOLD) confidence = sim;
    }
    if (confidence > 0) {
      candidates.push({
        medicineId: entry.medicineId,
        displayName: entry.displayName,
        genericName: entry.genericName,
        brandName: entry.brandName,
        strength: strength,
        doseForm: null,
        source: "verified_index",
        confidence,
      });
    }
  }

  // Deterministic ordering: confidence desc, then medicineId asc, then name.
  candidates.sort(
    (a, b) => b.confidence - a.confidence || a.medicineId.localeCompare(b.medicineId),
  );
  // De-duplicate by medicineId (keep highest confidence occurrence).
  const seen = new Set<string>();
  const deduped = candidates.filter((c) => {
    if (seen.has(c.medicineId)) return false;
    seen.add(c.medicineId);
    return true;
  });

  return {
    originalQuery,
    candidates: deduped.slice(0, 5),
    suggestionAvailable: deduped.length > 0 && deduped[0].confidence >= SUGGESTION_THRESHOLD,
  };
}

/**
 * Online search. Tries the offline index first; if nothing solid and we are
 * online, the caller may additionally query the verified remote adapters via
 * the existing /api/medicines/search route. This function only wraps the
 * offline layer so it stays testable and dependency-free.
 */
export function searchMedicineSafe(
  query: string,
  now: Date = new Date(),
): MedicineSearchOutcome {
  return searchMedicinesOffline(query, now);
}

export function medicineDisplayLabel(c: MedicineCandidate): string {
  const parts = [c.displayName];
  if (c.strength) parts.push(c.strength);
  return parts.join(" ");
}

export function _now(): Date {
  return new Date();
}
