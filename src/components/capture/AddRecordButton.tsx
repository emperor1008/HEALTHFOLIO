"use client";

import { useState, useCallback } from "react";
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

interface AddRecordButtonProps {
  portfolioId: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
  onComplete?: (documentId: string) => void;
  label?: string;
}

export function AddRecordButton({
  portfolioId,
  variant = "primary",
  size = "md",
  className,
  onComplete,
  label = "Add record",
}: AddRecordButtonProps) {
  const [state, setState] = useState<CaptureState>("idle");
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

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
    transition("choosing_source");
  }, [transition]);

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

    // Upload each page
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
    const { documentId: docId, error: finalizeError } = await finalizeUploadSession({
      sessionId: session.id,
      pageOrder: pageIds,
      idempotencyKey: `finalize-${session.id}`,
    });

    if (finalizeError) {
      setError(finalizeError);
      transition("failed");
      return;
    }

    setDocumentId(docId || session.id);
    transition("processing");
    setProcessingStage("Document uploaded successfully. Processing...");

    // Wait briefly then complete
    setTimeout(() => {
      transition("completed");
      revokeAllPreviewUrls();
      onComplete?.(docId || session.id);
    }, 2000);
  }, [pages, portfolioId, source, transition, onComplete]);

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
    revokeAllPreviewUrls();
    setState("idle");
    setPages([]);
    setSource(null);
    setSessionId(null);
    setError(null);
  }, []);

  return (
    <>
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

      {/* Processing Progress */}
      {state === "processing" && (
        <ProcessingProgress
          stage={processingStage}
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
          <div className="rounded-card border border-border bg-surface p-6 shadow-xl max-w-sm w-full text-center">
            <div className="text-4xl">✅</div>
            <h3 className="mt-3 font-semibold text-text-primary">Record uploaded</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Your document has been uploaded and is being processed.
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
