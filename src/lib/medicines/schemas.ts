/**
 * Medicine Zod schemas — validated contracts for source adapters, AI output, and API responses.
 */

import { z } from "zod";
import { LABEL_SECTION_KEYS } from "./types";

// ─── RxNorm Schemas ───────────────────────────────────────────────────────

export const RxNormConceptSchema = z.object({
  rxcui: z.string(),
  name: z.string(),
  tty: z.string(), // Term Type: IN, BN, SCN, SCD, etc.
  source: z.string().optional(),
});

export const RxNormPropertySchema = z.object({
  rxcui: z.string(),
  propName: z.string(),
  propValue: z.string(),
});

// ─── DailyMed Schemas ─────────────────────────────────────────────────────

export const DailyMedSetIdSchema = z.object({
  setid: z.string(),
  name: z.string(),
  status: z.string().optional(),
  version: z.string().optional(),
});

export const DailyMedSectionSchema = z.object({
  title: z.string(),
  text: z.string(),
  code: z.string().optional(),
});

// ─── openFDA Schemas ──────────────────────────────────────────────────────

export const OpenFDALabelSchema = z.object({
  id: z.string(),
  active_ingredients: z.array(z.object({
    name: z.string(),
    strength: z.string(),
  })).optional(),
  dosage_and_administration: z.string().optional(),
  indications_and_usage: z.string().optional(),
  contraindications: z.string().optional(),
  warnings: z.string().optional(),
  adverse_reactions: z.string().optional(),
  storage_and_handling: z.string().optional(),
  description: z.string().optional(),
  drug_interactions: z.string().optional(),
  pediatric_use: z.string().optional(),
  geriatric_use: z.string().optional(),
  pregnancy: z.string().optional(),
  lactation: z.string().optional(),
  overdosage: z.string().optional(),
  spl_product_data_elements: z.string().optional(),
  manufacturer_name: z.string().optional(),
  substance_name: z.string().optional(),
});

// ─── Medicine Search Input ────────────────────────────────────────────────

export const MedicineSearchInputSchema = z.object({
  query: z.string()
    .min(1, "Search query is required")
    .max(200, "Search query is too long")
    .trim(),
});

// ─── Medicine Identity Schema ─────────────────────────────────────────────

export const MedicineIdentitySchema = z.object({
  rxcui: z.string().nullable(),
  normalizedName: z.string().min(1),
  displayName: z.string().min(1),
  entityType: z.enum(["ingredient", "brand", "clinical_drug", "clinical_drug_form", "generic_pack"]),
  genericName: z.string().nullable(),
  brandName: z.string().nullable(),
  strength: z.string().nullable(),
  doseForm: z.string().nullable(),
  route: z.string().nullable(),
  activeIngredients: z.array(z.object({
    name: z.string(),
    strength: z.string().nullable(),
    unit: z.string().nullable(),
  })),
  sourceStatus: z.enum(["verified", "partial", "unverified"]),
});

// ─── Label Section Schema ─────────────────────────────────────────────────

export const LabelSectionSchema = z.object({
  sectionKey: z.enum(LABEL_SECTION_KEYS as unknown as [string, ...string[]]),
  sectionTitle: z.string(),
  originalText: z.string(),
  plainLanguageText: z.string().nullable(),
  aiGenerated: z.boolean(),
  sourceLocator: z.object({
    sourceName: z.string(),
    sourceUrl: z.string(),
    sourceRecordId: z.string(),
    sectionTitle: z.string(),
    effectiveDate: z.string().nullable(),
    retrievedAt: z.string(),
  }),
});

// ─── Citation Schema ──────────────────────────────────────────────────────

export const SourceCitationSchema = z.object({
  sourceOrganization: z.string(),
  sourceDocumentName: z.string(),
  sourceIdentifier: z.string(),
  sourceUrl: z.string().url(),
  effectiveDate: z.string().nullable(),
  retrievedAt: z.string(),
  sectionTitle: z.string(),
});

// ─── AI Explanation Schema ────────────────────────────────────────────────

export const AIExplanationSchema = z.object({
  summary: z.object({
    text: z.string().min(1),
    sourceSectionKeys: z.array(z.string()),
  }),
  sections: z.array(z.object({
    key: z.enum(LABEL_SECTION_KEYS as unknown as [string, ...string[]]),
    plainLanguageText: z.string().min(1),
    sourceSectionKeys: z.array(z.string()),
    warnings: z.array(z.string()),
  })),
  limitations: z.array(z.string()),
});

// ─── Resolve Prescription Input ───────────────────────────────────────────

export const ResolvePrescriptionInputSchema = z.object({
  prescriptionItemId: z.string().uuid("Invalid prescription item ID"),
});

// ─── Link Medicine Input ──────────────────────────────────────────────────

export const LinkMedicineInputSchema = z.object({
  medicineEntityId: z.string().uuid("Invalid medicine entity ID"),
  prescriptionItemId: z.string().uuid().nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  relationshipType: z.enum(["prescribed", "mentioned", "previously_prescribed", "user_saved"]),
});

// ─── Validation Helpers ───────────────────────────────────────────────────

export function validateSearchQuery(query: string): { valid: boolean; error?: string } {
  const trimmed = query.trim();
  if (trimmed.length === 0) return { valid: false, error: "MEDICINE_QUERY_REQUIRED" };
  if (trimmed.length > 200) return { valid: false, error: "Query is too long" };
  return { valid: true };
}

export function validateSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedHosts = [
      "rxnav.nlm.nih.gov",
      "dailymed.nlm.nih.gov",
      "api.fda.gov",
      "cdsco.gov.in",
    ];
    return allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith("." + host));
  } catch {
    return false;
  }
}
