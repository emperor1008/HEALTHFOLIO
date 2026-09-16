"use client";

import { motion, useReducedMotion } from "framer-motion";

interface ProcessingProgressProps {
  stage: string;
  stageIndex?: number;
  documentId?: string;
}

/**
 * The visible journey through Healthfolio's real processing stages.
 * Stages mirror the server pipeline: text reading → classification →
 * extraction → confidence evaluation → organization.
 */
const STAGES = [
  "Reading document",
  "Identifying type",
  "Extracting details",
  "Checking confidence",
  "Organizing your record",
] as const;

const STAGE_ICONS = ["📖", "🔍", "⚙️", "📊", "📁"] as const;

export function ProcessingProgress({
  stage,
  stageIndex = 0,
}: ProcessingProgressProps) {
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.min(
    Math.max(STAGES.indexOf(stage as (typeof STAGES)[number]), stageIndex),
    STAGES.length - 1
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="animate-rise w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl">
        <h3 className="font-semibold text-text-primary">
          Organizing your record
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          This usually takes a few moments. You can keep this open or come back
          to it from Records.
        </p>

        <ol className="mt-5 space-y-3" aria-live="polite">
          {STAGES.map((label, i) => {
            const isDone = i < activeIndex;
            const isActive = i === activeIndex;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm",
                    isDone
                      ? "border-success/30 bg-success/10 text-success"
                      : isActive
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-canvas text-text-secondary/50",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {isDone ? "✓" : STAGE_ICONS[i]}
                </span>
                <span
                  className={[
                    "text-sm",
                    isActive
                      ? "font-medium text-text-primary"
                      : isDone
                      ? "text-text-secondary"
                      : "text-text-secondary/60",
                  ].join(" ")}
                >
                  {label}
                  {isActive && !reduceMotion && (
                    <motion.span
                      className="ml-1 inline-block"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      …
                    </motion.span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Quiet determinate progress bar */}
        <div
          className="mt-5 h-1 w-full overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-valuenow={Math.round(((activeIndex + 1) / STAGES.length) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: "8%" }}
            animate={{
              width: `${Math.round(((activeIndex + 1) / STAGES.length) * 100)}%`,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
}
