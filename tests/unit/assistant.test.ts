import { describe, it, expect } from "vitest";
import {
  classifyIntentDeterministic,
  classifyIntent,
  type IntentResult,
} from "@/lib/assistant/intent-router";
import {
  answerProductHelp,
  CAPABILITIES,
} from "@/lib/assistant/capabilities";
import {
  buildProductHelpResponse,
  buildPersonalRecordResponse,
  buildSafetyBoundaryResponse,
  buildNoRecordsResponse,
  buildErrorResponse,
  buildClarificationResponse,
  AskResponseSchema,
} from "@/lib/assistant/response-contract";
import {
  processQuestion,
  type AskContext,
} from "@/lib/assistant/orchestrator";

// ─── Intent Router Tests ──────────────────────────────────────────────────

describe("Intent Router — Deterministic Classification", () => {
  it("classifies product help: 'What can Healthfolio do?'", () => {
    const result = classifyIntentDeterministic("What can Healthfolio do?");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PRODUCT_HELP");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies product help: 'How do I upload a report?'", () => {
    const result = classifyIntentDeterministic("How do I upload a report?");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PRODUCT_HELP");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies product help: 'Can Healthfolio read prescriptions?'", () => {
    const result = classifyIntentDeterministic(
      "Can Healthfolio read prescriptions?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PRODUCT_HELP");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies product help: 'How does OCR work?'", () => {
    const result = classifyIntentDeterministic("How does OCR work?");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PRODUCT_HELP");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies product help: 'What file formats does Healthfolio support?'", () => {
    const result = classifyIntentDeterministic(
      "What file formats does Healthfolio support?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PRODUCT_HELP");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies product help: 'How do I export my consultation brief?'", () => {
    const result = classifyIntentDeterministic(
      "How do I export my consultation brief?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PRODUCT_HELP");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies emergency: 'I have chest pain'", () => {
    const result = classifyIntentDeterministic("I have chest pain");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("EMERGENCY_OR_URGENT");
  });

  it("classifies emergency: 'Call an ambulance immediately'", () => {
    const result = classifyIntentDeterministic("Call an ambulance immediately");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("EMERGENCY_OR_URGENT");
  });

  it("classifies medical advice boundary: 'Should I stop this medicine?'", () => {
    const result = classifyIntentDeterministic(
      "Should I stop this medicine?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PERSONALIZED_MEDICAL_ADVICE");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies medical advice boundary: 'What dose should I take?'", () => {
    const result = classifyIntentDeterministic(
      "What dose should I take?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PERSONALIZED_MEDICAL_ADVICE");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies medical advice boundary: 'Tell me what disease I have'", () => {
    const result = classifyIntentDeterministic(
      "Tell me what disease I have"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PERSONALIZED_MEDICAL_ADVICE");
  });

  it("classifies personal record question: 'What was my latest HbA1c?'", () => {
    const result = classifyIntentDeterministic(
      "What was my latest HbA1c?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PERSONAL_RECORD_QUESTION");
    expect(result!.requiresDocuments).toBe(true);
  });

  it("classifies personal record question: 'Which medicines are written in my prescription?'", () => {
    const result = classifyIntentDeterministic(
      "Which medicines are written in my prescription?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PERSONAL_RECORD_QUESTION");
    expect(result!.requiresDocuments).toBe(true);
  });

  it("classifies personal record question: 'When was my previous appointment?'", () => {
    const result = classifyIntentDeterministic(
      "When was my previous appointment?"
    );
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("PERSONAL_RECORD_QUESTION");
    expect(result!.requiresDocuments).toBe(true);
  });

  it("classifies general health: 'What food should I eat?'", () => {
    const result = classifyIntentDeterministic("What food should I eat?");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe("GENERAL_HEALTH_EDUCATION");
    expect(result!.requiresDocuments).toBe(false);
  });

  it("classifies general health with clarification: 'Is it healthy to eat eggs if I have high cholesterol?'", () => {
    // This has both general health and personal record signals
    const result = classifyIntentDeterministic(
      "Is it healthy to eat eggs if I have high cholesterol?"
    );
    expect(result).not.toBeNull();
    // Should be general health with clarification required
    expect(result!.intent).toBe("GENERAL_HEALTH_EDUCATION");
    expect(result!.requiresClarification).toBe(true);
  });

  it("returns null for very short input", () => {
    const result = classifyIntentDeterministic("Hi");
    expect(result).toBeNull();
  });

  it("returns null for ambiguous input, allowing AI fallback", () => {
    const result = classifyIntentDeterministic("Tell me about this");
    expect(result).toBeNull();
  });
});

describe("Intent Router — Full Classification", () => {
  it("classifies product help without AI fallback", async () => {
    const result = await classifyIntent("What can Healthfolio do?");
    expect(result.intent).toBe("PRODUCT_HELP");
    expect(result.requiresDocuments).toBe(false);
  });

  it("classifies emergency without AI fallback", async () => {
    const result = await classifyIntent("I think I'm having a stroke");
    expect(result.intent).toBe("EMERGENCY_OR_URGENT");
  });

  it("classifies medical advice boundary without AI fallback", async () => {
    const result = await classifyIntent("Should I start taking my medication?");
    expect(result.intent).toBe("PERSONALIZED_MEDICAL_ADVICE");
  });

  it("defaults to personal record for ambiguous input without AI", async () => {
    const result = await classifyIntent("Tell me about this");
    expect(result.intent).toBe("PERSONAL_RECORD_QUESTION");
    expect(result.confidence).toBeLessThan(0.8);
  });

  it("uses AI fallback for ambiguous input when provided", async () => {
    const mockAI = async () => ({
      intent: "GENERAL_HEALTH_EDUCATION" as const,
      confidence: 0.85,
      requiresDocuments: false,
      requiresReferenceRetrieval: true,
      requiresClarification: false,
    });

    const result = await classifyIntent("Tell me about this", mockAI);
    expect(result.intent).toBe("GENERAL_HEALTH_EDUCATION");
    expect(result.requiresReferenceRetrieval).toBe(true);
  });
});

// ─── Product Help Tests ───────────────────────────────────────────────────

describe("Product Help — Capabilities Registry", () => {
  it("has capabilities defined", () => {
    expect(CAPABILITIES.length).toBeGreaterThan(0);
  });

  it("every capability has required fields", () => {
    for (const cap of CAPABILITIES) {
      expect(cap.id).toBeTruthy();
      expect(cap.category).toBeTruthy();
      expect(cap.keywords.length).toBeGreaterThan(0);
      expect(cap.shortDescription).toBeTruthy();
      expect(cap.detailedDescription).toBeTruthy();
    }
  });

  it("answers 'What can Healthfolio do?'", () => {
    const result = answerProductHelp("What can Healthfolio do?");
    expect(result).not.toBeNull();
    expect(result!.answer).toContain("Healthfolio");
    expect(result!.matchedCapabilities.length).toBeGreaterThan(0);
  });

  it("answers 'How do I upload a report?'", () => {
    const result = answerProductHelp("How do I upload a report?");
    expect(result).not.toBeNull();
    expect(result!.answer).toContain("upload");
  });

  it("answers 'How does OCR work?'", () => {
    const result = answerProductHelp("How does OCR work?");
    expect(result).not.toBeNull();
    expect(result!.answer).toContain("OCR");
  });

  it("answers 'Can I export my consultation brief?'", () => {
    const result = answerProductHelp("Can I export my consultation brief?");
    expect(result).not.toBeNull();
    expect(result!.matchedCapabilities).toContain("pdf-export");
  });

  it("answers 'How does the timeline work?'", () => {
    const result = answerProductHelp("How does the timeline work?");
    expect(result).not.toBeNull();
    expect(result!.matchedCapabilities).toContain("timeline");
  });

  it("returns null for questions with no matching capabilities", () => {
    const result = answerProductHelp("Tell me a joke");
    expect(result).toBeNull();
  });
});

// ─── Response Contract Tests ──────────────────────────────────────────────

describe("Response Contract — Schema Validation", () => {
  it("validates a product help response", () => {
    const response = buildProductHelpResponse(
      "req-1",
      "Healthfolio can upload documents.",
      ["upload"]
    );
    const parsed = AskResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.answerType).toBe("product_help");
    expect(parsed.data!.requiresClarification).toBe(false);
  });

  it("validates a personal record response", () => {
    const response = buildPersonalRecordResponse(
      "req-2",
      "Your latest HbA1c was 6.2%.",
      [
        {
          documentId: "550e8400-e29b-41d4-a716-446655440000",
          documentName: "Blood Report.pdf",
          pageNumber: 1,
          evidenceText: "HbA1c: 6.2%",
          verificationStatus: "system_verified",
        },
      ]
    );
    const parsed = AskResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.answerType).toBe("personal_record");
    expect(parsed.data!.sources.length).toBe(1);
  });

  it("validates a clarification response", () => {
    const response = buildClarificationResponse(
      "req-3",
      "What food should I eat?",
      ["General health information", "Related to my health records"]
    );
    const parsed = AskResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.requiresClarification).toBe(true);
    expect(parsed.data!.clarificationOptions.length).toBe(2);
  });

  it("validates a safety boundary response", () => {
    const response = buildSafetyBoundaryResponse(
      "req-4",
      "diagnosis"
    );
    const parsed = AskResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.answerType).toBe("safety_boundary");
  });

  it("validates an emergency response", () => {
    const response = buildSafetyBoundaryResponse(
      "req-5",
      "emergency"
    );
    const parsed = AskResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.answerType).toBe("emergency");
    expect(parsed.data!.answer).toContain("urgent");
  });

  it("validates a no-records response", () => {
    const response = buildNoRecordsResponse(
      "req-6",
      "What was my latest HbA1c?"
    );
    const parsed = AskResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.answerType).toBe("personal_record");
    expect(parsed.data!.answer).toContain("uploaded records");
  });

  it("validates an error response", () => {
    const response = buildErrorResponse(
      "req-7",
      "Something went wrong"
    );
    const parsed = AskResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.answerType).toBe("error");
  });
});

// ─── Safety Boundary Tests ────────────────────────────────────────────────

describe("Safety Boundaries — Orchestrator", () => {
  const emptyContext: AskContext = {
    userId: "user-1",
    requestId: "req-safety-1",
    question: "",
    extractions: [],
    documents: [],
  };

  it("blocks diagnosis requests", async () => {
    const result = await processQuestion({
      ...emptyContext,
      question: "Do I have diabetes?",
    });
    expect(result.answerType).toBe("safety_boundary");
    expect(result.answer).toContain("diagnose");
  });

  it("blocks treatment requests", async () => {
    const result = await processQuestion({
      ...emptyContext,
      question: "Should I stop taking my medication?",
    });
    expect(result.answerType).toBe("safety_boundary");
  });

  it("blocks medication change requests", async () => {
    const result = await processQuestion({
      ...emptyContext,
      question: "What dose should I take?",
    });
    expect(result.answerType).toBe("safety_boundary");
  });

  it("detects emergencies", async () => {
    const result = await processQuestion({
      ...emptyContext,
      question: "I have chest pain and can't breathe",
    });
    expect(result.answerType).toBe("emergency");
    expect(result.answer).toContain("urgent medical attention");
    expect(result.answer).toContain("112");
  });

  it("allows product help questions", async () => {
    const result = await processQuestion({
      ...emptyContext,
      question: "What can Healthfolio do?",
    });
    expect(result.answerType).toBe("product_help");
    expect(result.answer).toContain("Healthfolio");
  });

  it("allows personal record questions", async () => {
    const result = await processQuestion({
      ...emptyContext,
      question: "What was my latest HbA1c?",
    });
    // With no records, should say "no records found"
    expect(result.answerType).toBe("personal_record");
    expect(result.answer).toContain("uploaded records");
  });

  it("handles general health with clarification", async () => {
    const result = await processQuestion({
      ...emptyContext,
      question: "Is it healthy to eat eggs if I have high cholesterol?",
    });
    expect(result.answerType).toBe("clarification");
    expect(result.requiresClarification).toBe(true);
    expect(result.clarificationOptions.length).toBe(2);
  });
});

// ─── No-Records Behavior ──────────────────────────────────────────────────

describe("No-Records — Correct Response for Each Intent", () => {
  it("returns 'no records' only for personal record questions", async () => {
    // Product help should NOT say "no records found"
    const productResult = await processQuestion({
      userId: "user-1",
      requestId: "req-1",
      question: "What can Healthfolio do?",
      extractions: [],
      documents: [],
    });
    expect(productResult.answer).not.toContain("uploaded records");
    expect(productResult.answerType).toBe("product_help");
  });

  it("says 'no records' for personal record questions with no data", async () => {
    const recordResult = await processQuestion({
      userId: "user-1",
      requestId: "req-2",
      question: "What was my latest HbA1c?",
      extractions: [],
      documents: [],
    });
    expect(recordResult.answer).toContain("uploaded records");
    expect(recordResult.answerType).toBe("personal_record");
  });
});

// ─── Duplicate Prevention ─────────────────────────────────────────────────

describe("Duplicate Prevention — Request IDs", () => {
  it("every response includes a requestId", async () => {
    const result = await processQuestion({
      userId: "user-1",
      requestId: "req-dup-1",
      question: "What can Healthfolio do?",
      extractions: [],
      documents: [],
    });
    expect(result.requestId).toBeTruthy();
    expect(typeof result.requestId).toBe("string");
  });

  it("user message IDs are stable strings", () => {
    // In the UI, message IDs are generated as `user-{requestId}` and `assistant-{requestId}`
    const requestId = "test-uuid-1234";
    const userId = `user-${requestId}`;
    const assistantId = `assistant-${requestId}`;
    expect(userId).toBe("user-test-uuid-1234");
    expect(assistantId).toBe("assistant-test-uuid-1234");
    // Same requestId always produces the same message IDs
    expect(`user-${requestId}`).toBe(userId);
    expect(`assistant-${requestId}`).toBe(assistantId);
  });
});

// ─── Intent-Specific Response Quality ─────────────────────────────────────

describe("Response Quality — Product Help Answers Content", () => {
  it("provides specific upload instructions", async () => {
    const result = await processQuestion({
      userId: "user-1",
      requestId: "req-q1",
      question: "How do I upload a report?",
      extractions: [],
      documents: [],
    });
    expect(result.answer).toContain("Records");
    expect(result.answer).toContain("upload");
  });

  it("provides OCR explanation", async () => {
    const result = await processQuestion({
      userId: "user-1",
      requestId: "req-q2",
      question: "How does OCR work in Healthfolio?",
      extractions: [],
      documents: [],
    });
    expect(result.answerType).toBe("product_help");
    expect(result.answer.length).toBeGreaterThan(20);
  });

  it("provides privacy information", async () => {
    const result = await processQuestion({
      userId: "user-1",
      requestId: "req-q3",
      question: "How does Healthfolio keep data safe?",
      extractions: [],
      documents: [],
    });
    expect(result.answerType).toBe("product_help");
    expect(result.answer.length).toBeGreaterThan(20);
  });
});
