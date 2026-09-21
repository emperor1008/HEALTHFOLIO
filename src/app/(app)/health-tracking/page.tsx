"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeletons";
import { PageTransition, CardHover } from "@/components/ui/PageTransition";
import {
  fetchSignalsByStatus,
  applySignalAction,
  reevaluateSignal,
  type SignalRow,
} from "@/lib/signals/client";
import { describeSignal } from "@/lib/signals/wording";

const SignalEvidencePanel = dynamic(
  () => import("@/components/signals/SignalEvidencePanel").then((m) => m.SignalEvidencePanel),
  { ssr: false }
);

interface TrendSummary {
  normalizedTestName: string;
  normalizedUnit: string | null;
  latestValue: number;
  latestDate: string;
  previousValue: number | null;
  previousDate: string | null;
  absoluteChange: number | null;
  percentChange: number | null;
  changeDirection: "increased" | "decreased" | "unchanged" | "insufficient_data";
  totalMeasurements: number;
  graphableMeasurements: number;
  earliestDate: string | null;
}

interface LatestMeasurement {
  normalizedTestName: string;
  normalizedUnit: string | null;
  latestValue: number | null;
  latestTextValue: string | null;
  calculatedStatus: string;
  observedAt: string | null;
  documentId: string;
  pageNumber: number;
  measurementId: string;
}

interface Summary {
  totalTests: number;
  totalMeasurements: number;
  pendingReview: number;
  trends: TrendSummary[];
  latestMeasurements: LatestMeasurement[];
}

type TimeFilter = "1w" | "1m" | "3m" | "all";

const TIME_FILTERS: Array<{ label: string; value: TimeFilter }> = [
  { label: "Week", value: "1w" },
  { label: "Month", value: "1m" },
  { label: "3 months", value: "3m" },
  { label: "All time", value: "all" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  within_range: { label: "Within the report's range", color: "text-success" },
  above_range: {
    label: "Above the report's range",
    color: "text-warning",
  },
  below_range: {
    label: "Below the report's range",
    color: "text-warning",
  },
  report_marked_abnormal: { label: "Flagged on the report", color: "text-error" },
  cannot_determine: { label: "Needs review", color: "text-text-secondary" },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function ChangeIndicator({ change }: { change: TrendSummary["changeDirection"] }) {
  switch (change) {
    case "increased":
      return <span className="text-warning">↑ changed</span>;
    case "decreased":
      return <span className="text-success">↓ changed</span>;
    case "unchanged":
      return <span className="text-text-secondary">→ unchanged</span>;
    default:
      return <span className="text-text-secondary">—</span>;
  }
}

export default function HealthTrackingPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [signals, setSignals] = useState<SignalRow[] | null>(null);
  const [signalsError, setSignalsError] = useState(false);
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [evidenceSignalId, setEvidenceSignalId] = useState<string | null>(null);

  const loadSummary = useCallback(async (filter: TimeFilter) => {
    setLoading(true);
    setError(null);

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("AUTH_REQUIRED");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/health-tracking?timeFilter=${filter}`);
      const json = await response.json();

      if (json.error) {
        setError(json.error.code);
      } else {
        setSummary(json.data);
      }
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(timeFilter);
  }, [timeFilter, loadSummary]);

  const loadSignals = useCallback(async () => {
    setSignalsError(false);
    try {
      const rows = await fetchSignalsByStatus(["draft", "acknowledged", "saved_for_later"], 20);
      setSignals(rows);
    } catch {
      setSignalsError(true);
      setSignals([]);
    }
  }, []);

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  async function signalAction(signal: SignalRow, action: "acknowledge" | "dismiss" | "save_for_later") {
    if (pendingSignalId) return;
    setPendingSignalId(signal.id);
    try {
      await applySignalAction(signal.id, action);
      setSignals((prev) =>
        prev
          ? action === "dismiss"
            ? prev.filter((s) => s.id !== signal.id)
            : prev.map((s) =>
                s.id === signal.id ? { ...s, lifecycle_status: action === "acknowledge" ? "acknowledged" : "saved_for_later" } : s
              )
          : prev
      );
    } catch {
      setSignalsError(true);
    } finally {
      setPendingSignalId(null);
    }
  }

  async function reevaluate(signal: SignalRow) {
    if (pendingSignalId) return;
    setPendingSignalId(signal.id);
    try {
      await reevaluateSignal(signal.id);
      await loadSignals();
    } catch {
      setSignalsError(true);
    } finally {
      setPendingSignalId(null);
    }
  }

  if (loading && !summary) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-80" />
        </div>
        <SkeletonList count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="heading-luxury text-2xl md:text-3xl">Track</h1>
        </div>
        <EmptyState
          icon="🌤"
          title="We couldn't load your health tracking right now"
          description="This is usually a connection issue. Nothing was changed."
          action={{
            label: "Try again",
            onClick: () => loadSummary(timeFilter),
          }}
        />
      </div>
    );
  }

  const hasData = summary && summary.totalMeasurements > 0;
  const hasTrends = summary && summary.trends.length > 0;
  const hasPending = summary && summary.pendingReview > 0;

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="heading-luxury text-2xl md:text-3xl">Track</h1>
          <p className="mt-1 text-text-secondary">
            Trends from your verified medical reports — every value links back
            to its source document.
          </p>
        </div>

        {/* Time filter */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Time range">
          {TIME_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setTimeFilter(filter.value)}
              aria-pressed={timeFilter === filter.value}
              className={`min-h-touch rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                timeFilter === filter.value
                  ? "bg-primary text-white"
                  : "border border-border bg-surface text-text-secondary hover:border-primary/30"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {!hasData && (
          <EmptyState
            icon="📊"
            title="No verified health trends yet"
            description="Once your report values are confirmed, they appear here so you can follow them over time."
            action={{
              label: "Add a record",
              onClick: () => {
                window.location.href = "/records";
              },
            }}
          />
        )}

        {/* Pending review */}
        {hasPending && (
          <Card padding="md" className="border-terracotta-border bg-terracotta-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Measurements awaiting review
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {summary!.pendingReview} measurement
                  {summary!.pendingReview !== 1 ? "s" : ""} need your
                  confirmation before they appear in trends.
                </p>
              </div>
              <Link href="/review">
                <Button variant="secondary" size="sm">
                  Review
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Latest measurements */}
        {hasData && summary!.latestMeasurements.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Latest verified values
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {summary!.latestMeasurements.map((m) => {
                const statusInfo =
                  STATUS_LABELS[m.calculatedStatus] || STATUS_LABELS.cannot_determine;
                return (
                  <CardHover key={m.normalizedTestName}>
                    <Link
                      href={`/health-tracking/tests/${encodeURIComponent(m.normalizedTestName)}`}
                    >
                      <Card
                        padding="md"
                        className="cursor-pointer transition-colors hover:border-primary/30"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-text-primary capitalize">
                              {m.normalizedTestName.replace(/_/g, " ")}
                            </p>
                            <p className="mt-0.5 text-sm text-text-secondary">
                              {m.latestValue !== null
                                ? `${m.latestValue}${m.normalizedUnit ? ` ${m.normalizedUnit}` : ""}`
                                : "Text result"}
                              {m.observedAt && (
                                <span className="ml-2">· {formatDate(m.observedAt)}</span>
                              )}
                            </p>
                          </div>
                          <span className={`text-right text-xs font-medium ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  </CardHover>
                );
              })}
            </div>
          </div>
        )}

        {/* Available trends */}
        {hasTrends && (
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Trends over time
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Tests with two or more verified measurements
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {summary!.trends.map((trend) => (
                <CardHover key={trend.normalizedTestName}>
                  <Link
                    href={`/health-tracking/tests/${encodeURIComponent(trend.normalizedTestName)}`}
                  >
                    <Card
                      padding="md"
                      className="cursor-pointer transition-colors hover:border-primary/30"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-text-primary capitalize">
                            {trend.normalizedTestName.replace(/_/g, " ")}
                          </p>
                          <p className="mt-0.5 text-sm text-text-secondary">
                            {trend.graphableMeasurements} data points
                            {trend.earliestDate && (
                              <span> · since {formatDate(trend.earliestDate)}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-text-primary">
                            {trend.latestValue}
                            {trend.normalizedUnit ? ` ${trend.normalizedUnit}` : ""}
                          </p>
                          <ChangeIndicator change={trend.changeDirection} />
                        </div>
                      </div>
                    </Card>
                  </Link>
                </CardHover>
              ))}
            </div>
          </div>
        )}

        {/* Health Signals */}
        <section aria-labelledby="signals-heading">
          <h2 id="signals-heading" className="text-lg font-semibold text-text-primary">
            Health Signals
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Factual comparisons between your verified results. Nothing here is
            a medical judgment.
          </p>

          {!signals ? (
            <div className="mt-4 space-y-3" aria-hidden="true">
              <Card padding="md"><div className="skeleton h-16 w-full" /></Card>
              <Card padding="md"><div className="skeleton h-16 w-full" /></Card>
            </div>
          ) : signalsError ? (
            <Card padding="md" className="mt-4">
              <p className="text-sm text-text-secondary">
                Health signals are temporarily unavailable. Try again.
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={loadSignals}>
                Try again
              </Button>
            </Card>
          ) : signals.length === 0 ? (
            <Card padding="md" className="mt-4">
              <p className="text-sm text-text-secondary">
                Verified measurements will appear here after you add and review health records.
              </p>
            </Card>
          ) : (
            <div className="mt-4 space-y-3">
              {signals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  busy={pendingSignalId === signal.id}
                  showAllActions
                  onAcknowledge={() => signalAction(signal, "acknowledge")}
                  onSaveForLater={() => signalAction(signal, "save_for_later")}
                  onDismiss={() => signalAction(signal, "dismiss")}
                  onReevaluate={() => reevaluate(signal)}
                  onOpenEvidence={() => setEvidenceSignalId(signal.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Safety notice */}
        <Card padding="md" className="border-border/50 bg-canvas/60">
          <p className="text-xs leading-relaxed text-text-secondary">
            Healthfolio compares values against the reference ranges printed on
            your reports. It does not diagnose conditions or replace a qualified
            healthcare professional.
          </p>
        </Card>
      </div>
      {evidenceSignalId && (() => {
        const signal = signals?.find((s) => s.id === evidenceSignalId);
        if (!signal) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-canvas p-4 shadow-xl sm:rounded-2xl">
              <SignalEvidencePanel
                latestMeasurementId={signal.latest_measurement_id}
                baselineMeasurementId={signal.baseline_measurement_id}
                onClose={() => setEvidenceSignalId(null)}
              />
            </div>
          </div>
        );
      })()}
    </PageTransition>
  );
}

function SignalCard({
  signal,
  busy,
  showAllActions = false,
  onAcknowledge,
  onSaveForLater,
  onDismiss,
  onReevaluate,
  onOpenEvidence,
}: {
  signal: SignalRow;
  busy: boolean;
  showAllActions?: boolean;
  onAcknowledge: () => void;
  onSaveForLater: () => void;
  onDismiss: () => void;
  onReevaluate?: () => void;
  onOpenEvidence: () => void;
}) {
  const copy = describeSignal(signal.signal_type as never, signal.display_name, signal.payload);
  const statusLabel: Record<string, string> = {
    draft: "New",
    acknowledged: "Acknowledged",
    saved_for_later: "Saved for later",
    dismissed: "Dismissed",
    archived: "Archived",
  };

  return (
    <Card padding="md" className="transition-colors hover:border-primary/30">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">{copy.headline}</h3>
            <p className="mt-0.5 text-xs text-text-secondary">{signal.display_name}</p>
          </div>
          <Badge variant={signal.lifecycle_status === "draft" ? "info" : "default"}>
            {statusLabel[signal.lifecycle_status] ?? "New"}
          </Badge>
        </div>

        <ul className="space-y-1 text-sm text-text-secondary">
          {copy.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onOpenEvidence}>
            View evidence
          </Button>
          <Button size="sm" onClick={onAcknowledge} disabled={busy}>
            Acknowledge
          </Button>
          {showAllActions && (
            <>
              <Button variant="secondary" size="sm" onClick={onSaveForLater} disabled={busy}>
                Save for later
              </Button>
              <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
                Dismiss
              </Button>
              {onReevaluate && (
                <Button variant="ghost" size="sm" onClick={onReevaluate} disabled={busy}>
                  Re-evaluate comparison
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
