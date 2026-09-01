/**
 * Canonical document taxonomy — single source of truth.
 * Import from here in schemas, UI, APIs, tools, and tests.
 * Do NOT duplicate this list independently.
 */

export const DOCUMENT_CATEGORIES = [
  "lab_report",
  "prescription",
  "imaging_report",
  "discharge_summary",
  "vaccination_record",
  "procedure_record",
  "appointment_record",
  "referral",
  "medical_certificate",
  "insurance_document",
  "clinical_note",
  "medication_invoice",
  "other",
  "unknown",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Valid category values as a Set for O(1) lookup */
export const VALID_CATEGORIES = new Set<string>(DOCUMENT_CATEGORIES);

/** Readable labels for UI display */
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  lab_report: "Lab Report",
  prescription: "Prescription",
  imaging_report: "Imaging Report",
  discharge_summary: "Discharge Summary",
  vaccination_record: "Vaccination Record",
  procedure_record: "Procedure Record",
  appointment_record: "Appointment Record",
  referral: "Referral",
  medical_certificate: "Medical Certificate",
  insurance_document: "Insurance Document",
  clinical_note: "Clinical Note",
  medication_invoice: "Medication Invoice",
  other: "Other",
  unknown: "Unknown",
};

/** Short descriptions for UI tooltips */
export const CATEGORY_DESCRIPTIONS: Record<DocumentCategory, string> = {
  lab_report: "Blood tests, urine tests, and other laboratory results",
  prescription: "Medicine prescriptions and dosing instructions",
  imaging_report: "X-rays, CT scans, MRI, and ultrasound reports",
  discharge_summary: "Hospital discharge summaries and follow-up instructions",
  vaccination_record: "Vaccination certificates and immunization records",
  procedure_record: "Surgical or medical procedure documentation",
  appointment_record: "Appointment confirmations and visit records",
  referral: "Referrals to specialists or other healthcare providers",
  medical_certificate: "Medical certificates and fitness documents",
  insurance_document: "Health insurance and claims documentation",
  clinical_note: "Clinical notes and consultation records",
  medication_invoice: "Pharmacy bills and medication purchase records",
  other: "Other medical documents",
  unknown: "Category not yet determined",
};

/** Category icon emoji for UI */
export const CATEGORY_ICONS: Record<DocumentCategory, string> = {
  lab_report: "🧪",
  prescription: "💊",
  imaging_report: "📷",
  discharge_summary: "🏥",
  vaccination_record: "💉",
  procedure_record: "🩺",
  appointment_record: "📅",
  referral: "📋",
  medical_certificate: "📄",
  insurance_document: "🛡️",
  clinical_note: "📝",
  medication_invoice: "💰",
  other: "📎",
  unknown: "❓",
};

/**
 * Validate that a string is a known document category.
 */
export function isValidCategory(category: string): category is DocumentCategory {
  return VALID_CATEGORIES.has(category);
}

/**
 * Processing statuses — ordered pipeline stages
 */
export const PROCESSING_STATUSES = [
  "uploaded",
  "extracting",
  "classifying",
  "organizing",
  "review_required",
  "completed",
  "failed",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/**
 * Classification statuses — result of AI classification
 */
export const CLASSIFICATION_STATUSES = [
  "pending",
  "classified",
  "needs_review",
  "confirmed",
  "rejected",
  "failed",
] as const;

export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];

/**
 * Document date precision levels
 */
export const DATE_PRECISION_LEVELS = [
  "exact",
  "month",
  "year",
  "unknown",
] as const;

export type DatePrecision = (typeof DATE_PRECISION_LEVELS)[number];

/**
 * Relationship types between documents
 */
export const RELATIONSHIP_TYPES = [
  "prescription_for_visit",
  "report_for_visit",
  "follow_up_to",
  "discharge_related",
  "same_episode",
  "medicine_mentioned_in",
  "replaces",
  "duplicate_of",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  prescription_for_visit: "Prescription for visit",
  report_for_visit: "Report for visit",
  follow_up_to: "Follow-up to",
  discharge_related: "Related to discharge",
  same_episode: "Same episode",
  medicine_mentioned_in: "Medicine mentioned in",
  replaces: "Replaces",
  duplicate_of: "Duplicate of",
};

/**
 * Relationship statuses
 */
export const RELATIONSHIP_STATUSES = [
  "proposed",
  "confirmed",
  "rejected",
] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

/**
 * Classification confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Auto-classify with high confidence */
  HIGH: parseFloat(process.env.CLASSIFICATION_HIGH_THRESHOLD || "0.90"),
  /** Classify provisionally but require review */
  MEDIUM: parseFloat(process.env.CLASSIFICATION_MEDIUM_THRESHOLD || "0.70"),
  /** Too uncertain — mark unknown and require review */
  LOW: 0,
} as const;

/**
 * Determine the classification action based on confidence and evidence.
 */
export function classifyConfidence(
  confidence: number,
  hasEvidence: boolean,
  hasWarnings: boolean
): {
  classificationStatus: ClassificationStatus;
  requiresReview: boolean;
} {
  if (hasWarnings || !hasEvidence) {
    return { classificationStatus: "needs_review", requiresReview: true };
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return { classificationStatus: "classified", requiresReview: false };
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return { classificationStatus: "needs_review", requiresReview: true };
  }

  return { classificationStatus: "needs_review", requiresReview: true };
}

/**
 * Get the human-readable status label for processing.
 */
export function getProcessingStatusLabel(status: ProcessingStatus): string {
  const labels: Record<ProcessingStatus, string> = {
    uploaded: "Uploaded",
    extracting: "Extracting text...",
    classifying: "Classifying document...",
    organizing: "Organizing...",
    review_required: "Review required",
    completed: "Processed",
    failed: "Processing failed",
  };
  return labels[status];
}

/**
 * Get the human-readable status label for classification.
 */
export function getClassificationStatusLabel(status: ClassificationStatus): string {
  const labels: Record<ClassificationStatus, string> = {
    pending: "Pending",
    classified: "Classified",
    needs_review: "Needs review",
    confirmed: "Confirmed",
    rejected: "Rejected",
    failed: "Failed",
  };
  return labels[status];
}
