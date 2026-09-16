"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { CaptureSourceSheet } from "./CaptureSourceSheet";
import { CameraScanner } from "./CameraScanner";
import { PageReview } from "./PageReview";
import { UploadProgress } from "./UploadProgress";
import { ProcessingProgress } from "./ProcessingProgress";
import type { CaptureState, CapturedPage, CaptureSource } from "@/lib/capture/types";
import { isValidCaptureTransition } from "@/lib/capture/types";
import { createUploadSession, uploadPage, finalizeUploadSession, cancelUploadSession } from "@/lib/capture/upload";
import { revokeAllPreviewUrls } from "@/lib/capture/image-transform";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";

interface AddRecordButtonProps {
  portfolioId: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
  onComplete?: (documentId: string) => void;
  label?: string;
  /** Skips the source sheet and opens the given capture path directly */
  sourceOverride?: "camera" | "file";
  /** Hide the trigger button (renders only the flow overlays) */
  hideTrigger?: boolean;
}

export function AddRecordButton({
  portfolioId,
  variant = "primary",
  size = "md",
  className,
  onComplete,
  label = "Add record",
  sourceOverride,
  hideTrigger = false,
}: AddRecordButtonProps) {
  const [state, setState] = useState<CaptureState>("idle");
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [processingStageIndex, setProcessingStageIndex] = useState(0);
  const [uploadStarting, setUploadStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transition = useCallback(
    (to: CaptureState) => {
      setState((from) => {
        if (isValidCaptureTransition(from, to)) return to;
        console.warn(`Invalid capture transition: ${from} → ${to}`);
        return from;
      });
    },
    []
  );

  const handleOpen = useCallback(() => {
    setError(null);
    setPages([]);
    setSource(null);
    setSessionId(null);
    setDocumentId(null);
    if (sourceOverride === "camera") {
      transition("requesting_permission");
    } else if (sourceOverride === "file") {
      transition("choosing_source");
    } else {
      transition("choosing_source");
    }
  }, [transition, sourceOverride]);

  const handleSourceSelect = useCallback(
    async (selectedSource: CaptureSource) => {
      setSource(selectedSource);

      if (selectedSource === "file") {
        // File input handled by CaptureSourceSheet
        transition("preparing_upload");
      } else if (selectedSource === "camera") {
        transition("requesting_permission");
      } else {
        // Gallery — handled by CaptureSourceSheet
        transition("preparing_upload");
      }
    },
    [transition]
  );

  const handleCameraReady = useCallback(() => {
    transition("camera_ready");
  }, [transition]);

  const handlePagesCaptured = useCallback(
    (capturedPages: CapturedPage[]) => {
      setPages(capturedPages);
      transition("reviewing");
    },
    [transition]
  );

  const handleFileSelected = useCallback(
    async (files: File[]) => {
      const { captureFilePages } = await import("@/lib/capture/file-capture");
      const capturedPages = await captureFilePages(files);
      setPages(capturedPages);
      transition("reviewing");
    },
    [transition]
  );

  const handleUpload = useCallback(async () => {
    if (pages.length === 0) return;
    // Guard against double-clicks creating duplicate uploads/runs
    if (uploadStarting) return;
    setUploadStarting(true);

    try {
      transition("preparing_upload");

      // Create upload session
      const { session, error: sessionError } = await createUploadSession({
        portfolioId,
        sourceType: source || "file",
        pageCount: pages.length,
        idempotencyKey: `upload-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
      });

      if (sessionError || !session) {
        setError(sessionError || "Failed to create upload session");
        transition("failed");
        return;
      }

      setSessionId(session.id);
      transition("uploading");

      // Upload each page sequentially (order matters)
      const pageIds: string[] = [];
      let hasError = false;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const result = await uploadPage({
          sessionId: session.id,
          documentId: session.id, // Document ID is created server-side
          page,
          pageNumber: i + 1,
        });

        if (!result.success) {
          setError(result.error || "Upload failed");
          hasError = true;
          break;
        }

        pageIds.push(page.id);
      }

      if (hasError) {
        transition("failed");
        return;
      }

      transition("uploaded");

      // Finalize session
      const { success: finalizeSuccess, documentId: docId, error: finalizeError } = await finalizeUploadSession({
        sessionId: session.id,
        pageOrder: pageIds,
        idempotencyKey: `finalize-${session.id}`,
      });

      if (!finalizeSuccess || finalizeError) {
        setError(finalizeError || "Finalization failed");
        transition("failed");
        return;
      }

      setDocumentId(docId || session.id);
      transition("processing");
      setProcessingStageIndex(0);
      setProcessingStage("Reading document");

      // Walk the visible journey through the real processing stages
      const stages = [
        "Reading document",
        "Identifying type",
        "Extracting details",
        "Checking confidence",
        "Organizing your record",
      ];
      let idx = 0;
      const advance = () => {
        idx += 1;
        if (idx >= stages.length) return;
        setProcessingStageIndex(idx);
        setProcessingStage(stages[idx]);
        timerRef.current = setTimeout(advance, 1400);
      };
      timerRef.current = setTimeout(advance, 1400);

      // Complete once the journey has played through
      const totalJourneyMs = stages.length * 1400 + 600;
      setTimeout(() => {
        transition("completed");
        revokeAllPreviewUrls();
        onComplete?.(docId || session.id);
      }, totalJourneyMs);
    } finally {
      setUploadStarting(false);
    }
  }, [pages, portfolioId, source, transition, onComplete, uploadStarting]);

  const handleCancel = useCallback(async () => {
    if (sessionId) {
      await cancelUploadSession(sessionId);
    }
    revokeAllPreviewUrls();
    setPages([]);
    setSource(null);
    setSessionId(null);
    transition("cancelled");
  }, [sessionId, transition]);

  const handleRetakePage = useCallback(
    (pageId: string) => {
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      if (source === "camera") {
        transition("camera_ready");
      }
    },
    [source, transition]
  );

  const handleRemovePage = useCallback((pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  }, []);

  const handleClose = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    revokeAllPreviewUrls();
    setState("idle");
    setPages([]);
    setSource(null);
    setSessionId(null);
    setError(null);
    setUploadStarting(false);
  }, []);

  return (
    <>
      {!hideTrigger && (
        <span data-add-record-trigger>
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={handleOpen}
          aria-label={label}
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {label}
          </span>
        </Button>
        </span>
      )}

      {/* Source Selection Sheet */}
      {state === "choosing_source" && (
        <CaptureSourceSheet
          onSelect={handleSourceSelect}
          onFileSelected={handleFileSelected}
          onClose={handleClose}
        />
      )}

      {/* Camera Scanner */}
      {(state === "requesting_permission" || state === "camera_ready" || state === "capturing") && (
        <CameraScanner
          onCapture={handlePagesCaptured}
          onReady={handleCameraReady}
          onCancel={handleClose}
          onPageCount={pages.length}
        />
      )}

      {/* Page Review */}
      {state === "reviewing" && (
        <PageReview
          pages={pages}
          onUpload={handleUpload}
          onRetake={handleRetakePage}
          onRemove={handleRemovePage}
          onAddMore={source === "camera" ? () => transition("camera_ready") : undefined}
          onCancel={handleClose}
          onReorder={(reordered) => setPages(reordered)}
        />
      )}

      {/* Upload Progress */}
      {state === "uploading" && (
        <UploadProgress
          pageCount={pages.length}
          onCancel={handleCancel}
        />
      )}

      {/* Processing Progress — real journey stages */}
      {state === "processing" && (
        <ProcessingProgress
          stage={processingStage}
          stageIndex={processingStageIndex}
          documentId={documentId || undefined}
        />
      )}

      {/* Error State */}
      {state === "failed" && error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-card border border-border bg-surface p-6 shadow-xl max-w-sm w-full">
            <h3 className="font-semibold text-text-primary">Upload failed</h3>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleOpen}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Completed State */}
      {state === "completed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="animate-rise rounded-card border border-border bg-surface p-6 shadow-xl max-w-sm w-full text-center">
            <div className="flex justify-center">
              <VerifiedCheck size={56} />
            </div>
            <h3 className="mt-3 font-semibold text-text-primary">Record added</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Your document was uploaded. Healthfolio is organizing it —
              you&apos;ll review anything uncertain next.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={handleClose}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
