/**
 * Consultation state machine (pure, no I/O).
 *
 * The single source of truth for consultation UI/connection state. The page
 * never derives state from scattered booleans: it reduces ConsultationEvent
 * values through `transition` and renders the resulting ConsultationState.
 *
 * Lifecycle (Phase 1):
 *   idle → joining → waiting_for_peer → connecting → connected_video
 *   connected_video ⇄ degraded_video (network adaptation)
 *   connected_video/degraded_video ⇄ connected_audio (manual/forced switch)
 *   any active state → reconnecting (bounded retries)
 *   reconnecting → connected_* on success, store_and_forward when exhausted
 *   any active state → store_and_forward (continue by text / offline)
 *   any state → ended (user or peer ended the consultation)
 *   media/authorization failures → error (explicit, with a recovery code)
 *
 * Invariants:
 * - `error` is non-null exactly when status === "error".
 * - An event that is not valid for the current state is ignored (the state
 *   object is returned unchanged) — no contradictory states can be produced.
 * - `retryAttempt` only grows through RECONNECT_TICK and resets on
 *   RECONNECT_SUCCEEDED / JOIN / END, bounding reconnection loops.
 */

import type { ConnectionMode } from "./types";

export const CONSULTATION_STATUSES = [
  "idle",
  "joining",
  "waiting_for_peer",
  "connecting",
  "connected_video",
  "degraded_video",
  "connected_audio",
  "reconnecting",
  "store_and_forward",
  "ended",
  "error",
] as const;

export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export type ConsultationErrorCode =
  | "permission_denied"
  | "camera_unavailable"
  | "microphone_unavailable"
  | "unsupported_browser"
  | "signalling_unavailable"
  | "room_not_available"
  | "unauthorized"
  | "peer_connection_failed"
  | "unknown";

export interface ConsultationState {
  status: ConsultationStatus;
  /** Effective media mode of the session. */
  mode: ConnectionMode;
  /** Non-null exactly when status === "error". */
  error: ConsultationErrorCode | null;
  /** Bounded reconnection attempt counter (0 while not reconnecting). */
  retryAttempt: number;
}

export type ConsultationEvent =
  | { type: "JOIN"; mode: "video" | "audio" }
  | { type: "MEDIA_OK" }
  | { type: "MEDIA_FAILED"; error: ConsultationErrorCode }
  | { type: "ROOM_READY" }
  | { type: "PEER_ABSENT" }
  | { type: "PEER_PRESENT" }
  | { type: "NEGOTIATION_STARTED" }
  | { type: "PC_CONNECTED"; mode: "video" | "audio" }
  | { type: "QUALITY_DEGRADED" }
  | { type: "QUALITY_RECOVERED" }
  | { type: "FORCE_MODE"; mode: ConnectionMode }
  | { type: "NETWORK_LOST" }
  | { type: "RECONNECT_TICK" }
  | { type: "RECONNECT_SUCCEEDED"; mode: "video" | "audio" }
  | { type: "RECONNECT_EXHAUSTED" }
  | { type: "MEDIA_ERROR"; error: ConsultationErrorCode }
  | { type: "END" }
  | { type: "RESET" };

/** Maximum bounded reconnection attempts before falling back to text. */
export const MAX_RECONNECT_ATTEMPTS = 5;

export const INITIAL_CONSULTATION_STATE: ConsultationState = {
  status: "idle",
  mode: "text",
  error: null,
  retryAttempt: 0,
};

const ACTIVE_STATUSES: ReadonlySet<ConsultationStatus> = new Set([
  "connected_video",
  "degraded_video",
  "connected_audio",
]);

function isMediaStatus(status: ConsultationStatus): boolean {
  return status === "connected_video" || status === "degraded_video" || status === "connected_audio";
}

function withMode(state: ConsultationState, mode: ConnectionMode): ConsultationState {
  return { ...state, mode };
}

/**
 * Reduce the current state with one event. Pure: never mutates its input and
 * ignores events that are invalid for the current state.
 */
export function transition(
  state: ConsultationState,
  event: ConsultationEvent
): ConsultationState {
  switch (event.type) {
    case "JOIN": {
      if (state.status !== "idle" && state.status !== "ended" && state.status !== "error") {
        return state;
      }
      return {
        status: "joining",
        mode: event.mode,
        error: null,
        retryAttempt: 0,
      };
    }

    case "MEDIA_OK": {
      // Media acquired; still joining until the signalling room is joined.
      if (state.status !== "joining") return state;
      return state;
    }

    case "MEDIA_FAILED": {
      if (state.status === "ended") return state;
      return { status: "error", mode: "text", error: event.error, retryAttempt: 0 };
    }

    case "ROOM_READY": {
      if (state.status !== "joining") return state;
      return { ...state, status: "waiting_for_peer" };
    }

    case "PEER_ABSENT": {
      if (
        state.status === "joining" ||
        state.status === "connecting" ||
        state.status === "connected_video" ||
        state.status === "degraded_video" ||
        state.status === "connected_audio" ||
        state.status === "reconnecting"
      ) {
        return { ...state, status: "waiting_for_peer" };
      }
      return state;
    }

    case "PEER_PRESENT": {
      if (state.status !== "waiting_for_peer") return state;
      return { ...state, status: "connecting" };
    }

    case "NEGOTIATION_STARTED": {
      if (state.status === "waiting_for_peer" || state.status === "joining") {
        return { ...state, status: "connecting" };
      }
      if (state.status === "reconnecting") return state;
      return state;
    }

    case "PC_CONNECTED": {
      if (state.status === "ended" || state.status === "idle") return state;
      return {
        status: event.mode === "video" ? "connected_video" : "connected_audio",
        mode: event.mode,
        error: null,
        retryAttempt: 0,
      };
    }

    case "QUALITY_DEGRADED": {
      if (state.status === "connected_video") {
        return { ...state, status: "degraded_video" };
      }
      return state;
    }

    case "QUALITY_RECOVERED": {
      if (state.status === "degraded_video") {
        return { ...state, status: "connected_video" };
      }
      return state;
    }

    case "FORCE_MODE": {
      if (event.mode === "text") {
        if (state.status === "ended" || state.status === "idle" || state.status === "error") {
          return state;
        }
        return { status: "store_and_forward", mode: "text", error: null, retryAttempt: 0 };
      }
      if (event.mode === "audio") {
        if (!isMediaStatus(state.status)) return state;
        if (state.status === "connected_audio") return state;
        return { ...state, status: "connected_audio", mode: "audio" };
      }
      // video requested
      if (state.status === "connected_audio" || state.status === "degraded_video") {
        return { ...state, status: "connecting", mode: "video" };
      }
      if (state.status === "connected_video") return state;
      return state;
    }

    case "NETWORK_LOST": {
      if (!isMediaStatus(state.status) && state.status !== "connecting" &&
          state.status !== "waiting_for_peer" && state.status !== "joining") {
        return state;
      }
      return { ...state, status: "reconnecting", retryAttempt: 0 };
    }

    case "RECONNECT_TICK": {
      if (state.status !== "reconnecting") return state;
      const next = state.retryAttempt + 1;
      if (next >= MAX_RECONNECT_ATTEMPTS) {
        return { status: "store_and_forward", mode: "text", error: null, retryAttempt: next };
      }
      return { ...state, retryAttempt: next };
    }

    case "RECONNECT_SUCCEEDED": {
      if (state.status !== "reconnecting" && state.status !== "connecting") return state;
      return {
        status: event.mode === "video" ? "connected_video" : "connected_audio",
        mode: event.mode,
        error: null,
        retryAttempt: 0,
      };
    }

    case "RECONNECT_EXHAUSTED": {
      if (
        state.status !== "reconnecting" &&
        state.status !== "waiting_for_peer" &&
        state.status !== "connecting"
      ) {
        return state;
      }
      return {
        status: "store_and_forward",
        mode: "text",
        error: null,
        retryAttempt: state.retryAttempt,
      };
    }

    case "MEDIA_ERROR": {
      if (state.status === "ended") return state;
      return { status: "error", mode: "text", error: event.error, retryAttempt: 0 };
    }

    case "END": {
      if (state.status === "idle") return state;
      return { status: "ended", mode: "text", error: null, retryAttempt: 0 };
    }

    case "RESET": {
      return { ...INITIAL_CONSULTATION_STATE };
    }

    default: {
      // Exhaustiveness guard: every event type is handled above.
      const never: never = event;
      void never;
      return state;
    }
  }
}

/** True when the state represents a live media session (video or audio). */
export function isActiveMediaState(state: ConsultationState): boolean {
  return ACTIVE_STATUSES.has(state.status);
}

/** Human-facing session phase, used to pick translated copy (never jargon). */
export function statusMessageKey(
  status: ConsultationStatus
): "consultIdle" | "consultConnecting" | "consultWaitingForPeer" | "consultConnectingPeer" |
   "consultConnected" | "consultWeakConnection" | "consultAudioMode" | "consultReconnecting" |
   "consultOfflineSaved" | "consultEnded" | "consultError" {
  switch (status) {
    case "idle":
      return "consultIdle";
    case "joining":
      return "consultConnecting";
    case "waiting_for_peer":
      return "consultWaitingForPeer";
    case "connecting":
      return "consultConnectingPeer";
    case "connected_video":
      return "consultConnected";
    case "degraded_video":
      return "consultWeakConnection";
    case "connected_audio":
      return "consultAudioMode";
    case "reconnecting":
      return "consultReconnecting";
    case "store_and_forward":
      return "consultOfflineSaved";
    case "ended":
      return "consultEnded";
    case "error":
      return "consultError";
  }
}
