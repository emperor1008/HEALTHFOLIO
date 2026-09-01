/**
 * Ask Healthfolio Response Contract
 *
 * Every response from the assistant must conform to this schema.
 * Prevents fabricated citations, inconsistent response shapes, and
 * ensures the UI can render any valid response.
 */

import { z } from "zod";

// ─── Answer Types ─────────────────────────────────────────────────────────

export const AnswerType = z.enum([
  "product_help",
  "personal_record",
  "general_education",
  "clarification",
  "safety_boundary",
  "emergency",
  "error",
]);

export type AnswerTypeValue = z.infer<typeof AnswerType>;

// ─── Source Schemas ────────────────────────────────────────────────────────

export const PersonalRecordSourceSchema = z.object({
  documentId: z.string().uuid(),
  documentName: z.string().min(1),
  pageNumber: z.number().int().positive(),
  evidenceText: z.string().min(1),
  verificationStatus: z.enum([
    "pending_review",
    "system_verified",
    "user_confirmed",
    "user_corrected",
    "rejected",
  ]),
});

export type PersonalRecordSource = z.infer<typeof PersonalRecordSourceSchema>;

export const GeneralReferenceSourceSchema = z.object({
  organization: z.string().min(1),
  title: z.string().min(1),
  officialUrl: z.string().url(),
  publicationDate: z.string(),
  retrievedAt: z.string(),
});

export type GeneralReferenceSource = z.infer<typeof GeneralReferenceSourceSchema>;

export const ProductHelpSourceSchema = z.object({
  capabilityId: z.string(),
  category: z.string(),
});

// ─── Full Response Schema ─────────────────────────────────────────────────

export const AskResponseSchema = z.object({
  requestId: z.string().min(1),
  intent: z.enum([
    "PRODUCT_HELP",
    "PERSONAL_RECORD_QUESTION",
    "GENERAL_HEALTH_EDUCATION",
    "PERSONALIZED_MEDICAL_ADVICE",
    "EMERGENCY_OR_URGENT",
    "MEDICINE_LOOKUP",
    "TEST_LOOKUP",
    "REPORT_EXPLANATION",
    "HEALTH_TREND_QUESTION",
    "MEDICATION_ROUTINE_QUESTION",
    "UNKNOWN",
  ]),
  answer: z.string().min(1),
  answerType: AnswerType,
  sources: z.array(
    z.union([
      PersonalRecordSourceSchema,
      GeneralReferenceSourceSchema,
      ProductHelpSourceSchema,
    ])
  ),
  requiresClarification: z.boolean(),
  clarificationOptions: z.array(z.string()),
  safetyNotice: z.string().nullable(),
});

export type AskResponse = z.infer<typeof AskResponseSchema>;

// ─── Response Builders ────────────────────────────────────────────────────

export function buildProductHelpResponse(
  requestId: string,
  answer: string,
  capabilityIds: string[]
): AskResponse {
  return {
    requestId,
    intent: "PRODUCT_HELP",
    answer,
    answerType: "product_help",
    sources: capabilityIds.map((id) => ({
      capabilityId: id,
      category: "feature",
    })),
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice: null,
  };
}

export function buildPersonalRecordResponse(
  requestId: string,
  answer: string,
  sources: PersonalRecordSource[]
): AskResponse {
  return {
    requestId,
    intent: "PERSONAL_RECORD_QUESTION",
    answer,
    answerType: "personal_record",
    sources,
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice:
      "Healthfolio organizes and explains your records. It does not provide diagnosis or replace a qualified healthcare professional.",
  };
}

export function buildClarificationResponse(
  requestId: string,
  question: string,
  options: string[]
): AskResponse {
  return {
    requestId,
    intent: "GENERAL_HEALTH_EDUCATION",
    answer:
      "Are you looking for general health information, or guidance connected to a condition, medicine, or report in your records?",
    answerType: "clarification",
    sources: [],
    requiresClarification: true,
    clarificationOptions: options,
    safetyNotice:
      "Healthfolio organizes and explains your records. It does not provide diagnosis or replace a qualified healthcare professional.",
  };
}

export function buildSafetyBoundaryResponse(
  requestId: string,
  violationType: string,
  customMessage?: string
): AskResponse {
  let answer: string;

  if (violationType === "emergency") {
    answer =
      "This may require urgent medical attention. Contact local emergency services or go to the nearest emergency department.\n\n" +
      "Emergency number (India): 112\n\n" +
      "Healthfolio cannot assess emergencies or provide urgent medical guidance.";
  } else {
    answer =
      customMessage ||
      "Healthfolio organizes medical information and helps you prepare for consultations. " +
        "It does not diagnose conditions, recommend treatment, or change medication.\n\n" +
        "I can help you:\n" +
        "• Find information written in your uploaded documents\n" +
        "• Prepare questions for your doctor or pharmacist\n" +
        "• Organize your medical records into a timeline\n" +
        "• Create a consultation brief";
  }

  return {
    requestId,
    intent: "EMERGENCY_OR_URGENT",
    answer,
    answerType: violationType === "emergency" ? "emergency" : "safety_boundary",
    sources: [],
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice: null,
  };
}

export function buildNoRecordsResponse(
  requestId: string,
  question: string
): AskResponse {
  return {
    requestId,
    intent: "PERSONAL_RECORD_QUESTION",
    answer:
      "I could not find that information in your uploaded records. " +
      "This question requires information from your medical documents.\n\n" +
      "To get an answer:\n" +
      "• Go to Records and upload your medical documents\n" +
      "• Wait for processing and review extracted information\n" +
      "• Then ask this question again",
    answerType: "personal_record",
    sources: [],
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice:
      "Healthfolio organizes and explains your records. It does not provide diagnosis or replace a qualified healthcare professional.",
  };
}

export function buildMedicineLookupResponse(
  requestId: string,
  answer: string,
  correctionInfo?: { original: string; corrected: string; confidence: number }
): AskResponse {
  return {
    requestId,
    intent: "MEDICINE_LOOKUP",
    answer,
    answerType: "general_education",
    sources: [],
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice:
      "Healthfolio retrieves medicine information from official sources (RxNorm, DailyMed, openFDA). This is not a substitute for professional medical advice.",
  };
}

export function buildTestLookupResponse(
  requestId: string,
  answer: string
): AskResponse {
  return {
    requestId,
    intent: "TEST_LOOKUP",
    answer,
    answerType: "general_education",
    sources: [],
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice:
      "Test explanations are general information. Reference ranges vary by laboratory. Consult your healthcare provider for interpretation.",
  };
}

export function buildErrorResponse(
  requestId: string,
  message: string
): AskResponse {
  return {
    requestId,
    intent: "UNKNOWN",
    answer: message,
    answerType: "error",
    sources: [],
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice: null,
  };
}
