"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

interface LabReport {
  id: string;
  document_id: string;
  laboratory_name: string | null;
  report_number: string | null;
  report_date: string | null;
  collection_date: string | null;
  extraction_status: string;
  review_status: string;
  overall_confidence: number;
  measurement_count: number;
  review_count: number;
  public_summary: string | null;
  created_at: string;
  updated_at: string;
}

const EXTRACTION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-text-secondary/10 text-text-secondary" },
  extracted: { label: "Extracted", color: "bg-primary/10 text-primary" },
  completed: { label: "Completed", color: "bg-success/10 text-success" },
  failed: { label: "Failed", color: "bg-error/10 text-error" },
};

const REVIEW_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Review pending", color: "bg-warning/10 text-warning" },
  review_required: { label: "Review needed", color: "bg-warning/10 text-warning" },
  completed: { label: "Reviewed", color: "bg-success/10 text-success" },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Date not found";
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

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.95) return "High confidence";
  if (confidence >= 0.80) return "Moderate confidence";
  return "Low confidence — review recommended";
}

export default function TestReportsPage() {
  const [reports, setReports] = useState<LabReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const loadReports = useCallback(async () => {
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

      const response = await fetch("/api/reports");
      const json = await response.json();

      if (json.error) {
        setError(json.error.code);
      } else {
        setReports(json.data.reports);
        setTotal(json.data.total);
      }
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

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
            Test Reports
          </h1>
        </div>
        <EmptyState
          icon="⚠️"
          title="We couldn't load your test reports"
          description="Check your connection and try again."
          action={{
            label: "Try again",
            onClick: loadReports,
          }}
        />
      </div>
    );
  }

  const pendingReview = reports.filter(
    (r) => r.review_status === "review_required" || r.review_status === "pending"
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
            Test Reports
          </h1>
          <p className="mt-1 text-text-secondary">
            {total} report{total !== 1 ? "s" : ""} uploaded
          </p>
        </div>
        <Link href="/documents">
          <Button variant="primary" size="sm">
            Add report
          </Button>
        </Link>
      </div>

      {/* Pending review banner */}
      {pendingReview.length > 0 && (
        <Card padding="md" className="border-warning/20 bg-warning/5">
          <div className="flex items-center gap-3">
            <span className="text-lg">🔍</span>
            <div>
              <p className="text-sm font-semibold text-warning">
                {pendingReview.length} report{pendingReview.length !== 1 ? "s" : ""} awaiting review
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">
                Review extracted measurements to confirm accuracy.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {reports.length === 0 && (
        <EmptyState
          icon="📋"
          title="No test reports yet"
          description="Upload a laboratory report to begin extracting and tracking your test results."
          action={{
            label: "Upload report",
            onClick: () => {
              window.location.href = "/documents";
            },
          }}
        />
      )}

      {/* Report list */}
      <div className="space-y-4">
        {reports.map((report) => {
          const extractStatus = EXTRACTION_STATUS_MAP[report.extraction_status] || EXTRACTION_STATUS_MAP.pending;
          const reviewStatus = REVIEW_STATUS_MAP[report.review_status];

          return (
            <Link
              key={report.id}
              href={`/records/reports/${report.document_id}`}
            >
              <Card
                padding="md"
                className="cursor-pointer transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-text-primary">
                        {report.laboratory_name || "Laboratory Report"}
                      </h3>
                      {report.report_number && (
                        <span className="text-xs text-text-secondary">
                          #{report.report_number}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-text-secondary">
                      {formatDate(report.report_date || report.collection_date)}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${extractStatus.color}`}>
                        {extractStatus.label}
                      </span>

                      {reviewStatus && report.review_status !== "completed" && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${reviewStatus.color}`}>
                          {reviewStatus.label}
                        </span>
                      )}

                      {report.measurement_count > 0 && (
                        <span className="text-xs text-text-secondary">
                          {report.measurement_count} result{report.measurement_count !== 1 ? "s" : ""}
                        </span>
                      )}

                      {report.review_count > 0 && (
                        <span className="text-xs text-warning">
                          {report.review_count} need{report.review_count === 1 ? "s" : ""} review
                        </span>
                      )}
                    </div>

                    {report.public_summary && (
                      <p className="mt-2 text-xs text-text-secondary line-clamp-2">
                        {report.public_summary}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-text-secondary">
                      {confidenceLabel(report.overall_confidence)}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Safety notice */}
      <Card padding="md" className="border-border/50 bg-canvas/50">
        <p className="text-xs text-text-secondary leading-relaxed">
          Healthfolio extracts and organizes information from your laboratory reports.
          It does not diagnose conditions or replace a qualified healthcare professional.
          Discuss all results with your clinician.
        </p>
      </Card>
    </div>
  );
}
