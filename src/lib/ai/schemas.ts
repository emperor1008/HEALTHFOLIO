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
    "checklist.generate",
    "reminder.create",
    "calendar.export_ics",
    "pdf.export",
  ]),
  toolInput: z.record(z.unknown()),
  reasoning: z.string(),
});

export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;
export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;
export type AgentNextAction = z.infer<typeof AgentNextActionSchema>;

// Safety check schema
export const MedicalSafetyCheckSchema = z.object({
  isDiagnosisRequest: z.boolean(),
  isTreatmentRequest: z.boolean(),
  isMedicationChangeRequest: z.boolean(),
  isEmergencyRequest: z.boolean(),
});

// Timeline event schema
export const TimelineEventSchema = z.object({
  eventDate: z.string().nullable(),
  eventType: z.enum([
    "consultation",
    "test",
    "report",
    "prescription",
    "discharge",
    "follow_up",
    "other",
  ]),
  title: z.string().min(1),
  description: z.string(),
  sourceExtractionIds: z.array(z.string()),
  verificationStatus: z.enum(["verified", "disputed", "incomplete"]),
});

// Brief content schema
export const BriefContentSchema = z.object({
  appointmentDetails: z.object({
    date: z.string().nullable(),
    time: z.string().nullable(),
    timezone: z.string(),
    specialty: z.string().nullable(),
    clinicianName: z.string().nullable(),
    location: z.string().nullable(),
  }),
  goal: z.string(),
  verifiedEvents: z.array(
    z.object({
      date: z.string().nullable(),
      type: z.string(),
      title: z.string(),
      description: z.string(),
      sourceDocumentId: z.string(),
      sourceDocumentName: z.string(),
      pageNumber: z.number(),
    })
  ),
  documentsIncluded: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    })
  ),
  documentsMissing: z.array(z.string()),
  questionsToDiscuss: z.array(z.string()),
  preparationChecklist: z.array(z.string()),
  safetyDisclaimer: z.string(),
  generatedAt: z.string(),
});

export type BriefContent = z.infer<typeof BriefContentSchema>;
export type TimelineEventData = z.infer<typeof TimelineEventSchema>;
