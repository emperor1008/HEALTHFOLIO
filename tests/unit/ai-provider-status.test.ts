import { describe, it, expect, vi, afterEach } from "vitest";

describe("AI Provider Status", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("should report configured when all env vars are set", async () => {
    process.env = {
      ...originalEnv,
      AI_PROVIDER: "openai",
      AI_API_KEY: "sk-test",
      AI_MODEL_TEXT: "gpt-4o-mini",
      AI_MODEL_VISION: "gpt-4o",
    };

    const { getAIProviderStatus } = await import("@/lib/ai/provider");
    const status = getAIProviderStatus();
    expect(status.provider).toBe("openai");
    expect(status.textModel).toBe("configured");
    expect(status.visionModel).toBe("configured");
  });

  it("should report missing when AI_PROVIDER is not set", async () => {
    process.env = {
      ...originalEnv,
      AI_PROVIDER: "",
      AI_API_KEY: "sk-test",
      AI_MODEL_TEXT: "gpt-4o-mini",
      AI_MODEL_VISION: "gpt-4o",
    };

    const { getAIProviderStatus } = await import("@/lib/ai/provider");
    const status = getAIProviderStatus();
    expect(status.provider).toBe("missing");
  });

  it("should report missing when AI_API_KEY is not set", async () => {
    process.env = {
      ...originalEnv,
      AI_PROVIDER: "openai",
      AI_API_KEY: "",
      AI_MODEL_TEXT: "gpt-4o-mini",
      AI_MODEL_VISION: "gpt-4o",
    };

    const { getAIProvider } = await import("@/lib/ai/provider");
    const provider = getAIProvider();
    expect(provider.isConfigured()).toBe(false);
  });

  it("should never expose API key in status", async () => {
    process.env = {
      ...originalEnv,
      AI_PROVIDER: "openai",
      AI_API_KEY: "sk-secret-key-12345",
      AI_MODEL_TEXT: "gpt-4o-mini",
      AI_MODEL_VISION: "gpt-4o",
    };

    const { getAIProviderStatus } = await import("@/lib/ai/provider");
    const status = getAIProviderStatus();
    const statusStr = JSON.stringify(status);
    expect(statusStr).not.toContain("sk-secret");
    expect(statusStr).not.toContain("12345");
  });

  it("should report vision model status correctly", async () => {
    process.env = {
      ...originalEnv,
      AI_PROVIDER: "openai",
      AI_API_KEY: "sk-test",
      AI_MODEL_TEXT: "gpt-4o-mini",
      AI_MODEL_VISION: "",
    };

    const { getAIProviderStatus } = await import("@/lib/ai/provider");
    const status = getAIProviderStatus();
    expect(status.visionModel).toBe("missing");
  });
});
