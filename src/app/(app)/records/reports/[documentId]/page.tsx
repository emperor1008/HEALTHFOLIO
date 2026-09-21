"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

interface Measurement {
  id: string;
  original_test_name: string;
  normalized_test_name: string;
  test_key: string | null;
  panel_name: string | null;
  result_type: string;
  value_numeric: number | null;
  value_text: string | null;
  original_unit: string | null;
  normalized_unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  reference_range_raw: string | null;
  laboratory_flag_raw: string | null;
  calculated_status: string;
  comparator: string | null;
  specimen: string | null;
  method: string | null;
  fasting_status: string | null;
  specimen_collected_at: string | null;
  observed_at: string | null;
  report_issued_at: string | null;
  page_number: number;
  evidence_text: string;
  laboratory_name: string | null;
  confidence: number;
  verification_status: string;
  evidence_locator: Record<string, unknown> | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Report {
  id: string;
  document_id: string;
  laboratory_name: string | null;
  report_number: string | null;
  patient_name: string | null;
  ordering_clinician: string | null;
  collection_date: string | null;
  report_date: string | null;
  specimen: string | null;
  fasting_status: string | null;
  extraction_status: string;
  review_status: string;
  overall_confidence: number;
  measurement_count: number;
  review_count: number;
  public_summary: string | null;
}

interface AnalysisRun {
  id: string;
  status: string;
  measurements_found: number;
  measurements_review_required: number;
  public_summary: string | null;
  failure_code: string | null;
  started_at: string;
  completed_at: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  within_range: { label: "Within printed range", color: "text-success" },
  above_range: { label: "Above printed range", color: "text-warning" },
  below_range: { label: "Below printed range", color: "text-warning" },
  report_marked_abnormal: { label: "Marked abnormal", color: "text-error" },
  report_marked_critical: { label: "Marked critical", color: "text-error" },
  qualitative_positive: { label: "Positive result", color: "text-warning" },
  qualitative_negative: { label: "Negative result", color: "text-success" },
  indeterminate: { label: "Indeterminate", color: "text-text-secondary" },
  not_evaluable: { label: "Range not available", color: "text-text-secondary" },
  pending_review: { label: "Review needed", color: "text-warning" },
};

const VERIFICATION_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Needs review", color: "bg-warning/10 text-warning" },
  verified: { label: "Verified", color: "bg-success/10 text-success" },
  corrected: { label: "Corrected", color: "bg-primary/10 text-primary" },
  rejected: { label: "Rejected", color: "bg-error/10 text-error" },
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

function formatValue(m: Measurement): string {
  if (m.value_numeric !== null) {
    const comparator = m.comparator === "less_than" ? "<" : m.comparator === "greater_than" ? ">" : "";
    return `${comparator}${m.value_numeric}`;
  }
  return m.value_text || "—";
}

function formatRange(m: Measurement): string {
  if (m.reference_text) return m.reference_text;
  if (m.reference_range_raw) return m.reference_range_raw;
  if (m.reference_low !== null && m.reference_high !== null) {
    return `${m.reference_low} – ${m.reference_high}`;
  }
  if (m.reference_low !== null) return `≥ ${m.reference_low}`;
  if (m.reference_high !== null) return `≤ ${m.reference_high}`;
  return "—";
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;

  const [report, setReport] = useState<Report | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);

  const loadReport = useCallback(async () => {
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

      const response = await fetch(`/api/reports/${documentId}`);
      const json = await response.json();

      if (json.error) {
        setError(json.error.code);
      } else {
        setReport(json.data.report);
        setMeasurements(json.data.measurements);
        setAnalysisRuns(json.data.analysisRuns);
      }
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const response = await fetch(`/api/reports/${documentId}`, {
        method: "POST",
      });
      const json = await response.json();

      if (json.error) {
        setError(json.error.code);
      } else {
        // Reload to show new measurements
        await loadReport();
      }
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setExtracting(false);
    }
  };

  const handleReviewMeasurement = async (
    measurementId: string,
    decision: "verified" | "corrected" | "rejected"
  ) => {
    try {
      const response = await fetch(
        `/api/health-tracking/measurements/${measurementId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );

      if (response.ok) {
        // Update local state
        setMeasurements((prev) =>
          prev.map((m) =>
            m.id === measurementId
              ? { ...m, verification_status: decision }
              : m
          )
        );
        setSelectedMeasurement(null);
      }
    } catch {
      // Silent — the UI will remain in current state
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="space-y-8">
        <button
          onClick={() => router.back()}
          className="text-sm text-primary hover:underline"
        >
          ← Back
        </button>
        <EmptyState
          icon="⚠️"
          title="Report not found"
          description="This report may have been removed or you may not have access."
          action={{
            label: "Back to reports",
            onClick: () => router.push("/records/reports"),
          }}
        />
      </div>
    );
  }

  const pendingMeasurements = measurements.filter(
    (m) => m.verification_status === "pending"
  );
  const verifiedMeasurements = measurements.filter(
    (m) =>
      (m.verification_status === "verified" ||
        m.verification_status === "corrected") &&
      !m.invalidated_at
  );

  return (
    <div className="space-y-8">
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="text-sm text-primary hover:underline"
      >
        ← Back to reports
      </button>

      {/* Report header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          {report.laboratory_name || "Laboratory Report"}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          {report.report_number && <span>Report #{report.report_number}</span>}
          {report.report_date && <span>· {formatDate(report.report_date)}</span>}
          {report.collection_date && (
            <span>· Collected {formatDate(report.collection_date)}</span>
          )}
          {report.fasting_status && <span>· {report.fasting_status}</span>}
        </div>
      </div>

      {/* What this report shows */}
      {report.public_summary && (
        <Card padding="md" className="border-primary/20 bg-primary/5">
          <h2 className="text-sm font-semibold text-primary">
            What this report shows
          </h2>
          <p className="mt-2 text-sm text-text-primary leading-relaxed">
            {report.public_summary}
          </p>
        </Card>
      )}

      {/* Extract button if not yet extracted */}
      {report.extraction_status === "pending" && (
        <Card padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">
                This report has not been processed yet
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Extract measurements using AI to see structured results.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExtract}
              disabled={extracting}
            >
              {extracting ? "Extracting..." : "Extract measurements"}
            </Button>
          </div>
        </Card>
      )}

      {/* Results needing review */}
      {pendingMeasurements.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Results needing review
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {pendingMeasurements.length} measurement
            {pendingMeasurements.length !== 1 ? "s" : ""} need your confirmation.
          </p>
          <div className="mt-4 space-y-3">
            {pendingMeasurements.map((m) => (
              <Card
                key={m.id}
                padding="md"
                className="border-warning/20 bg-warning/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-primary">
                      {m.original_test_name}
                    </p>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {formatValue(m)} {m.original_unit || ""}
                      {m.reference_text && (
                        <span className="ml-2">
                          (Ref: {m.reference_text})
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      Evidence: &quot;{m.evidence_text}&quot; · Page {m.page_number}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Confidence: {Math.round(m.confidence * 100)}%
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        handleReviewMeasurement(m.id, "verified")
                      }
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedMeasurement(m)}
                    >
                      Correct
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        handleReviewMeasurement(m.id, "rejected")
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Verified results table */}
      {verifiedMeasurements.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Verified results
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {verifiedMeasurements.length} verified result
            {verifiedMeasurements.length !== 1 ? "s" : ""}
          </p>

          {/* Desktop table */}
          <div className="mt-4 hidden md:block overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-canvas text-left text-xs font-medium uppercase text-text-secondary">
                  <th className="px-4 py-3">Test</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Reference range</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Page</th>
                  <th className="px-4 py-3">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {verifiedMeasurements.map((m) => {
                  const statusInfo =
                    STATUS_LABELS[m.calculated_status] ||
                    STATUS_LABELS.not_evaluable;
                  const verifInfo =
                    VERIFICATION_LABELS[m.verification_status] ||
                    VERIFICATION_LABELS.pending;

                  return (
                    <tr
                      key={m.id}
                      className="border-b border-border/50 hover:bg-canvas/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-primary">
                          {m.original_test_name}
                        </p>
                        {m.panel_name && (
                          <p className="text-xs text-text-secondary">
                            {m.panel_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {formatValue(m)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {m.original_unit || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatRange(m)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        p.{m.page_number}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedMeasurement(m)}
                          className="text-xs text-primary hover:underline"
                        >
                          View evidence
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="mt-4 space-y-3 md:hidden">
            {verifiedMeasurements.map((m) => {
              const statusInfo =
                STATUS_LABELS[m.calculated_status] ||
                STATUS_LABELS.not_evaluable;

              return (
                <Card key={m.id} padding="md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text-primary">
                        {m.original_test_name}
                      </p>
                      <p className="mt-0.5 text-sm text-text-secondary">
                        {formatValue(m)} {m.original_unit || ""}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        Range: {formatRange(m)}
                      </p>
                    </div>
                    <span className={`text-sm font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-text-secondary">
                      Page {m.page_number}
                    </span>
                    <button
                      onClick={() => setSelectedMeasurement(m)}
                      className="text-xs text-primary hover:underline"
                    >
                      View evidence
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Processing history */}
      {analysisRuns.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Processing history
          </h2>
          <div className="mt-4 space-y-2">
            {analysisRuns.map((run) => (
              <Card key={run.id} padding="sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">
                    {formatDate(run.started_at)}
                  </span>
                  <span
                    className={
                      run.status === "completed"
                        ? "text-success"
                        : run.status === "failed"
                        ? "text-error"
                        : "text-text-secondary"
                    }
                  >
                    {run.status}
                  </span>
                  <span className="text-text-secondary">
                    {run.measurements_found} found
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Safety notice */}
      <Card padding="md" className="border-border/50 bg-canvas/50">
        <p className="text-xs text-text-secondary leading-relaxed">
          Healthfolio organizes and explains information from your reports. It does
          not diagnose conditions or replace a qualified healthcare professional.
          Compared with the reference range printed by this laboratory.
        </p>
      </Card>

      {/* Evidence drawer */}
      {selectedMeasurement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedMeasurement(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Source evidence"
        >
          <div
            className="mx-4 max-w-lg rounded-card border border-border bg-surface p-6 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">
                Source Evidence
              </h3>
              <button
                onClick={() => setSelectedMeasurement(null)}
                className="text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase text-text-secondary">
                  Test
                </p>
                <p className="text-sm text-text-primary">
                  {selectedMeasurement.original_test_name}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-text-secondary">
                  Result
                </p>
                <p className="text-sm text-text-primary">
                  {formatValue(selectedMeasurement)}{" "}
                  {selectedMeasurement.original_unit || ""}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-text-secondary">
                  Reference Range
                </p>
                <p className="text-sm text-text-primary">
                  {formatRange(selectedMeasurement)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-text-secondary">
                  Evidence (Page {selectedMeasurement.page_number})
                </p>
                <p className="mt-1 text-sm text-text-primary bg-canvas rounded p-3 font-mono">
                  &quot;{selectedMeasurement.evidence_text}&quot;
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-text-secondary">
                  Confidence
                </p>
                <p className="text-sm text-text-primary">
                  {Math.round(selectedMeasurement.confidence * 100)}%
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-text-secondary">
                  Status
                </p>
                <p className="text-sm text-text-primary">
                  {STATUS_LABELS[selectedMeasurement.calculated_status]?.label ||
                    selectedMeasurement.calculated_status}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedMeasurement(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
