/**
 * Ask Healthfolio Orchestrator
 *
 * Routes a user question through intent classification, then dispatches
 * to the appropriate handler (product help, personal records, general
 * health education, safety boundary, etc.).
 */

import { classifyIntent, type IntentResult } from "./intent-router";
import { answerProductHelp } from "./capabilities";
import {
  buildProductHelpResponse,
  buildPersonalRecordResponse,
  buildClarificationResponse,
  buildSafetyBoundaryResponse,
  buildNoRecordsResponse,
  buildErrorResponse,
  type AskResponse,
  type PersonalRecordSource,
} from "./response-contract";
import { checkSafetyBoundary } from "@/lib/ai/safety";

export interface AskContext {
  userId: string;
  requestId: string;
  question: string;
  extractions: Array<{
    id: string;
    document_id: string;
    page_number: number;
    field_type: string;
    raw_value: string;
    confidence: number;
    verification_status: string;
    evidence_locator: string | null;
  }>;
  documents: Array<{
    id: string;
    original_name: string;
    document_type: string;
  }>;
}

/**
 * Process a user question through the full Ask Healthfolio pipeline.
 */
export async function processQuestion(
  ctx: AskContext
): Promise<AskResponse> {
  const { userId, requestId, question, extractions, documents } = ctx;

  // 1. Safety check — block before any other processing
  const safety = checkSafetyBoundary(question);
  if (!safety.allowed) {
    return buildSafetyBoundaryResponse(
      requestId,
      safety.violationType || "unknown",
      safety.response
    );
  }

  // 2. Classify intent
  const intent = await classifyIntent(question);

  // 3. Route based on intent
  switch (intent.intent) {
    case "PRODUCT_HELP":
      return handleProductHelp(requestId, question);

    case "EMERGENCY_OR_URGENT":
      return buildSafetyBoundaryResponse(requestId, "emergency");

    case "PERSONALIZED_MEDICAL_ADVICE":
      return buildSafetyBoundaryResponse(requestId, "advice");

    case "GENERAL_HEALTH_EDUCATION":
      if (intent.requiresClarification) {
        return buildClarificationResponse(requestId, question, [
          "General health information",
          "Related to my health records",
        ]);
      }
      return handleGeneralEducation(requestId, question);

    case "PERSONAL_RECORD_QUESTION":
      return handlePersonalRecordQuestion(
        requestId,
        question,
        extractions,
        documents
      );

    case "UNKNOWN":
    default:
      // Default to personal record question (user is in a medical app)
      return handlePersonalRecordQuestion(
        requestId,
        question,
        extractions,
        documents
      );
  }
}

function handleProductHelp(
  requestId: string,
  question: string
): AskResponse {
  const result = answerProductHelp(question);

  if (result) {
    return buildProductHelpResponse(
      requestId,
      result.answer,
      result.matchedCapabilities
    );
  }

  // Generic product help fallback
  return buildProductHelpResponse(
    requestId,
    "Healthfolio is a medical record organizer and consultation preparation assistant. " +
      "You can upload medical documents (PDF, PNG, JPEG, WEBP), have them processed with OCR and AI " +
      "classification, review extracted information, build a verified timeline, and prepare for " +
      "appointments with consultation briefs, checklists, and calendar exports.\n\n" +
      "Try asking:\n" +
      "• How do I upload a report?\n" +
      "• What file formats are supported?\n" +
      "• How does OCR work?\n" +
      "• Can I export my consultation brief?",
    ["upload", "privacy"]
  );
}

function handleGeneralEducation(
  requestId: string,
  question: string
): AskResponse {
  // Without a real reference retrieval system, we must not fabricate citations
  // Instead, we provide a safe educational boundary
  return {
    requestId,
    intent: "GENERAL_HEALTH_EDUCATION",
    answer:
      "For general health information, I recommend consulting official sources:\n\n" +
      "• **WHO (who.int)** — Global health guidance\n" +
      "• **ICMR-NIN (nin.res.in)** — Indian dietary guidelines\n" +
      "• **NHS (nhs.uk)** — UK health information\n" +
      "• **MedlinePlus (medlineplus.gov)** — US consumer health information\n\n" +
      "If your question is related to information in your uploaded records, " +
      "I can help you prepare questions for your healthcare provider based on your documents.\n\n" +
      "Healthfolio does not provide personalized health advice. Please consult " +
      "a qualified healthcare professional for guidance specific to your situation.",
    answerType: "general_education",
    sources: [],
    requiresClarification: false,
    clarificationOptions: [],
    safetyNotice:
      "Healthfolio organizes and explains your records. It does not provide diagnosis or replace a qualified healthcare professional.",
  };
}

async function handlePersonalRecordQuestion(
  requestId: string,
  question: string,
  extractions: AskContext["extractions"],
  documents: AskContext["documents"]
): Promise<AskResponse> {
  // Build context from extractions
  if (extractions.length === 0) {
    return buildNoRecordsResponse(requestId, question);
  }

  const docMap = new Map(documents.map((d) => [d.id, d]));

  const contextChunks = extractions
    .filter((e) => e.raw_value && e.raw_value.length > 0)
    .map((e) => {
      const doc = docMap.get(e.document_id);
      return {
        documentName: doc?.original_name || "Unknown document",
        pageNumber: e.page_number,
        text: `[${e.field_type}] ${e.raw_value}`,
        verificationStatus: e.verification_status,
      };
    });

  if (contextChunks.length === 0) {
    return buildNoRecordsResponse(requestId, question);
  }

  // Call the Ollama provider for personal-record questions
  return callAIForPersonalRecords(
    requestId,
    question,
    contextChunks,
    extractions,
    docMap
  );
}

async function callAIForPersonalRecords(
  requestId: string,
  question: string,
  contextChunks: Array<{
    documentName: string;
    pageNumber: number;
    text: string;
    verificationStatus: string;
  }>,
  extractions: AskContext["extractions"],
  docMap: Map<string, { id: string; original_name: string; document_type: string }>
): Promise<AskResponse> {
  try {
    const { getAIProvider } = await import("@/lib/ai/provider");
    const provider = getAIProvider();

    if (!provider.isConfigured()) {
      return buildErrorResponse(
        requestId,
        "AI is not configured. Set AI_PROVIDER and OLLAMA_BASE_URL in your .env.local file."
      );
    }

    const ollamaProvider = provider as unknown as {
      answerQuestion: (
        question: string,
        contextChunks: Array<{
          documentName: string;
          pageNumber: number;
          text: string;
          verificationStatus: string;
        }>
      ) => Promise<{
        answer: string;
        sources: Array<{
          documentName: string;
          pageNumber: number;
          excerpt: string;
          verificationStatus: string;
        }>;
        isAiGenerated: boolean;
        suggestions: string[];
      }>;
    };

    if (typeof ollamaProvider.answerQuestion !== "function") {
      return buildErrorResponse(
        requestId,
        "Your AI provider does not support question answering. Please configure Ollama."
      );
    }

    const result = await ollamaProvider.answerQuestion(
      question,
      contextChunks
    );

    // Map sources to the response contract format
    const sources: PersonalRecordSource[] = (result.sources || []).map((src) => {
      // Find the matching extraction to get the document_id
      const matchingExtraction = extractions.find((e) => {
        const doc = docMap.get(e.document_id);
        return (
          doc?.original_name === src.documentName &&
          e.page_number === src.pageNumber
        );
      });

      return {
        documentId: matchingExtraction?.document_id || "00000000-0000-0000-0000-000000000000",
        documentName: src.documentName,
        pageNumber: src.pageNumber,
        evidenceText: src.excerpt,
        verificationStatus:
          src.verificationStatus as PersonalRecordSource["verificationStatus"],
      };
    });

    return buildPersonalRecordResponse(
      requestId,
      result.answer,
      sources
    );
  } catch {
    return buildErrorResponse(
      requestId,
      "I could not process your question right now. Please try again."
    );
  }
}
