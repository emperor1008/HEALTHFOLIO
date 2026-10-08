/**
 * Structured, privacy-safe consultation diagnostics (developer-facing).
 *
 * RULES
 * - Closed event vocabulary. Free-form strings are dropped, not logged.
 * - Never pass SDP, ICE candidates, tokens, symptom text, or any medical
 *   data as `data` — the keys are allowlisted per event and values must be
 *   primitives. SDP in particular must never reach a log sink.
 * - Output goes to an in-memory ring buffer (rendered only behind the
 *   "Technical details" disclosure in the consultation UI) and to
 *   console.debug when NEXT_PUBLIC_DIAGNOSTICS=1.
 * - The buffer is per-tab, per-session, and cleared on page unload.
 */

export const CONSULTATION_DIAGNOSTIC_EVENTS = [
  "consultation_join_started",
  "consultation_media_acquired",
  "consultation_media_failed",
  "consultation_room_joined",
  "consultation_room_failed",
  "consultation_peer_present",
  "consultation_peer_absent",
  "consultation_offer_sent",
  "consultation_answer_sent",
  "consultation_ice_sent",
  "consultation_ice_received",
  "consultation_connected",
  "consultation_connection_state",
  "consultation_ice_state",
  "video_enabled",
  "video_degraded",
  "video_upgraded",
  "switched_to_audio",
  "switched_to_text",
  "reconnection_started",
  "reconnection_succeeded",
  "reconnection_failed",
  "offline_fallback_started",
  "signalling_transport_state",
  "signalling_invalid_payload",
  "permission_error",
  "consultation_ended",
] as const;

export type ConsultationDiagnosticEvent = (typeof CONSULTATION_DIAGNOSTIC_EVENTS)[number];

/** Per-event allowlisted data keys. An unlisted key is dropped. */
const ALLOWED_DATA_KEYS: Record<ConsultationDiagnosticEvent, readonly string[]> = {
  consultation_join_started: ["mode", "role"],
  consultation_media_acquired: ["tracks", "mode"],
  consultation_media_failed: ["kind", "media"],
  consultation_room_joined: ["role"],
  consultation_room_failed: ["reason"],
  consultation_peer_present: ["count"],
  consultation_peer_absent: ["count"],
  consultation_offer_sent: ["renegotiation"],
  consultation_answer_sent: [],
  consultation_ice_sent: ["count"],
  consultation_ice_received: ["count"],
  consultation_connected: ["mode"],
  consultation_connection_state: ["state"],
  consultation_ice_state: ["state"],
  video_enabled: ["level"],
  video_degraded: ["level", "quality"],
  video_upgraded: ["level", "quality"],
  switched_to_audio: ["reason"],
  switched_to_text: ["reason"],
  reconnection_started: ["attempt"],
  reconnection_succeeded: ["attempt"],
  reconnection_failed: ["attempt", "reason"],
  offline_fallback_started: ["reason"],
  signalling_transport_state: ["state"],
  signalling_invalid_payload: ["reason"],
  permission_error: ["kind", "media"],
  consultation_ended: ["reason"],
};

export interface ConsultationDiagnosticEntry {
  event: ConsultationDiagnosticEvent;
  at: number;
  data: Record<string, string | number | boolean>;
}

const BUFFER_LIMIT = 100;
const buffer: ConsultationDiagnosticEntry[] = [];
const sinkListeners = new Set<(entry: ConsultationDiagnosticEntry) => void>();

function diagnosticsEnabled(): boolean {
  try {
    return (
      typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_DIAGNOSTICS === "1"
    );
  } catch {
    return false;
  }
}

function sanitizeData(
  event: ConsultationDiagnosticEvent,
  data: Record<string, unknown> | undefined
): Record<string, string | number | boolean> {
  const allowed = ALLOWED_DATA_KEYS[event];
  const out: Record<string, string | number | boolean> = {};
  if (!data) return out;
  for (const key of allowed) {
    const value = data[key];
    if (typeof value === "string") out[key] = value.slice(0, 80);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** Record one diagnostic event. Never throws, never logs raw payloads. */
export function logConsultationEvent(
  event: ConsultationDiagnosticEvent,
  data?: Record<string, unknown>
): void {
  const entry: ConsultationDiagnosticEntry = {
    event,
    at: Date.now(),
    data: sanitizeData(event, data),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();
  for (const listener of sinkListeners) {
    try {
      listener(entry);
    } catch {
      // sinks must never break the consultation
    }
  }
  if (diagnosticsEnabled()) {
    try {
      console.debug(`[consultation] ${event}`, entry.data);
    } catch {
      // console may be unavailable; the ring buffer still holds the event
    }
  }
}

/** Read the current ring buffer (for the diagnostics panel). */
export function getConsultationDiagnostics(): readonly ConsultationDiagnosticEntry[] {
  return [...buffer];
}

/** Subscribe to live diagnostics (UI panel). Returns an unsubscribe fn. */
export function subscribeConsultationDiagnostics(
  listener: (entry: ConsultationDiagnosticEntry) => void
): () => void {
  sinkListeners.add(listener);
  return () => sinkListeners.delete(listener);
}

/** Clear the buffer (called when a consultation starts fresh). */
export function clearConsultationDiagnostics(): void {
  buffer.length = 0;
}
