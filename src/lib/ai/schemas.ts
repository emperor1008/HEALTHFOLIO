import { z } from "zod";
import { ALL_TOOL_NAMES } from "@/lib/tools/tool-names";

export const EvidenceLocatorSchema = z.object({
  documentId: z.string(),
  documentName: z.string(),
  pageNumber: z.number().int().positive(),
  sourceText: z.string().optional(),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

export const ExtractedFieldSchema = z.object({
  fieldType: z.enum([
    "date",
    "instruction",
    "test",
    "clinician",
    "event",
    "prescription",
    "diagnosis_text",
    "follow_up",
    "other",
  ]),
  rawValue: z.string().min(1),
  normalizedValue: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  evidenceLocator: EvidenceLocatorSchema,
});

export const DocumentClassificationSchema = z.object({
  documentType: z.enum([
    "prescription",
    "lab_report",
    "discharge_summary",
    "scan_report",
    "consultation",
    "doctor_instruction",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  dateFound: z.string().nullable(),
  summary: z.string(),
  fields: z.array(ExtractedFieldSchema),
});

export const AgentNextActionSchema = z.object({
  toolName: z.enum(ALL_TOOL_NAMES as unknown as [string, ...string[]]),
  toolInput: z.record(z.unknown()),
  reasoning: z.string(),
});

export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;
export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;
export type AgentNextAction = z.infer<typeof AgentNextActionSchema>;

// ─── Medical Measurement Extraction ────────────────────────────────────────

export const MedicalMeasurementExtractionSchema = z.object({
  originalTestName: z.string().min(1),
  normalizedTestName: z.string().min(1),
  valueNumeric: z.number().nullable(),
  valueText: z.string().nullable(),
  originalUnit: z.string().nullable(),
  referenceLow: z.number().nullable(),
  referenceHigh: z.number().nullable(),
  referenceText: z.string().nullable(),
  reportFlag: z.string().nullable(),
  specimenCollectedAt: z.string().nullable(),
  observedAt: z.string().nullable(),
  reportIssuedAt: z.string().nullable(),
  pageNumber: z.number().int().positive(),
  evidenceText: z.string().min(1),
  confidence: z.number().min(0).max(1),
}).refine(
  (data) => data.valueNumeric !== null || data.valueText !== null,
  { message: "At least one of valueNumeric or valueText must be present" }
);

export type MedicalMeasurementExtraction = z.infer<typeof MedicalMeasurementExtractionSchema>;

// Correction schema — validated before submission
export const MeasurementCorrectionSchema = z.object({
  decision: z.enum(["verified", "corrected", "rejected"]),
  correctionReason: z.string().min(1, "A reason for the correction is required").optional(),
  correctedValueNumeric: z.number().finite().nullable().optional(),
  correctedValueText: z.string().nullable().optional(),
  correctedReferenceLow: z.number().finite().nullable().optional(),
  correctedReferenceHigh: z.number().finite().nullable().optional(),
  correctedReferenceText: z.string().nullable().optional(),
  correctedReportFlag: z.string().nullable().optional(),
}).refine(
  (data) => {
    if (data.decision === "corrected") {
      // Must have a reason
      if (!data.correctionReason) return false;
      // Must have at least one corrected field
      return (
        data.correctedValueNumeric !== null && data.correctedValueNumeric !== undefined ||
        data.correctedValueText !== null && data.correctedValueText !== undefined ||
        data.correctedReferenceLow !== null && data.correctedReferenceLow !== undefined ||
        data.correctedReferenceHigh !== null && data.correctedReferenceHigh !== undefined ||
        data.correctedReferenceText !== null && data.correctedReferenceText !== undefined ||
        data.correctedReportFlag !== null && data.correctedReportFlag !== undefined
      );
    }
    return true;
  },
  { message: "Corrections require a reason and at least one corrected field" }
);

export type MeasurementCorrection = z.infer<typeof MeasurementCorrectionSchema>;

// Brief content type (shape matches what generateBrief produces)
export interface BriefContent {
  appointmentDetails: {
    date: string | null;
    time: string | null;
    timezone: string;
    specialty: string | null;
    clinicianName: string | null;
    location: string | null;
  };
  goal: string;
  verifiedEvents: Array<{
    date: string | null;
    type: string;
    title: string;
    description: string;
    sourceDocumentId: string;
    sourceDocumentName: string;
    pageNumber: number;
  }>;
  documentsIncluded: Array<{ name: string; type: string }>;
  documentsMissing: string[];
  questionsToDiscuss: string[];
  preparationChecklist: string[];
  safetyDisclaimer: string;
  generatedAt: string;
}
