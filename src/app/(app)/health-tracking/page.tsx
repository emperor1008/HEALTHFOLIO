"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

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

type TimeFilter = "1m" | "3m" | "6m" | "1y" | "all";

const TIME_FILTERS: Array<{ label: string; value: TimeFilter }> = [
  { label: "1 month", value: "1m" },
  { label: "3 months", value: "3m" },
  { label: "6 months", value: "6m" },
  { label: "1 year", value: "1y" },
  { label: "All records", value: "all" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  within_range: { label: "Within range", color: "text-success" },
  above_range: { label: "Above range", color: "text-warning" },
  below_range: { label: "Below range", color: "text-warning" },
  report_marked_abnormal: { label: "Abnormal", color: "text-error" },
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
      return <span className="text-warning">↑ increased</span>;
    case "decreased":
      return <span className="text-success">↓ decreased</span>;
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
      const { data: { user } } = await supabase.auth.getUser();

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
            Health Tracking
          </h1>
        </div>
        <EmptyState
          icon="⚠️"
          title="We couldn't load your health tracking information"
          description="Check your connection and try again."
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          Health Tracking
        </h1>
        <p className="mt-1 text-text-secondary">
          Trends from your verified medical reports
        </p>
      </div>

      {/* Time filter */}
      <div className="flex flex-wrap gap-2">
        {TIME_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setTimeFilter(filter.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
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
          description="Upload and review at least two comparable reports to begin tracking changes over time."
          action={{
            label: "Upload report",
            onClick: () => {
              window.location.href = "/documents";
            },
          }}
        />
      )}

      {/* Pending review */}
      {hasPending && (
        <Card padding="md" className="border-warning/20 bg-warning/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-warning">
                Measurements awaiting review
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {summary!.pendingReview} measurement{summary!.pendingReview !== 1 ? "s" : ""} need your confirmation.
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
            Latest verified measurements
          </h2>
          <div className="mt-4 space-y-3">
            {summary!.latestMeasurements.map((m) => {
              const statusInfo = STATUS_LABELS[m.calculatedStatus] || STATUS_LABELS.cannot_determine;
              return (
                <Link
                  key={m.normalizedTestName}
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
                      <span className={`text-sm font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Available trends */}
      {hasTrends && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Available trends
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Tests with 2+ verified measurements over time
          </p>
          <div className="mt-4 space-y-3">
            {summary!.trends.map((trend) => (
              <Link
                key={trend.normalizedTestName}
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
            ))}
          </div>
        </div>
      )}

      {/* Safety notice */}
      <Card padding="md" className="border-border/50 bg-canvas/50">
        <p className="text-xs text-text-secondary leading-relaxed">
          Healthfolio organizes and explains information from your reports. It does
          not diagnose conditions or replace a qualified healthcare professional.
        </p>
      </Card>
    </div>
  );
}
