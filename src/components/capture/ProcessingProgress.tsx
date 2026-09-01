"use client";

interface ProcessingProgressProps {
  stage: string;
  documentId?: string;
}

const STAGE_LABELS: Record<string, { label: string; icon: string }> = {
  upload_verified: { label: "Upload verified", icon: "✓" },
  reading_document: { label: "Reading document", icon: "📖" },
  identifying_type: { label: "Identifying record type", icon: "🔍" },
  extracting_information: { label: "Extracting information", icon: "⚙️" },
  checking_confidence: { label: "Checking confidence", icon: "📊" },
  waiting_for_review: { label: "Waiting for review", icon: "👀" },
  organizing_record: { label: "Organizing record", icon: "📁" },
  complete: { label: "Processing complete", icon: "✅" },
};

export function ProcessingProgress({ stage, documentId }: ProcessingProgressProps) {
  const stageInfo = STAGE_LABELS[stage] || { label: stage, icon: "⏳" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-card border border-border bg-surface p-6 shadow-xl max-w-sm w-full text-center">
        <div className="text-4xl">{stageInfo.icon}</div>

        <h3 className="mt-4 font-semibold text-text-primary">
          Processing your document
        </h3>
        <p className="mt-2 text-sm text-text-secondary">
          {stageInfo.label}
        </p>

        <div className="mt-4 space-y-1 text-xs text-text-secondary">
          <p>Image quality checked</p>
          {stage !== "upload_verified" && <p>Text extraction completed</p>}
          {stage === "organizing_record" || stage === "complete" ? (
            <p>Document classified</p>
          ) : null}
        </div>

        {documentId && (
          <p className="mt-4 text-xs text-text-secondary opacity-50">
            Document ID: {documentId.substring(0, 8)}…
          </p>
        )}
      </div>
    </div>
  );
}
