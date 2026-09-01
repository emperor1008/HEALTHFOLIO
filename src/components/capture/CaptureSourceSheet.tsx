"use client";

import { useRef, useCallback, useEffect } from "react";
import { CAPTURE_SOURCES, type CaptureSource } from "@/lib/capture/types";

interface CaptureSourceSheetProps {
  onSelect: (source: CaptureSource) => void;
  onFileSelected: (files: File[]) => void;
  onClose: () => void;
}

export function CaptureSourceSheet({
  onSelect,
  onFileSelected,
  onClose,
}: CaptureSourceSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelected(Array.from(files));
        onClose();
      }
    },
    [onFileSelected, onClose]
  );

  const handleSourceClick = useCallback(
    (source: CaptureSource) => {
      if (source === "file") {
        fileInputRef.current?.click();
      } else if (source === "gallery") {
        galleryInputRef.current?.click();
      } else {
        onSelect(source);
      }
    },
    [onSelect]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add a medical record"
    >
      <div
        ref={sheetRef}
        className="w-full sm:max-w-md rounded-t-card sm:rounded-card border border-border bg-surface p-6 shadow-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">
          Add a medical record
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          PDF, JPEG, PNG or WebP. Your files remain private.
        </p>

        <div className="mt-6 space-y-3">
          {CAPTURE_SOURCES.map((option) => (
            <button
              key={option.source}
              onClick={() => handleSourceClick(option.source)}
              className="flex w-full items-center gap-4 rounded-card border border-border p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <span className="text-2xl" aria-hidden="true">
                {option.icon}
              </span>
              <div>
                <p className="font-medium text-text-primary">{option.label}</p>
                <p className="text-sm text-text-secondary">
                  {option.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-card border border-border py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-canvas"
        >
          Cancel
        </button>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpeg,.jpg,.png,.webp"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Select PDF or image file"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
          aria-label="Select images from gallery"
        />
      </div>
    </div>
  );
}
