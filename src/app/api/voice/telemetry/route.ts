import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { hit } from "@/lib/api/rate-limit";
import { recordMetric } from "@/lib/metrics/service";
import {
  isMetricEvent,
  METRIC_METADATA_SCHEMAS,
} from "@/lib/metrics/events";

/**
 * POST /api/voice/telemetry
 *
 * Privacy-safe voice-assistant telemetry (spec §116–§118).
 *
 * Security & privacy:
 *   - Better Auth session required (401 otherwise).
 *   - Rate limited per IP.
 *   - The event vocabulary is CLOSED (METRIC_EVENTS); metadata
 *     schemas are strict per event — any extra field (including
 *     a "transcript" or "text" key) is rejected at parse time.
 *   - Only the closed voice-event set is accepted; a non-voice
 *     event name is rejected so this route cannot be used to
 *     write unrelated metrics.
 *   - Nothing the client sends is ever persisted verbatim —
 *     validated records pass through recordMetric, which drops
 *     anything invalid silently.
 */
export const dynamic = "force-dynamic";

const VOICE_EVENTS = new Set<string>([
  "voice_session_started",
  "voice_session_completed",
  "speech_recognition_success",
  "speech_recognition_failure",
  "tts_success",
  "tts_failure",
  "ai_interpretation_success",
  "ai_fallback",
  "intent_clarification",
  "voice_action_completed",
  "voice_action_failed",
]);

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`voice-telemetry:${ip}`, 60, 60);
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

  const event = (body as { event?: unknown }).event;
  if (typeof event !== "string" || !isMetricEvent(event)) {
    return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });
  }
  if (!VOICE_EVENTS.has(event)) {
    // This route is voice-only; other events go through their
    // own server-side call sites.
    return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });
  }

  const metadata = (body as { metadata?: unknown }).metadata;
  // Strict per-event schema: rejects free-form payloads and any
  // transcript/content-like field before it reaches the DB.
  const schema = METRIC_METADATA_SCHEMAS[event];
  if (!schema.safeParse(metadata ?? {}).success) {
    return NextResponse.json({ code: "INVALID_METADATA" }, { status: 400 });
  }

  await recordMetric({ event, metadata: metadata ?? {} });

  return NextResponse.json({ ok: true });
}
