import { z } from "zod";

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
  toolName: z.enum([
    "document.ingest",
    "document.extract",
    "timeline.build",
    "clarification.request",
    "brief.generate",
    "reminder.create",
  ]),
  toolInput: z.record(z.unknown()),
  reasoning: z.string(),
});

export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;
export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;
export type AgentNextAction = z.infer<typeof AgentNextActionSchema>;

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
