"use client";

import { getQualityLabel, getQualityColor } from "@/lib/capture/image-quality";
import type { PageQualityResult, QualityStatus } from "@/lib/capture/types";

interface ImageQualityNoticeProps {
  quality: PageQualityResult;
  compact?: boolean;
}

export function ImageQualityNotice({ quality, compact }: ImageQualityNoticeProps) {
  if (quality.status === "acceptable" && quality.warnings.length === 0) {
    if (compact) return null;
    return (
      <div className="flex items-center gap-2 text-xs text-success" role="status">
        <span aria-hidden="true">✓</span>
        <span>{getQualityLabel(quality.status)}</span>
      </div>
    );
  }

  const label = getQualityLabel(quality.status);
  const colorClass = getQualityColor(quality.status);

  return (
    <div
      className={`rounded-card border p-3 ${
        quality.status === "unusable"
          ? "border-error/20 bg-error/5"
          : "border-warning/20 bg-warning/5"
      }`}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <span className={`text-sm font-medium ${colorClass}`}>
          {quality.status === "unusable" ? "⚠️" : "⚡"}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${colorClass}`}>{label}</p>
          {quality.warnings.map((warning, i) => (
            <p key={i} className="mt-1 text-xs text-text-secondary">
              {warning}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
