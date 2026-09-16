"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeletons";
import { PageTransition, CardHover } from "@/components/ui/PageTransition";

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

  const loadSummary = useCallback(async (filter: TimeFilter) => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
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

        {/* Safety notice */}
        <Card padding="md" className="border-border/50 bg-canvas/60">
          <p className="text-xs leading-relaxed text-text-secondary">
            Healthfolio compares values against the reference ranges printed on
            your reports. It does not diagnose conditions or replace a qualified
            healthcare professional.
          </p>
        </Card>
      </div>
    </PageTransition>
  );
}
