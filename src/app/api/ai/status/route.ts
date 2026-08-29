import { NextResponse } from "next/server";
import { getAIProviderStatus } from "@/lib/ai/provider";

/**
 * GET /api/ai/status
 * Reports AI configuration status without exposing secret values.
 * Public endpoint (no auth required) — only reports configured/missing.
 */
export async function GET() {
  const status = getAIProviderStatus();

  return NextResponse.json({
    data: {
      ai: status.provider,
      textModel: status.textModel,
      visionModel: status.visionModel,
      message:
        status.provider === "missing"
          ? "AI document analysis is not configured."
          : "AI document analysis is configured.",
    },
    error: null,
  });
}
