"use client";

interface UploadProgressProps {
  pageCount: number;
  onCancel: () => void;
}

export function UploadProgress({ pageCount, onCancel }: UploadProgressProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-card border border-border bg-surface p-6 shadow-xl max-w-sm w-full text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />

        <h3 className="mt-4 font-semibold text-text-primary">
          Uploading document
        </h3>
        <p className="mt-2 text-sm text-text-secondary">
          Securely uploading {pageCount} page{pageCount !== 1 ? "s" : ""}…
        </p>

        <div className="mt-4 space-y-1 text-xs text-text-secondary">
          <p>• Validating file signatures</p>
          <p>• Encrypting transfer</p>
          <p>• Storing in private vault</p>
        </div>

        <button
          onClick={onCancel}
          className="mt-6 rounded-card border border-border px-4 py-2 text-sm text-text-secondary hover:bg-canvas"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
