"use client";

import { useRef, useCallback, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CAPTURE_SOURCES, MAX_FILE_SIZE } from "@/lib/capture/types";

interface CaptureSourceSheetProps {
  onSelect: (source: "camera" | "gallery" | "file") => void;
  onFileSelected: (files: File[]) => void;
  onClose: () => void;
}

const ACCEPTED_LABEL = `PDF, JPEG, PNG or WebP · up to ${Math.round(
  MAX_FILE_SIZE / (1024 * 1024)
)} MB`;

export function CaptureSourceSheet({
  onSelect,
  onFileSelected,
  onClose,
}: CaptureSourceSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // Focus trap and escape handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    sheetRef.current?.querySelector<HTMLElement>("button")?.focus();
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
    (source: "camera" | "gallery" | "file") => {
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add a medical record"
    >
      <motion.div
        ref={sheetRef}
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="w-full rounded-t-card border border-border bg-surface p-6 shadow-xl sm:max-w-md sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">
          Add a medical record
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {ACCEPTED_LABEL}. Your files remain private.
        </p>

        <div className="mt-6 space-y-3">
          {CAPTURE_SOURCES.map((option) => (
            <button
              key={option.source}
              onClick={() => handleSourceClick(option.source)}
              className="flex min-h-touch w-full items-center gap-4 rounded-card border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="text-2xl" aria-hidden="true">
                {option.icon}
              </span>
              <div className="min-w-0">
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
          className="mt-4 min-h-touch w-full rounded-card border border-border py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-canvas"
        >
          Cancel
        </button>

        {/* Hidden file inputs — accept only types the backend validates */}
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
      </motion.div>
    </div>
  );
}
