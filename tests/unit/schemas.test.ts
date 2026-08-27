import { describe, it, expect } from "vitest";
import {
  DocumentClassificationSchema,
  AgentNextActionSchema,
  EvidenceLocatorSchema,
  ExtractedFieldSchema,
} from "@/lib/ai/schemas";

describe("AI Output Schemas", () => {
  describe("EvidenceLocatorSchema", () => {
    it("accepts valid locator", () => {
      expect(EvidenceLocatorSchema.safeParse({
        documentId: "doc-123", documentName: "report.pdf",
        pageNumber: 1, sourceText: "BP: 120/80",
      }).success).toBe(true);
    });

    it("rejects missing documentId", () => {
      expect(EvidenceLocatorSchema.safeParse({
        documentName: "report.pdf", pageNumber: 1,
      }).success).toBe(false);
    });
  });

  describe("ExtractedFieldSchema", () => {
    it("accepts valid field", () => {
      expect(ExtractedFieldSchema.safeParse({
        fieldType: "test", rawValue: "BP: 120/80 mmHg",
        normalizedValue: { test: "BP" }, confidence: 0.92,
        evidenceLocator: { documentId: "d", documentName: "r.pdf", pageNumber: 1 },
      }).success).toBe(true);
    });

    it("rejects confidence > 1", () => {
      expect(ExtractedFieldSchema.safeParse({
        fieldType: "test", rawValue: "x", normalizedValue: {},
        confidence: 1.5,
        evidenceLocator: { documentId: "d", documentName: "r.pdf", pageNumber: 1 },
      }).success).toBe(false);
    });

    it("rejects invalid fieldType", () => {
      expect(ExtractedFieldSchema.safeParse({
        fieldType: "invalid", rawValue: "x", normalizedValue: {},
        confidence: 0.5,
        evidenceLocator: { documentId: "d", documentName: "r.pdf", pageNumber: 1 },
      }).success).toBe(false);
    });
  });

  describe("DocumentClassificationSchema", () => {
    it("accepts valid classification", () => {
      expect(DocumentClassificationSchema.safeParse({
        documentType: "lab_report", confidence: 0.88,
        dateFound: "2024-01-15", summary: "Blood test", fields: [],
      }).success).toBe(true);
    });

    it("accepts null date", () => {
      expect(DocumentClassificationSchema.safeParse({
        documentType: "prescription", confidence: 0.8,
        dateFound: null, summary: "Rx", fields: [],
      }).success).toBe(true);
    });
  });

  describe("AgentNextActionSchema", () => {
    it("accepts valid tool name", () => {
      expect(AgentNextActionSchema.safeParse({
        toolName: "document.extract", toolInput: {}, reasoning: "test",
      }).success).toBe(true);
    });

    it("rejects unknown tool name", () => {
      expect(AgentNextActionSchema.safeParse({
        toolName: "unknown.tool", toolInput: {}, reasoning: "test",
      }).success).toBe(false);
    });
  });
});
