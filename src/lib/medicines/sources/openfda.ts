/**
 * openFDA source adapter — real API calls to api.fda.gov
 * Retrieves structured FDA drug label information.
 *
 * Official host: https://api.fda.gov
 */

import type { LabelSectionKey, MedicineLabelSection, SourceLocator } from "../types";

const OPENFDA_BASE_URL = "https://api.fda.gov";
const TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "15000");

// ─── Types ────────────────────────────────────────────────────────────────

interface OpenFDAResult {
  id: string;
  active_ingredients?: Array<{ name: string; strength: string }>;
  dosage_and_administration?: string[];
  indications_and_usage?: string[];
  contraindications?: string[];
  warnings?: string[];
  adverse_reactions?: string[];
  storage_and_handling?: string[];
  description?: string[];
  drug_interactions?: string[];
  pediatric_use?: string[];
  geriatric_use?: string[];
  pregnancy?: string[];
  lactation?: string[];
  overdosage?: string[];
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    route?: string[];
    dosage_form?: string[];
    substance_name?: string[];
  };
}

// ─── API Helpers ──────────────────────────────────────────────────────────

async function openfdaFetch<T>(path: string): Promise<{ results: T[]; error?: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENFDA_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (response.status === 429) {
      return { results: [], error: "SOURCE_RATE_LIMITED" };
    }

    if (!response.ok) {
      return { results: [], error: "SOURCE_UNAVAILABLE" };
    }

    const data = await response.json();
    return { results: data.results || [] };
  } catch {
    return { results: [], error: "SOURCE_TIMEOUT" };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Search openFDA for drug labels matching a medicine name.
 */
export async function searchOpenFDA(
  query: string
): Promise<{
  results: Array<{
    id: string;
    brandName: string | null;
    genericName: string | null;
    manufacturer: string | null;
    route: string | null;
    dosageForm: string | null;
  }>;
  error?: string;
}> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { results: [], error: "MEDICINE_QUERY_REQUIRED" };
  }

  const data = await openfdaFetch<OpenFDAResult>(
    `/drug/label.json?search=openfda.brand_name:${encodeURIComponent(`"${trimmed}"`)}&limit=10`
  );

  if (!data) {
    return { results: [], error: "SOURCE_UNAVAILABLE" };
  }

  if (data.error) {
    return { results: [], error: data.error };
  }

  return {
    results: data.results.map((r) => ({
      id: r.id,
      brandName: r.openfda?.brand_name?.[0] || null,
      genericName: r.openfda?.generic_name?.[0] || null,
      manufacturer: r.openfda?.manufacturer_name?.[0] || null,
      route: r.openfda?.route?.[0] || null,
      dosageForm: r.openfda?.dosage_form?.[0] || null,
    })),
  };
}

// ─── Label Retrieval ──────────────────────────────────────────────────────

/**
 * Retrieve full label for a specific openFDA drug ID.
 */
export async function getOpenFDALabel(
  drugId: string
): Promise<{
  sections: MedicineLabelSection[];
  metadata: {
    id: string;
    brandName: string | null;
    genericName: string | null;
    manufacturer: string | null;
  };
  error?: string;
}> {
  const data = await openfdaFetch<OpenFDAResult>(
    `/drug/label.json?search=id:${encodeURIComponent(drugId)}&limit=1`
  );

  if (!data || !data.results.length) {
    return {
      sections: [],
      metadata: { id: drugId, brandName: null, genericName: null, manufacturer: null },
      error: "LABEL_NOT_FOUND",
    };
  }

  const result = data.results[0];
  const sourceLocator: SourceLocator = {
    sourceName: "openfda",
    sourceUrl: `https://api.fda.gov/drug/label.json?search=id:${drugId}`,
    sourceRecordId: drugId,
    sectionTitle: "FDA Drug Label",
    effectiveDate: null,
    retrievedAt: new Date().toISOString(),
  };

  const sections = convertToLabelSections(result, sourceLocator);

  return {
    sections,
    metadata: {
      id: drugId,
      brandName: result.openfda?.brand_name?.[0] || null,
      genericName: result.openfda?.generic_name?.[0] || null,
      manufacturer: result.openfda?.manufacturer_name?.[0] || null,
    },
  };
}

// ─── Conversion ───────────────────────────────────────────────────────────

const SECTION_MAPPING: Array<{
  key: LabelSectionKey;
  field: keyof OpenFDAResult;
}> = [
  { key: "indications_and_usage", field: "indications_and_usage" },
  { key: "dosage_and_administration", field: "dosage_and_administration" },
  { key: "contraindications", field: "contraindications" },
  { key: "warnings_and_precautions", field: "warnings" },
  { key: "adverse_reactions", field: "adverse_reactions" },
  { key: "drug_interactions", field: "drug_interactions" },
  { key: "pediatric_use", field: "pediatric_use" },
  { key: "geriatric_use", field: "geriatric_use" },
  { key: "pregnancy", field: "pregnancy" },
  { key: "lactation", field: "lactation" },
  { key: "overdosage", field: "overdosage" },
  { key: "description", field: "description" },
  { key: "storage_and_handling", field: "storage_and_handling" },
];

function convertToLabelSections(
  result: OpenFDAResult,
  sourceLocator: SourceLocator
): MedicineLabelSection[] {
  const sections: MedicineLabelSection[] = [];

  for (const mapping of SECTION_MAPPING) {
    const text = result[mapping.field];
    if (text && Array.isArray(text) && text.length > 0) {
      sections.push({
        id: "",
        sourceRecordId: sourceLocator.sourceRecordId,
        sectionKey: mapping.key,
        sectionTitle: mapping.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        originalText: text.join("\n\n").trim(),
        plainLanguageText: null,
        aiGenerated: false,
        sourceLocator,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return sections;
}
