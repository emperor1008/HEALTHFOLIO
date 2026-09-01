"use client";

import { useState, useCallback } from "react";
import { rotateImage } from "@/lib/capture/image-transform";
import { getQualityLabel, getQualityColor } from "@/lib/capture/image-quality";
import { ImageQualityNotice } from "./ImageQualityNotice";
import type { CapturedPage } from "@/lib/capture/types";

interface PageReviewProps {
  pages: CapturedPage[];
  onUpload: () => void;
  onRetake: (pageId: string) => void;
  onRemove: (pageId: string) => void;
  onAddMore?: () => void;
  onCancel: () => void;
  onReorder: (pages: CapturedPage[]) => void;
}

export function PageReview({
  pages,
  onUpload,
  onRetake,
  onRemove,
  onAddMore,
  onCancel,
  onReorder,
}: PageReviewProps) {
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleRotate = useCallback(
    async (pageId: string, direction: "left" | "right") => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;

      const degrees = direction === "right" ? 90 : 270;
      const newRotation = ((page.rotation + degrees) % 360) as 0 | 90 | 180 | 270;

      try {
        const { blob } = await rotateImage(page.blob, newRotation);

        onReorder(
          pages.map((p) =>
            p.id === pageId
              ? { ...p, blob, rotation: newRotation }
              : p
          )
        );
      } catch {
        // Rotation failed — keep original
      }
    },
    [pages, onReorder]
  );

  const handleMovePage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= pages.length) return;

      const newPages = [...pages];
      const [moved] = newPages.splice(fromIndex, 1);
      newPages.splice(toIndex, 0, moved);

      // Update page numbers
      const reordered = newPages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
      onReorder(reordered);
    },
    [pages, onReorder]
  );

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        handleMovePage(dragIndex, index);
      }
    },
    [dragIndex, handleMovePage]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  const hasWarnings = pages.some(
    (p) => p.quality.status === "warning" || p.quality.status === "retake_recommended"
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <button
          onClick={onCancel}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
        <h2 className="font-semibold text-text-primary">
          Review pages ({pages.length})
        </h2>
        <div className="w-16" />
      </div>

      {/* Quality warnings */}
      {hasWarnings && (
        <div className="border-b border-warning/20 bg-warning/5 p-3">
          <p className="text-sm text-warning font-medium">
            Some pages may have quality issues
          </p>
        </div>
      )}

      {/* Page thumbnails */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {pages.map((page, index) => (
            <div
              key={page.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`relative rounded-card border overflow-hidden cursor-move transition-all ${
                dragIndex === index
                  ? "opacity-50 border-primary"
                  : "border-border"
              }`}
            >
              {/* Thumbnail */}
              <div
                className="aspect-[3/4] bg-canvas flex items-center justify-center"
                onClick={() => setSelectedPage(page.id)}
              >
                {page.blob.type === "application/pdf" ? (
                  <div className="text-center p-2">
                    <span className="text-3xl">📄</span>
                    <p className="mt-1 text-xs text-text-secondary">PDF</p>
                  </div>
                ) : (
                  <img
                    src={page.previewUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Page number */}
              <div className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-medium text-white">
                {page.pageNumber}
              </div>

              {/* Quality indicator */}
              {page.quality.status !== "acceptable" && (
                <div
                  className={`absolute top-2 right-2 flex h-6 items-center rounded-full px-2 text-xs font-medium ${
                    page.quality.status === "unusable"
                      ? "bg-error/90 text-white"
                      : "bg-warning/90 text-white"
                  }`}
                >
                  {page.quality.status === "unusable" ? "⚠" : "!"}
                </div>
              )}

              {/* Page actions */}
              <div className="flex items-center justify-between bg-canvas p-2">
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRotate(page.id, "left");
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-xs text-text-secondary hover:bg-border"
                    aria-label="Rotate left"
                  >
                    ↺
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRotate(page.id, "right");
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-xs text-text-secondary hover:bg-border"
                    aria-label="Rotate right"
                  >
                    ↻
                  </button>
                </div>
                <div className="flex gap-1">
                  {index > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePage(index, index - 1);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-xs text-text-secondary hover:bg-border"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                  )}
                  {index < pages.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePage(index, index + 1);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-xs text-text-secondary hover:bg-border"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(page.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-xs text-error hover:bg-error/10"
                    aria-label="Remove page"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border p-4">
        <div className="flex gap-2">
          {onAddMore && (
            <button
              onClick={onAddMore}
              className="rounded-card border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-canvas"
            >
              + Add page
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-card border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-canvas"
          >
            Cancel
          </button>
          <button
            onClick={onUpload}
            disabled={pages.length === 0 || pages.some((p) => p.quality.status === "unusable")}
            className="rounded-card bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Upload and process
          </button>
        </div>
      </div>

      {/* Full preview modal */}
      {selectedPage && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPage(null)}
        >
          <div className="max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const page = pages.find((p) => p.id === selectedPage);
              if (!page || page.blob.type === "application/pdf") return null;
              return (
                <img
                  src={page.previewUrl}
                  alt={`Page ${page.pageNumber} full preview`}
                  className="max-w-full max-h-[80vh] object-contain rounded"
                />
              );
            })()}
            <button
              onClick={() => setSelectedPage(null)}
              className="mt-4 w-full rounded-card bg-white/10 py-2.5 text-sm font-medium text-white"
            >
              Close preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
