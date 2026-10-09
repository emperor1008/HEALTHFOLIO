/**
 * Local media acquisition with explicit, recoverable error mapping.
 *
 * Every failure mode a low-end mobile browser can produce is mapped to a
 * typed error with a patient-readable recovery path:
 *   - unsupported browser / missing mediaDevices → continue by text
 *   - permission denied (NotAllowedError)        → try again / continue by text
 *   - no camera/microphone (NotFoundError)       → continue with audio/text
 *   - device busy (NotReadableError/TrackStart)  → continue with audio/text
 *   - camera constraint unmet (Overconstrained)  → continue with audio
 *
 * Permission is requested ONLY when the user presses Join — never on page
 * load.
 */

import { logConsultationEvent } from "./diagnostics";
import type { ConnectionMode } from "./types";

export type MediaErrorKind =
  | "unsupported"
  | "permission_denied"
  | "device_missing"
  | "device_in_use"
  | "constraint_unmet"
  | "unknown";

export type MediaRecovery = "retry" | "continue_audio" | "continue_text";

export class MediaAcquireError extends Error {
  readonly kind: MediaErrorKind;
  readonly media: "audio" | "video" | "audio+video";
  /** Ordered recovery options, best first. */
  readonly recoveries: readonly MediaRecovery[];

  constructor(
    kind: MediaErrorKind,
    media: "audio" | "video" | "audio+video",
    recoveries: readonly MediaRecovery[]
  ) {
    super(`media_acquire_failed:${kind}`);
    this.name = "MediaAcquireError";
    this.kind = kind;
    this.media = media;
    this.recoveries = recoveries;
  }
}

export interface AcquireMediaOptions {
  video: boolean;
  audio?: boolean;
  /** Target video level constraints (from the adaptation module). */
  videoConstraints?: { width: number; height: number; frameRate: number };
}

/** Map a getUserMedia exception to a typed, recoverable error. */
export function mapGetUserMediaError(
  error: unknown,
  requested: "audio" | "video" | "audio+video"
): MediaAcquireError {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return new MediaAcquireError("permission_denied", requested, [
        "retry",
        requested === "audio" ? "continue_text" : "continue_audio",
        "continue_text",
      ]);
    case "NotFoundError":
    case "DevicesNotFoundError":
      return new MediaAcquireError("device_missing", requested, [
        requested === "audio" ? "continue_text" : "continue_audio",
        "continue_text",
      ]);
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return new MediaAcquireError("device_in_use", requested, [
        "retry",
        requested === "audio" ? "continue_text" : "continue_audio",
        "continue_text",
      ]);
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return new MediaAcquireError("constraint_unmet", requested, [
        "continue_audio",
        "continue_text",
      ]);
    case "TypeError":
      // mediaDevices/getUserMedia missing (insecure context, old browser)
      return new MediaAcquireError("unsupported", requested, ["continue_text"]);
    default:
      return new MediaAcquireError("unknown", requested, [
        "retry",
        "continue_text",
      ]);
  }
}

/** True when this browser can capture audio/video at all. */
export function isMediaCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices === "object" &&
    navigator.mediaDevices !== null &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Acquire the local media stream for the requested mode.
 * Throws MediaAcquireError with a recovery path — callers never see raw
 * DOMException names in the UI.
 */
export async function acquireLocalMedia(
  options: AcquireMediaOptions
): Promise<MediaStream> {
  const requested = options.video ? "audio+video" : "audio";

  if (!isMediaCaptureSupported()) {
    logConsultationEvent("permission_error", { kind: "unsupported", media: requested });
    throw new MediaAcquireError("unsupported", requested, ["continue_text"]);
  }

  const audio = options.audio !== false;
  const media: MediaStreamConstraints = audio ? { audio: true } : {};

  if (options.video) {
    const vc = options.videoConstraints;
    media.video = vc
      ? {
          width: { ideal: vc.width },
          height: { ideal: vc.height },
          frameRate: { ideal: vc.frameRate },
          facingMode: "user",
        }
      : { facingMode: "user" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(media);
    logConsultationEvent("consultation_media_acquired", {
      tracks: stream.getTracks().length,
      mode: options.video ? "video" : "audio",
    });
    return stream;
  } catch (error) {
    // If video capture failed (missing camera / constraint), retry audio-only
    // before reporting failure — audio is the lifeline on low-end devices.
    if (options.video && audio) {
      const mapped = mapGetUserMediaError(error, "audio+video");
      if (mapped.kind === "device_missing" || mapped.kind === "constraint_unmet") {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          logConsultationEvent("consultation_media_acquired", {
            tracks: audioOnly.getTracks().length,
            mode: "audio",
          });
          return audioOnly;
        } catch (audioError) {
          const audioMapped = mapGetUserMediaError(audioError, "audio");
          logConsultationEvent("permission_error", {
            kind: audioMapped.kind,
            media: "audio",
          });
          throw audioMapped;
        }
      }
      logConsultationEvent("permission_error", { kind: mapped.kind, media: requested });
      throw mapped;
    }
    const mapped = mapGetUserMediaError(error, requested);
    logConsultationEvent("permission_error", { kind: mapped.kind, media: requested });
    throw mapped;
  }
}

/** Stop every track on a stream (idempotent). */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // already stopped
    }
  }
}

/** Enable/disable the audio track (mute). No-op when absent. */
export function setMicrophoneEnabled(stream: MediaStream | null, enabled: boolean): void {
  const track = stream?.getAudioTracks()[0];
  if (track) track.enabled = enabled;
}

/** Enable/disable the video track (camera off). No-op when absent. */
export function setCameraEnabled(stream: MediaStream | null, enabled: boolean): void {
  const track = stream?.getVideoTracks()[0];
  if (track) track.enabled = enabled;
}

/** Mode implied by the tracks a stream actually carries. */
export function modeForStream(stream: MediaStream | null): ConnectionMode {
  if (!stream) return "text";
  return stream.getVideoTracks().length > 0 ? "video" : "audio";
}
