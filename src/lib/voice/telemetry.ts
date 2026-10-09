/**
 * Voice telemetry — client side (spec §116–§118).
 *
 * Reports ONLY the closed voice-event vocabulary to the
 * server-side ingest route. Every payload is validated again
 * by the strict Zod schemas on the server before it is
 * written; a rejected event is dropped silently.
 *
 * PRIVACY: no transcript, no symptom text, no conversation
 * content, no identifiers — language enums, closed action
 * enums and booleans only. Fire-and-forget: telemetry must
 * never block or break the voice loop.
 */

import {
  METRIC_METADATA_SCHEMAS,
  type MetricEvent,
} from "@/lib/metrics/events";

type VoiceMetricEvent = Extract<
  MetricEvent,
  | "voice_session_started"
  | "voice_session_completed"
  | "speech_recognition_success"
  | "speech_recognition_failure"
  | "tts_success"
  | "tts_failure"
  | "ai_interpretation_success"
  | "ai_fallback"
  | "intent_clarification"
  | "voice_action_completed"
  | "voice_action_failed"
>;

type VoiceMetadata = Record<string, unknown>;

/**
 * Report one voice event. Validated client-side first (best
 * effort — the server re-validates), then POSTed with
 * keepalive so it survives page navigation. Never throws.
 */
export function recordVoiceMetric(
  event: VoiceMetricEvent,
  metadata: VoiceMetadata = {}
): void {
  try {
    if (!METRIC_METADATA_SCHEMAS[event].safeParse(metadata).success) {
      return;
    }
    void fetch("/api/voice/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, metadata }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Telemetry is best-effort by design.
  }
}
