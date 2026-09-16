"use client";

interface UploadProgressProps {
  pageCount: number;
  onCancel: () => void;
}

export function UploadProgress({ pageCount, onCancel }: UploadProgressProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="animate-rise w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div
            className="h-10 w-10 shrink-0 animate-spin rounded-full border-[3px] border-primary border-t-transparent"
            role="status"
            aria-label="Uploading"
          />
          <div>
            <h3 className="font-semibold text-text-primary">
              Uploading document
            </h3>
            <p className="mt-0.5 text-sm text-text-secondary">
              Securely uploading {pageCount} page{pageCount !== 1 ? "s" : ""}…
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {["Checking the file", "Transferring securely", "Storing privately"].map(
            (label) => (
              <p
                key={label}
                className="flex items-center gap-2 text-xs text-text-secondary"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary/60"
                  aria-hidden="true"
                />
                {label}
              </p>
            )
          )}
        </div>

        <button
          onClick={onCancel}
          className="mt-6 min-h-touch w-full rounded-card border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-canvas"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
