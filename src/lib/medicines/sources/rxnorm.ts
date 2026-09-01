/**
 * RxNorm source adapter — real API calls to rxnav.nlm.nih.gov
 * Normalizes medicine names, identifies generic/brand, obtains RxCUI.
 *
 * Official host: https://rxnav.nlm.nih.gov
 */

import type { MedicineSearchResult } from "../types";

const RXNORM_BASE_URL = "https://rxnav.nlm.nih.gov";
const TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "15000");

// ─── Types ────────────────────────────────────────────────────────────────

interface RxNormTerm {
  rxcui: string;
  name: string;
  tty: string;
  source: string;
}

interface RxNormProperties {
  rxcui: string;
  properties: Record<string, string>;
}

// ─── API Helpers ──────────────────────────────────────────────────────────

async function rxnormFetch<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${RXNORM_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Search RxNorm for medicines matching a query string.
 * Returns normalized candidates from the RxNorm /terms endpoint.
 */
export async function searchRxNorm(
  query: string
): Promise<{ results: MedicineSearchResult[]; error?: string }> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { results: [], error: "MEDICINE_QUERY_REQUIRED" };
  }

  // Use /REST/rxcui.json for name resolution
  const data = await rxnormFetch<{ idGroup: { rxcui: string[] } }>(
    `/REST/rxcui.json?search=${encodeURIComponent(trimmed)}&max=20`
  );

  if (!data?.idGroup?.rxcui?.length) {
    return { results: [] };
  }

  // Get properties for each RxCUI
  const results: MedicineSearchResult[] = [];

  for (const rxcui of data.idGroup.rxcui.slice(0, 10)) {
    const props = await rxnormFetch<{ properties: Record<string, string> }>(
      `/REST/rxcui/${rxcui}/properties.json`
    );

    if (props?.properties) {
      const p = props.properties;
      results.push({
        rxcui,
        name: p.name || trimmed,
        entityType: determineEntityType(p),
        genericName: p.name || null,
        brandName: p.name !== p.name ? p.name : null,
        strength: p.dose || p.strength || null,
        doseForm: p.doseForm || p.form || null,
        route: p.route || null,
        source: "rxnorm",
      });
    }
  }

  return { results };
}

// ─── RxCUI Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a specific RxCUI to its full identity.
 */
export async function resolveRxCUI(
  rxcui: string
): Promise<{
  identity: {
    rxcui: string;
    name: string;
    genericName: string | null;
    brandName: string | null;
    strength: string | null;
    doseForm: string | null;
    route: string | null;
    entityType: string;
  } | null;
  error?: string;
}> {
  const props = await rxnormFetch<{ properties: Record<string, string> }>(
    `/REST/rxcui/${rxcui}/properties.json`
  );

  if (!props?.properties) {
    return { identity: null, error: "RXCUI_NOT_FOUND" };
  }

  const p = props.properties;
  return {
    identity: {
      rxcui,
      name: p.name || "Unknown",
      genericName: p.name || null,
      brandName: p.name !== p.name ? p.name : null,
      strength: p.dose || p.strength || null,
      doseForm: p.doseForm || p.form || null,
      route: p.route || null,
      entityType: determineEntityType(p),
    },
  };
}

/**
 * Get related concepts (ingredients, brands, forms) for an RxCUI.
 */
export async function getRelatedConcepts(
  rxcui: string
): Promise<{ related: RxNormTerm[] }> {
  const data = await rxnormFetch<{ conceptGroup: Array<{ tty: string; conceptProperties: RxNormTerm[] }> }>(
    `/REST/rxcui/${rxcui}/related.json`
  );

  if (!data?.conceptGroup) {
    return { related: [] };
  }

  const related: RxNormTerm[] = [];
  for (const group of data.conceptGroup) {
    if (group.conceptProperties) {
      related.push(...group.conceptProperties);
    }
  }

  return { related };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function determineEntityType(props: Record<string, string>): string {
  const tty = props.tty || "";
  if (tty === "IN") return "ingredient";
  if (tty === "BN") return "brand";
  if (tty === "SCD" || tty === "SBD") return "clinical_drug";
  if (tty === "SCDF" || tty === "SBDF") return "clinical_drug_form";
  if (tty === "GPCK" || tty === "BPCK") return "generic_pack";
  return "ingredient";
}
