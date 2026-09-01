/**
 * Medicine data types — shared between API, UI, source adapters, and service layer.
 */

// ─── Medicine Identity ────────────────────────────────────────────────────

export interface MedicineIdentity {
  id: string;
  rxcui: string | null;
  normalizedName: string;
  displayName: string;
  entityType: "ingredient" | "brand" | "clinical_drug" | "clinical_drug_form" | "generic_pack";
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  doseForm: string | null;
  route: string | null;
  activeIngredients: ActiveIngredient[];
  sourceStatus: "verified" | "partial" | "unverified";
  createdAt: string;
  updatedAt: string;
}

export interface ActiveIngredient {
  name: string;
  strength: string | null;
  unit: string | null;
}

// ─── Source Records ───────────────────────────────────────────────────────

export interface MedicineSourceRecord {
  id: string;
  medicineEntityId: string;
  sourceName: "rxnorm" | "dailymed" | "openfda" | "cdsco";
  sourceRecordId: string;
  sourceUrl: string;
  sourceVersion: string | null;
  effectiveDate: string | null;
  retrievedAt: string;
  expiresAt: string | null;
  rawResponseHash: string;
  validatedPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Label Sections ───────────────────────────────────────────────────────

export type LabelSectionKey =
  | "indications_and_usage"
  | "dosage_and_administration"
  | "dosage_forms_and_strengths"
  | "contraindications"
  | "warnings_and_precautions"
  | "adverse_reactions"
  | "drug_interactions"
  | "pediatric_use"
  | "geriatric_use"
  | "pregnancy"
  | "lactation"
  | "renal_impairment"
  | "hepatic_impairment"
  | "overdosage"
  | "description"
  | "active_ingredients"
  | "inactive_ingredients"
  | "storage_and_handling"
  | "patient_information";

export const LABEL_SECTION_KEYS: LabelSectionKey[] = [
  "indications_and_usage",
  "dosage_and_administration",
  "dosage_forms_and_strengths",
  "contraindications",
  "warnings_and_precautions",
  "adverse_reactions",
  "drug_interactions",
  "pediatric_use",
  "geriatric_use",
  "pregnancy",
  "lactation",
  "renal_impairment",
  "hepatic_impairment",
  "overdosage",
  "description",
  "active_ingredients",
  "inactive_ingredients",
  "storage_and_handling",
  "patient_information",
];

export const LABEL_SECTION_LABELS: Record<LabelSectionKey, string> = {
  indications_and_usage: "Indications and Usage",
  dosage_and_administration: "Dosage and Administration",
  dosage_forms_and_strengths: "Dosage Forms and Strengths",
  contraindications: "Contraindications",
  warnings_and_precautions: "Warnings and Precautions",
  adverse_reactions: "Adverse Reactions",
  drug_interactions: "Drug Interactions",
  pediatric_use: "Pediatric Use",
  geriatric_use: "Geriatric Use",
  pregnancy: "Pregnancy",
  lactation: "Lactation",
  renal_impairment: "Renal Impairment",
  hepatic_impairment: "Hepatic Impairment",
  overdosage: "Overdosage",
  description: "Description",
  active_ingredients: "Active Ingredients",
  inactive_ingredients: "Inactive Ingredients",
  storage_and_handling: "Storage and Handling",
  patient_information: "Patient Information",
};

export interface MedicineLabelSection {
  id: string;
  sourceRecordId: string;
  sectionKey: LabelSectionKey;
  sectionTitle: string;
  originalText: string;
  plainLanguageText: string | null;
  aiGenerated: boolean;
  sourceLocator: SourceLocator;
  createdAt: string;
  updatedAt: string;
}

export interface SourceLocator {
  sourceName: string;
  sourceUrl: string;
  sourceRecordId: string;
  sectionTitle: string;
  effectiveDate: string | null;
  retrievedAt: string;
}

// ─── User Medicine Links ──────────────────────────────────────────────────

export interface UserMedicineLink {
  id: string;
  userId: string;
  medicineEntityId: string;
  prescriptionItemId: string | null;
  documentId: string | null;
  relationshipType: "prescribed" | "mentioned" | "previously_prescribed" | "user_saved";
  verificationStatus: "pending" | "confirmed" | "rejected";
  evidenceLocator: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Search Results ───────────────────────────────────────────────────────

export interface MedicineSearchResult {
  rxcui: string;
  name: string;
  entityType: string;
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  doseForm: string | null;
  route: string | null;
  source: "rxnorm" | "dailymed" | "openfda";
}

// ─── Medicine Detail ──────────────────────────────────────────────────────

export interface MedicineDetail {
  identity: MedicineIdentity;
  labelSections: MedicineLabelSection[];
  sourceRecords: MedicineSourceRecord[];
  userLinks: UserMedicineLink[];
  citations: SourceCitation[];
  coverageWarnings: string[];
}

// ─── Source Citations ─────────────────────────────────────────────────────

export interface SourceCitation {
  sourceOrganization: string;
  sourceDocumentName: string;
  sourceIdentifier: string;
  sourceUrl: string;
  effectiveDate: string | null;
  retrievedAt: string;
  sectionTitle: string;
}

// ─── Prescription Dosage vs Label Dosage ──────────────────────────────────

export interface PrescriptionDosage {
  prescriptionItemId: string;
  rawMedicineText: string;
  medicineName: string | null;
  strength: string | null;
  doseText: string | null;
  route: string | null;
  frequencyText: string | null;
  durationText: string | null;
  instructionText: string | null;
  documentName: string | null;
  pageNumber: number | null;
  evidenceText: string | null;
  verificationStatus: string;
}

export interface LabelDosage {
  sectionKey: LabelSectionKey;
  originalText: string;
  plainLanguageText: string | null;
  sourceLocator: SourceLocator;
}

// ─── AI Explanation ───────────────────────────────────────────────────────

export interface AIExplanation {
  summary: {
    text: string;
    sourceSectionKeys: string[];
  };
  sections: Array<{
    key: LabelSectionKey;
    plainLanguageText: string;
    sourceSectionKeys: string[];
    warnings: string[];
  }>;
  limitations: string[];
}
