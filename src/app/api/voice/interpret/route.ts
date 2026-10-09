import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { hit } from "@/lib/api/rate-limit";
import { interpretWithAI } from "@/lib/voice/understanding";
import { isLanguage, type Language } from "@/lib/i18n";

/**
 * POST /api/voice/interpret
 *
 * Server-side AI interpretation fallback for the voice assistant
 * (spec §49, §51–§53). The deterministic interpreter runs FIRST in
 * the browser; this endpoint is only consulted when that found no
 * command AND the session is online.
 *
 * Security:
 *   - Better Auth session required (401 otherwise) — the assistant
 *     is a signed-in feature, never an anonymous AI proxy.
 *   - Rate limited per IP.
 *   - Transcript is truncated server-side to 500 chars.
 *   - The model is prompted to output ONLY a VoiceCommand-shaped
 *     object; the result is re-validated against VoiceCommandSchema
 *     and re-fingerprinted. Invalid output → { command: null }, and
 *     the client falls back to guided UI. Nothing is executed here.
 *   - No patient data, health history, or audio is ever sent — only
 *     the compact transcript text (spec §50).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`voice-interpret:${ip}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON" }, { status: 400 });
  }

  const transcript =
    typeof (body as { transcript?: unknown }).transcript === "string"
      ? ((body as { transcript: string }).transcript as string)
      : "";
  const language = (body as { language?: unknown }).language;
  if (
    !transcript.trim() ||
    transcript.length > 500 ||
    !isLanguage(language)
  ) {
    return NextResponse.json({ code: "INVALID_PAYLOAD" }, { status: 400 });
  }

  // Server-only: runs through the existing AI provider. Returns
  // null when no provider is configured — the client then uses
  // the guided fallback instead of claiming AI worked (§47).
  const command = await interpretWithAI(
    transcript.trim(),
    language as Language
  );

  return NextResponse.json({ command });
}
