/**
 * Ask Healthfolio Orchestrator
 *
 * Routes a user question through:
 * 1. Query normalization (typos, abbreviations, entity extraction)
 * 2. Safety boundary check
 * 3. Intent classification
 * 4. Entity-aware dispatch (medicine/test matching, personal records, product help)
 * 5. AI-powered answer generation for personal records
 * 6. Response with medical safety validation
 */

import { classifyIntent } from "./intent-router";
import { answerProductHelp } from "./capabilities";
import {
  buildProductHelpResponse,
  buildPersonalRecordResponse,
  buildClarificationResponse,
  buildSafetyBoundaryResponse,
  buildNoRecordsResponse,
  buildErrorResponse,
  buildMedicineLookupResponse,
  buildTestLookupResponse,
  type AskResponse,
  type PersonalRecordSource,
} from "./response-contract";
import { checkSafetyBoundary } from "@/lib/ai/safety";
import { normalizeQuery } from "./normalizer";
import { matchMedicineName, getCorrectionLabel } from "./medicine-matcher";
import { matchTestName, getTestIdentity } from "./test-matcher";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskContext {
  userId: string;
  requestId: string;
  question: string;
  conversationHistory?: ConversationMessage[];
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
export async function processQuestion(ctx: AskContext): Promise<AskResponse> {
  const {
    requestId,
    question,
    conversationHistory,
    extractions,
    documents,
  } = ctx;

  // 0. Normalize the query
  const normalized = normalizeQuery(question);

  // Resolve follow-up references using conversation memory
  let resolvedQuestion = question;
  if (conversationHistory && conversationHistory.length > 0) {
    resolvedQuestion = resolveFollowUp(question, conversationHistory);
  }

  // 1. Safety check — block before any other processing
  const safety = checkSafetyBoundary(resolvedQuestion);
  if (!safety.allowed) {
    return buildSafetyBoundaryResponse(
      requestId,
      safety.violationType || "unknown",
      safety.response
    );
  }

  // 2. Classify intent — use corrected text so misspelled medicine/test names are recognized
  const effectiveText = normalized.correctedText || resolvedQuestion;
  const intent = await classifyIntent(effectiveText);

  // 3. Route based on intent
  switch (intent.intent) {
    case "PRODUCT_HELP":
      return handleProductHelp(requestId, resolvedQuestion);

    case "EMERGENCY_OR_URGENT":
      return buildSafetyBoundaryResponse(requestId, "emergency");

    case "PERSONALIZED_MEDICAL_ADVICE":
      return buildSafetyBoundaryResponse(requestId, "advice");

    case "MEDICINE_LOOKUP":
      return handleMedicineLookup(requestId, resolvedQuestion, normalized);

    case "TEST_LOOKUP":
      return handleTestLookup(requestId, resolvedQuestion, normalized);

    case "REPORT_EXPLANATION":
    case "HEALTH_TREND_QUESTION":
    case "MEDICATION_ROUTINE_QUESTION":
    case "GENERAL_HEALTH_EDUCATION":
      if (intent.requiresClarification) {
        return buildClarificationResponse(requestId, resolvedQuestion, [
          "General health information",
          "Related to my health records",
        ]);
      }
      if (intent.requiresDocuments && extractions.length > 0) {
        return handlePersonalRecordQuestion(
          requestId,
          resolvedQuestion,
          extractions,
          documents
        );
      }
      return handleGeneralEducation(requestId, resolvedQuestion);

    case "PERSONAL_RECORD_QUESTION":
      return handlePersonalRecordQuestion(
        requestId,
        resolvedQuestion,
        extractions,
        documents
      );

    case "UNKNOWN":
    default:
      return handlePersonalRecordQuestion(
        requestId,
        resolvedQuestion,
        extractions,
        documents
      );
  }
}

// ─── Conversation Memory ───────────────────────────────────────────────────

/**
 * Resolve follow-up references like "What was mine?" or "Was it higher?"
 * by examining the conversation history context.
 */
function resolveFollowUp(
  question: string,
  history: ConversationMessage[]
): string {
  const lower = question.toLowerCase().trim();

  // Simple pronoun/reference resolution
  const followUpPatterns = [
    /^(what was mine|what about mine|what about my)$/i,
    /^(was it (higher|lower|better|worse|normal|ok|fine|abnormal))$/i,
    /^(how about mine|and mine|what about it)$/i,
    /^(tell me more|explain that|what does that mean)$/i,
    /^(and what about|what about|how about)$/i,
  ];

  for (const pattern of followUpPatterns) {
    if (pattern.test(lower)) {
      // Find the last assistant message that mentioned a test/medicine
      const lastAssistant = [...history]
        .reverse()
        .find((m) => m.role === "assistant");
      if (lastAssistant) {
        // Extract context from the last assistant message
        const contextWords = lastAssistant.content.substring(0, 200);
        return `${contextWords} ${question}`;
      }
    }
  }

  // "was it higher than before" — needs comparison context
  if (/was it (higher|lower|better|worse|improved|worsened)/i.test(lower)) {
    const lastAssistant = [...history]
      .reverse()
      .find((m) => m.role === "assistant");
    if (lastAssistant) {
      return `Compare results over time for: ${lastAssistant.content.substring(0, 150)}. ${question}`;
    }
  }

  return question;
}

// ─── Medicine Lookup ───────────────────────────────────────────────────────

function handleMedicineLookup(
  requestId: string,
  question: string,
  normalized: ReturnType<typeof normalizeQuery>
): AskResponse {
  // Try to match medicine names from the query
  const queryTerms = normalized.medicineNames.length > 0
    ? normalized.medicineNames
    : extractMedicineTerms(question);

  if (queryTerms.length === 0) {
    return {
      requestId,
      intent: "MEDICINE_LOOKUP",
      answer:
        "I could not identify a specific medicine in your question. " +
        "Please provide the medicine name as it appears on your prescription or package.\n\n" +
        "For example:\n" +
        "• \"What is metformin?\"\n" +
        "• \"Tell me about amlodipine tablets\"\n" +
        "• \"What does this medicine do?\"",
      answerType: "general_education",
      sources: [],
      requiresClarification: true,
      clarificationOptions: [],
      safetyNotice: null,
    };
  }

  const medicineName = queryTerms[0];
  const match = matchMedicineName(medicineName);

  if (match.matchMethod === "none") {
    return {
      requestId,
      intent: "MEDICINE_LOOKUP",
      answer:
        `I could not find reliable information about "${medicineName}" in authoritative medicine databases.\n\n` +
        "This could mean:\n" +
        "• The medicine name may be spelled differently\n" +
        "• It may be a brand name not yet in our database\n" +
        "• It may be a local or regional formulation\n\n" +
        "Please check the exact name on your prescription or package, or try the active ingredient name.",
      answerType: "general_education",
      sources: [],
      requiresClarification: false,
      clarificationOptions: [],
      safetyNotice:
        "Healthfolio retrieves medicine information from official sources. Always verify with your pharmacist or prescriber.",
    };
  }

  // Build the response with correction info
  let correctionBanner = "";
  if (match.wasCorrected && match.confidence >= 0.92) {
    const label = getCorrectionLabel(match.confidence);
    correctionBanner = `**${label.label} ${match.canonicalName}**\n\n`;
  } else if (match.wasCorrected && match.confidence >= 0.75) {
    correctionBanner =
      `Did you mean **${match.canonicalName}**? Showing information for that medicine.\n\n`;
  }

  const answer = correctionBanner +
    `**${match.canonicalName.charAt(0).toUpperCase() + match.canonicalName.slice(1)}**\n\n` +
    `Healthfolio retrieves medicine information from authoritative sources including RxNorm, DailyMed, and openFDA.\n\n` +
    `**Important:** This is general information about the medicine. It is not a recommendation. ` +
    `Always follow your prescriber's instructions for dosage, timing, and duration.\n\n` +
    `**To get information about YOUR prescription:**\n` +
    `Upload your prescription to Healthfolio, and I can help you understand the instructions written on it.`;

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

// ─── Test Lookup ───────────────────────────────────────────────────────────

function handleTestLookup(
  requestId: string,
  question: string,
  normalized: ReturnType<typeof normalizeQuery>
): AskResponse {
  const queryTerms = normalized.testNames.length > 0
    ? normalized.testNames
    : extractTestTerms(question);

  if (queryTerms.length === 0) {
    return {
      requestId,
      intent: "TEST_LOOKUP",
      answer:
        "I could not identify a specific medical test in your question. " +
        "Please mention the test name as it appears on your report.\n\n" +
        "For example:\n" +
        "• \"What is HbA1c?\"\n" +
        "• \"What does cholesterol measure?\"\n" +
        "• \"What is a TSH test?\"",
      answerType: "general_education",
      sources: [],
      requiresClarification: true,
      clarificationOptions: [],
      safetyNotice: null,
    };
  }

  const testName = queryTerms[0];
  const match = matchTestName(testName);
  const identity = match.matchMethod !== "none"
    ? getTestIdentity(match.canonicalName)
    : undefined;

  if (!identity) {
    return {
      requestId,
      intent: "TEST_LOOKUP",
      answer:
        `I could not find information about "${testName}" in our test database.\n\n` +
        "Please check the test name as it appears on your report, or try a common abbreviation.",
      answerType: "general_education",
      sources: [],
      requiresClarification: false,
      clarificationOptions: [],
      safetyNotice:
        "Test explanations are general information. Reference ranges vary by laboratory. Consult your healthcare provider for interpretation.",
    };
  }

  let correctionBanner = "";
  if (match.wasCorrected) {
    correctionBanner =
      `*Showing results for ${identity.canonical.replace(/_/g, " ")}*\n\n`;
  }

  const answer = correctionBanner +
    `**${identity.canonical.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}**\n\n` +
    `${identity.description}\n\n` +
    `**What this test measures:**\n` +
    `This is general educational information. Reference ranges vary by laboratory, age, sex, and other factors. ` +
    `Your report should include the reference range used by your laboratory.\n\n` +
    `**To see YOUR results:**\n` +
    `Upload your lab report to Healthfolio, and I can help you understand your specific values in context.`;

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

// ─── Product Help ──────────────────────────────────────────────────────────

function handleProductHelp(requestId: string, question: string): AskResponse {
  const result = answerProductHelp(question);
  if (result) {
    return buildProductHelpResponse(
      requestId,
      result.answer,
      result.matchedCapabilities
    );
  }

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

// ─── General Education ─────────────────────────────────────────────────────

function handleGeneralEducation(requestId: string, _question: string): AskResponse {
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

// ─── Personal Record Question ──────────────────────────────────────────────

async function handlePersonalRecordQuestion(
  requestId: string,
  question: string,
  extractions: AskContext["extractions"],
  documents: AskContext["documents"]
): Promise<AskResponse> {
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

  return callAIForPersonalRecords(
    requestId,
    question,
    contextChunks,
    extractions,
    docMap
  );
}

// ─── AI Answer Generation ──────────────────────────────────────────────────

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

    const result = await ollamaProvider.answerQuestion(question, contextChunks);

    const sources: PersonalRecordSource[] = (result.sources || []).map((src) => {
      const matchingExtraction = extractions.find((e) => {
        const doc = docMap.get(e.document_id);
        return (
          doc?.original_name === src.documentName &&
          e.page_number === src.pageNumber
        );
      });

      return {
        documentId:
          matchingExtraction?.document_id ||
          "00000000-0000-0000-0000-000000000000",
        documentName: src.documentName,
        pageNumber: src.pageNumber,
        evidenceText: src.excerpt,
        verificationStatus:
          src.verificationStatus as PersonalRecordSource["verificationStatus"],
      };
    });

    return buildPersonalRecordResponse(requestId, result.answer, sources);
  } catch {
    return buildErrorResponse(
      requestId,
      "I could not process your question right now. Please try again."
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractMedicineTerms(text: string): string[] {
  const words = text.split(/\s+/);
  const terms: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[?.!,]/g, "").toLowerCase();
    if (clean.length >= 3 && /^[a-z]+$/.test(clean)) {
      terms.push(clean);
    }
  }
  return terms;
}

function extractTestTerms(text: string): string[] {
  const words = text.split(/\s+/);
  const terms: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[?.!,]/g, "").toLowerCase();
    if (clean.length >= 2) {
      terms.push(clean);
    }
  }
  return terms;
}
