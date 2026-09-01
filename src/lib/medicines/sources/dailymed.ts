/**
 * DailyMed source adapter — real API calls to dailymed.nlm.nih.gov
 * Retrieves Structured Product Label (SPL) information.
 *
 * Official host: https://dailymed.nlm.nih.gov
 */

import type { LabelSectionKey, MedicineLabelSection, SourceLocator } from "../types";

const DAILYMED_BASE_URL = "https://dailymed.nlm.nih.gov/dailymed";
const TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "15000");

// ─── Types ────────────────────────────────────────────────────────────────

interface DailyMedSearchResult {
  setid: string;
  name: string;
  status?: string;
}

interface DailyMedSection {
  title: string;
  text: string;
  code?: string;
}

// ─── API Helpers ──────────────────────────────────────────────────────────

async function dailymedFetch<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${DAILYMED_BASE_URL}${path}`, {
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
 * Search DailyMed for labels matching a medicine name.
 */
export async function searchDailyMed(
  query: string
): Promise<{ results: DailyMedSearchResult[]; error?: string }> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { results: [], error: "MEDICINE_QUERY_REQUIRED" };
  }

  // DailyMed uses a different search endpoint
  const data = await dailymedFetch<{ data: DailyMedSearchResult[] }>(
    `/services/v2/spls.json?drug_name=${encodeURIComponent(trimmed)}&pagesize=10`
  );

  if (!data?.data) {
    return { results: [] };
  }

  return { results: data.data };
}

// ─── Label Retrieval ──────────────────────────────────────────────────────

/**
 * Retrieve all label sections for a specific DailyMed SET ID.
 */
export async function getDailyMedLabel(
  setId: string
): Promise<{
  sections: DailyMedSection[];
  metadata: {
    setId: string;
    name: string;
    version: string | null;
    effectiveDate: string | null;
  };
  error?: string;
}> {
  // Get label sections
  const data = await dailymedFetch<{
    data: {
      sections: DailyMedSection[];
      metadata?: {
        name?: string;
        version?: string;
        effective_time?: string;
      };
    };
  }>(`/services/v2/spls/${setId}.json`);

  if (!data?.data) {
    return {
      sections: [],
      metadata: { setId, name: "Unknown", version: null, effectiveDate: null },
      error: "LABEL_NOT_FOUND",
    };
  }

  return {
    sections: data.data.sections || [],
    metadata: {
      setId,
      name: data.data.metadata?.name || "Unknown",
      version: data.data.metadata?.version || null,
      effectiveDate: data.data.metadata?.effective_time || null,
    },
  };
}

/**
 * Map DailyMed section codes to our standard section keys.
 */
export function mapSectionKey(dailymedCode: string): LabelSectionKey | null {
  const mapping: Record<string, LabelSectionKey> = {
    "34088-0": "indications_and_usage",
    "34089-8": "dosage_and_administration",
    "34090-6": "dosage_forms_and_strengths",
    "34072-4": "contraindications",
    "34073-2": "warnings_and_precautions",
    "34091-4": "adverse_reactions",
    "34074-0": "drug_interactions",
    "43681-2": "pediatric_use",
    "43682-0": "geriatric_use",
    "42213-7": "pregnancy",
    "42227-7": "lactation",
    "89382-2": "renal_impairment",
    "89383-0": "hepatic_impairment",
    "34092-2": "overdosage",
    "34086-4": "description",
    "44132-2": "active_ingredients",
    "44133-0": "inactive_ingredients",
    "44134-8": "storage_and_handling",
  };

  return mapping[dailymedCode] || null;
}

/**
 * Convert DailyMed sections to our standardized label sections.
 */
export function convertToLabelSections(
  dailymedSections: DailyMedSection[],
  sourceLocator: SourceLocator
): MedicineLabelSection[] {
  const result: MedicineLabelSection[] = [];

  for (const section of dailymedSections) {
    const sectionKey = section.code ? mapSectionKey(section.code) : guessSectionKey(section.title);

    if (sectionKey && section.text && section.text.trim().length > 0) {
      result.push({
        id: "",
        sourceRecordId: sourceLocator.sourceRecordId,
        sectionKey,
        sectionTitle: section.title,
        originalText: section.text.trim(),
        plainLanguageText: null,
        aiGenerated: false,
        sourceLocator,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return result;
}

/**
 * Guess section key from title text when code is not available.
 */
function guessSectionKey(title: string): LabelSectionKey | null {
  const lower = title.toLowerCase();
  if (lower.includes("indications")) return "indications_and_usage";
  if (lower.includes("dosage") && lower.includes("administration")) return "dosage_and_administration";
  if (lower.includes("dosage form")) return "dosage_forms_and_strengths";
  if (lower.includes("contraindication")) return "contraindications";
  if (lower.includes("warning")) return "warnings_and_precautions";
  if (lower.includes("adverse")) return "adverse_reactions";
  if (lower.includes("interaction")) return "drug_interactions";
  if (lower.includes("pediatric")) return "pediatric_use";
  if (lower.includes("geriatric")) return "geriatric_use";
  if (lower.includes("pregnancy")) return "pregnancy";
  if (lower.includes("lactation")) return "lactation";
  if (lower.includes("renal")) return "renal_impairment";
  if (lower.includes("hepatic")) return "hepatic_impairment";
  if (lower.includes("overdos")) return "overdosage";
  if (lower.includes("description")) return "description";
  if (lower.includes("storage")) return "storage_and_handling";
  return null;
}
