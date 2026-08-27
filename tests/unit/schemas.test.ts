import { describe, it, expect } from "vitest";
import {
  DocumentClassificationSchema,
  AgentNextActionSchema,
  EvidenceLocatorSchema,
  ExtractedFieldSchema,
} from "@/lib/ai/schemas";

describe("AI Output Schemas", () => {
  describe("EvidenceLocatorSchema", () => {
    it("should accept valid evidence locator", () => {
      const result = EvidenceLocatorSchema.safeParse({
        documentId: "doc-123",
        documentName: "report.pdf",
        pageNumber: 1,
        sourceText: "Blood pressure: 120/80",
      });
      expect(result.success).toBe(true);
    });

    it("should require documentId", () => {
      const result = EvidenceLocatorSchema.safeParse({
        documentName: "report.pdf",
        pageNumber: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ExtractedFieldSchema", () => {
    it("should accept valid extracted field", () => {
      const result = ExtractedFieldSchema.safeParse({
        fieldType: "test",
        rawValue: "Blood pressure: 120/80 mmHg",
        normalizedValue: { test: "Blood pressure", value: "120/80" },
        confidence: 0.92,
        evidenceLocator: {
          documentId: "doc-123",
          documentName: "report.pdf",
          pageNumber: 1,
        },
      });
      expect(result.success).toBe(true);
    });

    it("should reject confidence outside 0-1 range", () => {
      const result = ExtractedFieldSchema.safeParse({
        fieldType: "test",
        rawValue: "test",
        normalizedValue: {},
        confidence: 1.5,
        evidenceLocator: {
          documentId: "doc-123",
          documentName: "report.pdf",
          pageNumber: 1,
        },
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid field type", () => {
      const result = ExtractedFieldSchema.safeParse({
        fieldType: "invalid_type",
        rawValue: "test",
        normalizedValue: {},
        confidence: 0.5,
        evidenceLocator: {
          documentId: "doc-123",
          documentName: "report.pdf",
          pageNumber: 1,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("DocumentClassificationSchema", () => {
    it("should accept valid classification", () => {
      const result = DocumentClassificationSchema.safeParse({
        documentType: "lab_report",
        confidence: 0.88,
        dateFound: "2024-01-15",
        summary: "Blood test results",
        fields: [
          {
            fieldType: "test",
            rawValue: "Hemoglobin: 12.5 g/dL",
            normalizedValue: { test: "Hemoglobin", value: "12.5" },
            confidence: 0.95,
            evidenceLocator: {
              documentId: "doc-123",
              documentName: "report.pdf",
              pageNumber: 1,
            },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should accept null date", () => {
      const result = DocumentClassificationSchema.safeParse({
        documentType: "prescription",
        confidence: 0.8,
        dateFound: null,
        summary: "Prescription",
        fields: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("AgentNextActionSchema", () => {
    it("should accept valid next action", () => {
      const result = AgentNextActionSchema.safeParse({
        toolName: "document.extract",
        toolInput: { documentId: "doc-123" },
        reasoning: "Extracting text from uploaded document",
      });
      expect(result.success).toBe(true);
    });

    it("should reject unknown tool name", () => {
      const result = AgentNextActionSchema.safeParse({
        toolName: "unknown.tool",
        toolInput: {},
        reasoning: "test",
      });
      expect(result.success).toBe(false);
    });

    it("should reject dangerous tool names", () => {
      const result = AgentNextActionSchema.safeParse({
        toolName: "diagnose",
        toolInput: {},
        reasoning: "test",
      });
      expect(result.success).toBe(false);
    });
  });
});
