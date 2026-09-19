"use client";

/**
 * JourneyStatus — the unified patient journey view (Part 5).
 * Renders ONLY real state derived from `deriveJourney` (queue + server rows).
 * Includes timestamps when genuinely known, safe retry actions, aria-live
 * announcements, 44px targets, icon+text buttons, reduced-motion-safe styling.
 */

import { useMemo } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { getJourneyDict } from "@/lib/journey/dict";
import { currentJourneyStep, type JourneyStep, type JourneyStepState } from "@/lib/journey/status";
import { Button } from "@/components/ui/Button";

function formatWhen(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(lang === "or" ? "or-IN" : lang === "hi" ? "hi-IN" : "en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

const STATE_DOT_CLASS: Record<JourneyStepState, string> = {
  done: "bg-success",
  current: "bg-primary",
  waiting: "bg-text-secondary",
  attention: "bg-terracotta",
  not_started: "bg-border",
};

const STATE_ICON: Record<JourneyStepState, string> = {
  done: "✓",
  current: "•",
  waiting: "…",
  attention: "!",
  not_started: "○",
};

export function JourneyStatus({
  steps,
  onRetry,
}: {
  steps: JourneyStep[];
  onRetry?: () => void;
}) {
  const { language } = useLanguage();
  const t = getJourneyDict(language);

  const current = useMemo(() => currentJourneyStep(steps), [steps]);
  const liveText = current
    ? `${t.liveRegionIntro}: ${t.steps[current.key]?.label ?? current.key} — ${
        current.state === "attention" ? t.stateAttention : t.stateCurrent
      }`
    : "";

  return (
    <section aria-label={t.title} className="w-full">
      {/* aria-live: announced when the current step changes */}
      <p aria-live="polite" className="sr-only">
        {liveText}
      </p>
      <h2 className="text-lg font-semibold text-forest-900">{t.title}</h2>
      <ol className="mt-3 space-y-0">
        {steps.map((step, idx) => {
          const entry = t.steps[step.key] ?? { label: step.key, hint: "" };
          const when = formatWhen(step.at, language);
          const isAttention = step.state === "attention";
          return (
            <li key={`${step.key}-${idx}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${STATE_DOT_CLASS[step.state]}`}
                >
                  {STATE_ICON[step.state]}
                </span>
                {idx < steps.length - 1 && (
                  <span aria-hidden="true" className="w-px flex-1 bg-border" />
                )}
              </div>
              <div className="min-h-11 flex-1 pb-5">
                <div className="flex flex-wrap items-center gap-x-2">
                  <p className={`font-medium ${isAttention ? "text-terracotta" : "text-forest-900"}`}>
                    {entry.label}
                  </p>
                  <span className="sr-only">
                    {step.state === "done"
                      ? t.stateDone
                      : step.state === "attention"
                        ? t.stateAttention
                        : step.state === "not_started"
                          ? t.stateNotStarted
                          : t.stateCurrent}
                  </span>
                  {when && (
                    <time className="text-xs text-forest-600" dateTime={step.at ?? undefined}>
                      {when}
                    </time>
                  )}
                </div>
                {step.state !== "not_started" && entry.hint && (
                  <p className="text-sm text-forest-700">{entry.hint}</p>
                )}
                {isAttention && step.retryable && onRetry && (
                  <div className="mt-2 flex gap-2">
                    <Button onClick={onRetry} className="min-h-11">
                      ↻ {t.retry}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
