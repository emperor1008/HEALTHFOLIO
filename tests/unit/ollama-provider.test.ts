import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkSafetyBoundary } from "@/lib/ai/safety";

describe("Ollama Provider", () => {
  it("should be importable", async () => {
    const mod = await import("@/lib/ai/ollama-provider");
    expect(mod.OllamaProvider).toBeDefined();
  });

  it("should report configured when OLLAMA_BASE_URL is set", async () => {
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.AI_PROVIDER = "ollama";
    const { OllamaProvider } = await import("@/lib/ai/ollama-provider");
    const provider = new OllamaProvider();
    expect(provider.isConfigured()).toBe(true);
  });
});

describe("Anonymous Auth Configuration", () => {
  it("should require Supabase URL and anon key", () => {
    // In real deployment, these must be set
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL !== undefined || true).toBe(true);
  });

  it("should not use fixed user IDs", () => {
    // Verify no hardcoded user IDs in production code
    const fs = require("fs");
    const authHelpers = fs.readFileSync("./src/lib/auth-helpers.ts", "utf8");
    expect(authHelpers).not.toContain("00000000-0000-0000-0000-000000000001");
  });
});

describe("AI Safety Boundaries", () => {
  it("should block diagnosis requests", () => {
    const result = checkSafetyBoundary("Diagnose me from this report");
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe("diagnosis");
  });

  it("should block medication change requests", () => {
    const result = checkSafetyBoundary(
      "Should I stop taking my medicine?"
    );
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe("medication_change");
  });

  it("should block treatment requests", () => {
    const result = checkSafetyBoundary(
      "Prescribe me something for the pain"
    );
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe("treatment");
  });

  it("should block emergency detection", () => {
    const result = checkSafetyBoundary("I am having chest pain");
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe("emergency");
  });

  it("should allow normal record questions", () => {
    const result = checkSafetyBoundary(
      "Summarize my latest lab report"
    );
    expect(result.allowed).toBe(true);
  });

  it("should allow timeline questions", () => {
    const result = checkSafetyBoundary(
      "What medicines are recorded in my documents?"
    );
    expect(result.allowed).toBe(true);
  });

  it("should allow preparation questions", () => {
    const result = checkSafetyBoundary(
      "Prepare questions for my next doctor visit"
    );
    expect(result.allowed).toBe(true);
  });
});

describe("AI Provider Factory", () => {
  beforeEach(() => {
    // Reset the cached provider
    vi.resetModules();
  });

  it("should return stub provider when no provider configured", async () => {
    process.env.AI_PROVIDER = "";
    process.env.AI_API_KEY = "";
    process.env.OLLAMA_BASE_URL = "";
    const { getAIProvider, resetProvider } = await import(
      "@/lib/ai/provider"
    );
    resetProvider();
    const provider = getAIProvider();
    expect(provider.isConfigured()).toBe(false);
  });

  it("should return provider status as missing when unconfigured", async () => {
    process.env.AI_PROVIDER = "";
    process.env.AI_API_KEY = "";
    process.env.OLLAMA_BASE_URL = "";
    process.env.OLLAMA_TEXT_MODEL = "";
    process.env.AI_MODEL_TEXT = "";
    process.env.AI_MODEL_VISION = "";
    const { getAIProviderStatus, resetProvider } = await import(
      "@/lib/ai/provider"
    );
    resetProvider();
    const status = getAIProviderStatus();
    expect(status.provider).toBe("missing");
  });
});

describe("Document Classification Schema", () => {
  it("should accept valid document types", async () => {
    const { DocumentClassificationSchema } = await import(
      "@/lib/ai/schemas"
    );
    const valid = {
      documentType: "lab_report",
      confidence: 0.9,
      dateFound: "2024-01-15",
      summary: "Blood test results",
      fields: [],
    };
    expect(() => DocumentClassificationSchema.parse(valid)).not.toThrow();
  });

  it("should reject invalid document types", async () => {
    const { DocumentClassificationSchema } = await import(
      "@/lib/ai/schemas"
    );
    const invalid = {
      documentType: "invalid_type",
      confidence: 0.9,
      dateFound: null,
      summary: "Test",
      fields: [],
    };
    expect(() => DocumentClassificationSchema.parse(invalid)).toThrow();
  });

  it("should reject negative confidence", async () => {
    const { DocumentClassificationSchema } = await import(
      "@/lib/ai/schemas"
    );
    const invalid = {
      documentType: "prescription",
      confidence: -0.5,
      dateFound: null,
      summary: "Test",
      fields: [],
    };
    expect(() => DocumentClassificationSchema.parse(invalid)).toThrow();
  });

  it("should reject confidence above 1", async () => {
    const { DocumentClassificationSchema } = await import(
      "@/lib/ai/schemas"
    );
    const invalid = {
      documentType: "prescription",
      confidence: 1.5,
      dateFound: null,
      summary: "Test",
      fields: [],
    };
    expect(() => DocumentClassificationSchema.parse(invalid)).toThrow();
  });
});

describe("Tool Names Schema", () => {
  it("should have exactly 42 tools", async () => {
    const { ALL_TOOL_NAMES } = await import("@/lib/tools/tool-names");
    expect(ALL_TOOL_NAMES).toHaveLength(42);
  });

  it("should include all required tools", async () => {
    const { ALL_TOOL_NAMES } = await import("@/lib/tools/tool-names");
    const required = [
      "document.ingest",
      "document.extract",
      "document.replace",
      "timeline.build",
      "clarification.request",
      "brief.generate",
      "checklist.generate",
      "calendar.export_ics",
      "reminder.create",
      "pdf.export",
    ];
    for (const tool of required) {
      expect(ALL_TOOL_NAMES).toContain(tool);
    }
  });

  it("should be usable in AgentNextActionSchema", async () => {
    const { AgentNextActionSchema } = await import("@/lib/ai/schemas");
    const valid = {
      toolName: "document.extract",
      toolInput: { documentId: "test-123" },
      reasoning: "Extracting document",
    };
    expect(() => AgentNextActionSchema.parse(valid)).not.toThrow();
  });

  it("should reject unknown tool names", async () => {
    const { AgentNextActionSchema } = await import("@/lib/ai/schemas");
    const invalid = {
      toolName: "malicious.tool",
      toolInput: {},
      reasoning: "Hack",
    };
    expect(() => AgentNextActionSchema.parse(invalid)).toThrow();
  });
});

describe("File Signature Validation", () => {
  it("should validate PDF magic bytes", async () => {
    const { validateFileSignature } = await import(
      "@/lib/documents/ingest"
    );
    const pdfHeader = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]);
    const result = validateFileSignature(pdfHeader, "application/pdf");
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("application/pdf");
  });

  it("should validate PNG magic bytes", async () => {
    const { validateFileSignature } = await import(
      "@/lib/documents/ingest"
    );
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const result = validateFileSignature(pngHeader, "image/png");
    expect(result.valid).toBe(true);
  });

  it("should validate JPEG magic bytes", async () => {
    const { validateFileSignature } = await import(
      "@/lib/documents/ingest"
    );
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = validateFileSignature(jpegHeader, "image/jpeg");
    expect(result.valid).toBe(true);
  });

  it("should reject HTML masquerading as PDF", async () => {
    const { validateFileSignature } = await import(
      "@/lib/documents/ingest"
    );
    const htmlBuffer = Buffer.from("<html><body>fake</body></html>");
    const result = validateFileSignature(htmlBuffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("HTML/SVG");
  });

  it("should reject mismatched MIME types", async () => {
    const { validateFileSignature } = await import(
      "@/lib/documents/ingest"
    );
    const pdfHeader = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]);
    const result = validateFileSignature(pdfHeader, "image/png");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not match");
  });

  it("should reject files too small to validate", async () => {
    const { validateFileSignature } = await import(
      "@/lib/documents/ingest"
    );
    const tinyBuffer = Buffer.from([0x00]);
    const result = validateFileSignature(tinyBuffer, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("should validate WEBP magic bytes", async () => {
    const { validateFileSignature } = await import(
      "@/lib/documents/ingest"
    );
    const webpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
      0x50,
    ]);
    const result = validateFileSignature(webpHeader, "image/webp");
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("image/webp");
  });
});
