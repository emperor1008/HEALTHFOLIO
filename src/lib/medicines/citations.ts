/**
 * Medicine citations — source citation generation and validation.
 * Every displayed medical fact must include a verifiable source citation.
 */

import type { SourceCitation, SourceLocator, MedicineSourceRecord, MedicineLabelSection } from "./types";

// ─── Citation Generation ──────────────────────────────────────────────────

/**
 * Generate a source citation from a source locator.
 */
export function generateCitation(locator: SourceLocator): SourceCitation {
  const sourceNames: Record<string, string> = {
    rxnorm: "RxNorm (NLM)",
    dailymed: "DailyMed (NLM)",
    openfda: "openFDA (FDA)",
    cdsco: "CDSCO (India)",
  };

  return {
    sourceOrganization: sourceNames[locator.sourceName] || locator.sourceName,
    sourceDocumentName: locator.sectionTitle,
    sourceIdentifier: locator.sourceRecordId,
    sourceUrl: locator.sourceUrl,
    effectiveDate: locator.effectiveDate,
    retrievedAt: locator.retrievedAt,
    sectionTitle: locator.sectionTitle,
  };
}

/**
 * Generate citations for all label sections of a medicine.
 */
export function generateSectionCitations(
  sections: MedicineLabelSection[]
): SourceCitation[] {
  const seen = new Set<string>();
  const citations: SourceCitation[] = [];

  for (const section of sections) {
    const citation = generateCitation(section.sourceLocator);
    const key = `${citation.sourceOrganization}:${citation.sourceIdentifier}:${citation.sectionTitle}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push(citation);
    }
  }

  return citations;
}

// ─── Citation Validation ──────────────────────────────────────────────────

/**
 * Validate that a citation references real, accessible sources.
 * Returns true if the citation appears valid.
 */
export function validateCitation(citation: SourceCitation): boolean {
  // Must have a valid URL
  try {
    new URL(citation.sourceUrl);
  } catch {
    return false;
  }

  // Must reference known sources
  const validOrganizations = [
    "RxNorm (NLM)",
    "DailyMed (NLM)",
    "openFDA (FDA)",
    "CDSCO (India)",
  ];
  if (!validOrganizations.includes(citation.sourceOrganization)) {
    return false;
  }

  // Must have a source identifier
  if (!citation.sourceIdentifier || citation.sourceIdentifier.length === 0) {
    return false;
  }

  // Must have a retrieval timestamp
  if (!citation.retrievedAt) {
    return false;
  }

  return true;
}

/**
 * Validate that AI-cited source sections actually exist.
 * Returns the list of invalid citations.
 */
export function validateAICitations(
  citedSectionKeys: string[],
  availableSections: Array<{ sectionKey: string }>
): { valid: string[]; invalid: string[] } {
  const availableKeys = new Set(availableSections.map((s) => s.sectionKey));
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const key of citedSectionKeys) {
    if (availableKeys.has(key)) {
      valid.push(key);
    } else {
      invalid.push(key);
    }
  }

  return { valid, invalid };
}

/**
 * Generate a formatted citation string for display.
 */
export function formatCitation(citation: SourceCitation): string {
  const parts = [
    `Source: ${citation.sourceOrganization}`,
    `Section: ${citation.sectionTitle}`,
    `ID: ${citation.sourceIdentifier}`,
  ];

  if (citation.effectiveDate) {
    parts.push(`Effective: ${citation.effectiveDate}`);
  }

  parts.push(`Retrieved: ${new Date(citation.retrievedAt).toLocaleDateString("en-IN")}`);

  return parts.join(" | ");
}

/**
 * Create a source locator from a source record.
 */
export function createSourceLocator(
  record: MedicineSourceRecord,
  sectionTitle: string
): SourceLocator {
  return {
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
    sourceRecordId: record.sourceRecordId,
    sectionTitle,
    effectiveDate: record.effectiveDate,
    retrievedAt: record.retrievedAt,
  };
}
