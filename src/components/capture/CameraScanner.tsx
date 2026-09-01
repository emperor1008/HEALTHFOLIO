"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  getCameraPermissionInfo,
  requestCameraPermission,
  openCameraStream,
  stopCameraStream,
  captureFrame,
  isTorchSupported,
  setTorch,
  getCurrentFacingMode,
  switchCamera,
  getCameraCount,
} from "@/lib/capture/camera";
import { analyzeImageQuality } from "@/lib/capture/image-quality";
import { computeFileHash, createPreviewUrl } from "@/lib/capture/image-transform";
import type { CapturedPage, CameraPermissionInfo } from "@/lib/capture/types";

interface CameraScannerProps {
  onCapture: (pages: CapturedPage[]) => void;
  onReady: () => void;
  onCancel: () => void;
  onPageCount: number;
}

export function CameraScanner({
  onCapture,
  onReady,
  onCancel,
  onPageCount,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermissionInfo | null>(null);
  const [cameraCount, setCameraCount] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Initialize camera
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const permInfo = getCameraPermissionInfo();
      if (permInfo.state !== "prompt") {
        if (!cancelled) setPermission(permInfo);
        return;
      }

      const result = await requestCameraPermission();
      if (cancelled) return;

      if (result.state !== "granted") {
        setPermission(result);
        return;
      }

      try {
        const { stream, videoTrack, capabilities } = await openCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const count = await getCameraCount();
        if (!cancelled) {
          setCameraCount(count);
          setFacingMode(getCurrentFacingMode(videoTrack));
          setPermission({ state: "granted", message: "", fallbackAvailable: true });
          setIsReady(true);
          onReady();
        }
      } catch (err) {
        if (!cancelled) {
          setPermission({
            state: "device_not_found",
            message: "No camera was detected. You can upload a PDF or select images instead.",
            fallbackAvailable: true,
          });
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [onReady]);

  // Handle capture
  const handleCapture = useCallback(async () => {
    if (!videoRef.current || capturing) return;

    setCapturing(true);

    try {
      const { blob, width, height } = captureFrame(videoRef.current);
      const imageBlob = await blob;

      const [quality, hash] = await Promise.all([
        analyzeImageQuality(imageBlob),
        computeFileHash(imageBlob),
      ]);

      const page: CapturedPage = {
        id: crypto.randomUUID(),
        pageNumber: 1,
        blob: imageBlob,
        previewUrl: createPreviewUrl(imageBlob),
        width,
        height,
        rotation: 0,
        fileSize: imageBlob.size,
        quality,
        uploadStatus: "pending",
        fileHash: hash,
      };

      onCapture([page]);
    } catch {
      // Capture failed — stay on camera screen
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture]);

  // Handle camera switch
  const handleSwitchCamera = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      const newStream = await switchCamera(streamRef.current, facingMode);
      streamRef.current = newStream;

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }

      const videoTrack = newStream.getVideoTracks()[0];
      setFacingMode(getCurrentFacingMode(videoTrack));
    } catch {
      // Camera switch failed
    }
  }, [facingMode]);

  // Handle torch toggle
  const handleTorchToggle = useCallback(async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    const success = await setTorch(videoTrack, !torchOn);
    if (success) {
      setTorchOn(!torchOn);
    }
  }, [torchOn]);

  // Check torch capability
  const canTorch = useCallback(() => {
    if (!streamRef.current) return false;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return false;
    const capabilities = videoTrack.getCapabilities?.() || {};
    return isTorchSupported(capabilities);
  }, []);

  // Permission denied state
  if (permission && permission.state !== "granted") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface p-6">
        <div className="max-w-sm text-center">
          <div className="text-4xl">📷</div>
          <h2 className="mt-4 text-lg font-semibold text-text-primary">
            Camera unavailable
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {permission.message}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={onCancel}
              className="rounded-card border border-border py-2.5 text-sm font-medium text-text-secondary hover:bg-canvas"
            >
              Choose another option
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Camera header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white">
        <button
          onClick={onCancel}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Close camera"
        >
          ✕
        </button>
        <p className="text-sm font-medium">
          {onPageCount > 0 ? `${onPageCount} page${onPageCount !== 1 ? "s" : ""} captured` : "Position document in frame"}
        </p>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Video preview */}
      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
          aria-label="Camera preview"
        />

        {/* Document guide overlay */}
        <div className="absolute inset-8 border-2 border-white/40 rounded-lg pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-lg" />
        </div>

        <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-white/80">
          Fit the full page inside the frame
        </p>
      </div>

      {/* Camera controls */}
      <div className="flex items-center justify-around p-6 bg-black/80">
        {/* Torch (if supported) */}
        {canTorch() && (
          <button
            onClick={handleTorchToggle}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              torchOn ? "bg-white text-black" : "bg-white/10 text-white"
            }`}
            aria-label={torchOn ? "Turn off flash" : "Turn on flash"}
          >
            💡
          </button>
        )}
        {!canTorch() && <div className="w-12" />}

        {/* Capture button */}
        <button
          onClick={handleCapture}
          disabled={capturing || !isReady}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-95 disabled:opacity-50"
          aria-label="Capture photo"
        >
          <div className="h-12 w-12 rounded-full bg-white" />
        </button>

        {/* Switch camera */}
        {cameraCount > 1 ? (
          <button
            onClick={handleSwitchCamera}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Switch camera"
          >
            🔄
          </button>
        ) : (
          <div className="w-12" />
        )}
      </div>
    </div>
  );
}
