/**
 * Camera service: permission detection, stream management, frame capture, cleanup.
 *
 * Rules:
 * - Camera opens only after explicit user action.
 * - Stop all tracks when camera closes.
 * - Never leave camera indicator active.
 * - Handle iOS Safari quirks.
 * - Prefer rear camera.
 */

import type { CameraPermissionState, CameraPermissionInfo } from "./types";

// ─── Permission Detection ────────────────────────────────────────────────

export function getCameraPermissionInfo(): CameraPermissionInfo {
  // Insecure context
  if (typeof window === "undefined") {
    return {
      state: "unavailable",
      message: "Camera access requires HTTPS or localhost.",
      fallbackAvailable: true,
    };
  }

  if (!window.isSecureContext) {
    return {
      state: "insecure_context",
      message:
        "Camera access requires HTTPS or localhost. You can still upload an existing file.",
      fallbackAvailable: true,
    };
  }

  // No MediaDevices API
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      state: "unavailable",
      message:
        "Camera access is not supported in this browser. You can upload a PDF or select images instead.",
      fallbackAvailable: true,
    };
  }

  return {
    state: "prompt",
    message: "",
    fallbackAvailable: true,
  };
}

export async function requestCameraPermission(): Promise<CameraPermissionInfo> {
  const preCheck = getCameraPermissionInfo();
  if (preCheck.state === "unavailable" || preCheck.state === "insecure_context") {
    return preCheck;
  }

  try {
    // Request a temporary stream to check permission
    const tempStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });

    // Got permission — stop the temp stream immediately
    tempStream.getTracks().forEach((track) => track.stop());

    return {
      state: "granted",
      message: "",
      fallbackAvailable: true,
    };
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        return {
          state: "denied",
          message:
            "Camera access is blocked. Allow camera permission in your browser settings, or choose photos from your device.",
          fallbackAvailable: true,
        };
      }
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        return {
          state: "device_not_found",
          message:
            "No camera was detected. You can upload a PDF or select images instead.",
          fallbackAvailable: true,
        };
      }
      if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        return {
          state: "device_busy",
          message:
            "The camera may be in use by another application. Close that application and try again.",
          fallbackAvailable: true,
        };
      }
    }

    return {
      state: "unavailable",
      message: "Could not access the camera. You can upload a file instead.",
      fallbackAvailable: true,
    };
  }
}

// ─── Stream Management ───────────────────────────────────────────────────

export interface CameraStream {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  capabilities: MediaTrackCapabilities;
}

export async function openCameraStream(): Promise<CameraStream> {
  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const videoTrack = stream.getVideoTracks()[0];

  if (!videoTrack) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("CAMERA_NO_VIDEO_TRACK");
  }

  const capabilities = videoTrack.getCapabilities?.() || {};

  return { stream, videoTrack, capabilities };
}

export function stopCameraStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    if (track.readyState === "live") {
      track.stop();
    }
  });
}

export function stopAllTracks(videoElement: HTMLVideoElement | null): void {
  if (!videoElement?.srcObject) return;
  const stream = videoElement.srcObject as MediaStream;
  stream.getTracks().forEach((track) => {
    if (track.readyState === "live") {
      track.stop();
    }
  });
  videoElement.srcObject = null;
}

// ─── Frame Capture ───────────────────────────────────────────────────────

export function captureFrame(
  videoElement: HTMLVideoElement,
  options?: { quality?: number; format?: string }
): { blob: Promise<Blob>; width: number; height: number } {
  const { videoWidth, videoHeight } = videoElement;

  if (!videoWidth || !videoHeight) {
    throw new Error("CAMERA_FRAME_NOT_READY");
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("CAMERA_CANVAS_FAILED");
  }

  ctx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);

  const format = options?.format || "image/jpeg";
  const quality = options?.quality || 0.92;

  const blobPromise = new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("CAPTURE_FAILED"));
        }
      },
      format,
      quality
    );
  });

  return { blob: blobPromise, width: videoWidth, height: videoHeight };
}

// ─── Torch Control ───────────────────────────────────────────────────────

export function isTorchSupported(capabilities: MediaTrackCapabilities): boolean {
  // torch may not be in the standard type definition
  return "torch" in capabilities;
}

export async function setTorch(
  videoTrack: MediaStreamTrack,
  enabled: boolean
): Promise<boolean> {
  try {
    await videoTrack.applyConstraints({
      advanced: [{ torch: enabled } as any],
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Camera Facing Mode ──────────────────────────────────────────────────

export async function switchCamera(
  currentStream: MediaStream,
  currentFacingMode: "user" | "environment"
): Promise<MediaStream> {
  // Stop current tracks
  currentStream.getTracks().forEach((t) => t.stop());

  const newFacingMode: "user" | "environment" = currentFacingMode === "user" ? "environment" : "user";

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: newFacingMode as string,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  return stream;
}

export function getCurrentFacingMode(
  videoTrack: MediaStreamTrack
): "user" | "environment" {
  const settings = videoTrack.getSettings();
  return (settings.facingMode as "user" | "environment") || "environment";
}

// ─── Multiple Camera Detection ───────────────────────────────────────────

export async function getCameraCount(): Promise<number> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").length;
  } catch {
    return 0;
  }
}
