"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import dynamic from "next/dynamic";

// Lazy-load the chart — keeps the initial bundle small
const TrendChart = dynamic(() => import("@/components/health-tracking/TrendChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-card border border-border bg-canvas">
      <Spinner size="md" />
    </div>
  ),
});

interface Measurement {
  id: string;
  original_test_name: string;
  normalized_test_name: string;
  value_numeric: number | null;
  value_text: string | null;
  original_unit: string | null;
  normalized_unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  report_flag: string | null;
  calculated_status: string;
  specimen_collected_at: string | null;
  observed_at: string | null;
  report_issued_at: string | null;
  page_number: number;
  evidence_text: string;
  confidence: number;
  verification_status: string;
  document_id: string;
  created_at: string;
  updated_at: string;
  documentName?: string;
  documentType?: string;
}

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
  points: Array<{
    measurementId: string;
    date: string;
    value: number;
    unit: string | null;
    referenceLow: number | null;
    referenceHigh: number | null;
    reportFlag: string | null;
    documentId: string;
    pageNumber: number;
    evidenceText: string;
    documentName?: string;
  }>;
}

interface TestData {
  testKey: string;
  trend: TrendSummary | null;
  measurements: Measurement[];
  documentNames: Record<string, string>;
}

const STATUS_LABELS: Record<string, { label: string; color: string; variant: string }> = {
  within_range: { label: "Within range", color: "text-success", variant: "verified" },
  above_range: { label: "Above range", color: "text-warning", variant: "review" },
  below_range: { label: "Below range", color: "text-warning", variant: "review" },
  report_marked_abnormal: { label: "Abnormal", color: "text-error", variant: "failed" },
  cannot_determine: { label: "Needs review", color: "text-text-secondary", variant: "processing" },
};

const VERIFICATION_LABELS: Record<string, string> = {
  pending: "Awaiting review",
  verified: "Confirmed",
  corrected: "Corrected",
  rejected: "Rejected",
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

function ChangeSummary({ trend }: { trend: TrendSummary }) {
  if (trend.previousValue === null || trend.previousValue === undefined) {
    return (
      <p className="text-sm text-text-secondary">
        One verified measurement recorded.
      </p>
    );
  }

  return (
    <p className="text-sm text-text-secondary">
      The verified value changed from{" "}
      <span className="font-medium text-text-primary">
        {trend.previousValue}
        {trend.normalizedUnit ? ` ${trend.normalizedUnit}` : ""}
      </span>{" "}
      on {formatDate(trend.previousDate)} to{" "}
      <span className="font-medium text-text-primary">
        {trend.latestValue}
        {trend.normalizedUnit ? ` ${trend.normalizedUnit}` : ""}
      </span>{" "}
      on {formatDate(trend.latestDate)}.
      {trend.percentChange !== null && (
        <span className="ml-1">
          ({trend.percentChange > 0 ? "+" : ""}
          {trend.percentChange.toFixed(1)}%)
        </span>
      )}
    </p>
  );
}

// ─── Correction Form ──────────────────────────────────────────────────────

interface CorrectionFormProps {
  measurement: Measurement;
  onSave: (correction: CorrectionPayload) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

interface CorrectionPayload {
  decision: "corrected";
  correctionReason: string;
  correctedValueNumeric: number | null;
  correctedValueText: string | null;
  correctedReferenceLow: number | null;
  correctedReferenceHigh: number | null;
  correctedReferenceText: string | null;
  correctedReportFlag: string | null;
}

function CorrectionForm({ measurement, onSave, onCancel, saving }: CorrectionFormProps) {
  const [reason, setReason] = useState("");
  const [valueNumeric, setValueNumeric] = useState(measurement.value_numeric?.toString() ?? "");
  const [valueText, setValueText] = useState(measurement.value_text ?? "");
  const [referenceLow, setReferenceLow] = useState(measurement.reference_low?.toString() ?? "");
  const [referenceHigh, setReferenceHigh] = useState(measurement.reference_high?.toString() ?? "");
  const [referenceText, setReferenceText] = useState(measurement.reference_text ?? "");
  const [reportFlag, setReportFlag] = useState(measurement.report_flag ?? "");
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError("A reason for the correction is required.");
      return;
    }

    // Validate numeric fields
    const numVal = valueNumeric.trim() ? Number(valueNumeric) : null;
    const numLow = referenceLow.trim() ? Number(referenceLow) : null;
    const numHigh = referenceHigh.trim() ? Number(referenceHigh) : null;

    if (valueNumeric.trim() && (Number.isNaN(numVal) || !Number.isFinite(numVal))) {
      setError("Value must be a valid finite number.");
      return;
    }
    if (referenceLow.trim() && (Number.isNaN(numLow) || !Number.isFinite(numLow))) {
      setError("Reference low must be a valid finite number.");
      return;
    }
    if (referenceHigh.trim() && (Number.isNaN(numHigh) || !Number.isFinite(numHigh))) {
      setError("Reference high must be a valid finite number.");
      return;
    }

    // Check at least one value is present
    const hasNumericValue = numVal !== null;
    const hasTextValue = valueText.trim().length > 0;
    if (!hasNumericValue && !hasTextValue) {
      setError("At least one value (numeric or text) must be present.");
      return;
    }

    await onSave({
      decision: "corrected",
      correctionReason: reason.trim(),
      correctedValueNumeric: numVal,
      correctedValueText: valueText.trim() || null,
      correctedReferenceLow: numLow,
      correctedReferenceHigh: numHigh,
      correctedReferenceText: referenceText.trim() || null,
      correctedReportFlag: reportFlag.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Original values display */}
      <div className="rounded-lg border border-border bg-canvas/50 p-3">
        <p className="text-xs font-medium uppercase text-text-secondary mb-2">Original extraction</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-text-secondary">Value: </span>
            <span className="text-text-primary">
              {measurement.value_numeric ?? measurement.value_text ?? "—"}
              {measurement.original_unit ? ` ${measurement.original_unit}` : ""}
            </span>
          </div>
          <div>
            <span className="text-text-secondary">Range: </span>
            <span className="text-text-primary">{measurement.reference_text || "—"}</span>
          </div>
          <div>
            <span className="text-text-secondary">Flag: </span>
            <span className="text-text-primary">{measurement.report_flag || "—"}</span>
          </div>
          <div>
            <span className="text-text-secondary">Confidence: </span>
            <span className="text-text-primary">{Math.round(measurement.confidence * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Corrected values */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="corr-value" className="block text-xs font-medium text-text-secondary">
            Numeric value
          </label>
          <input
            id="corr-value"
            type="number"
            step="any"
            value={valueNumeric}
            onChange={(e) => setValueNumeric(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>
        <div>
          <label htmlFor="corr-text" className="block text-xs font-medium text-text-secondary">
            Text value
          </label>
          <input
            id="corr-text"
            type="text"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>
        <div>
          <label htmlFor="corr-ref-low" className="block text-xs font-medium text-text-secondary">
            Reference low
          </label>
          <input
            id="corr-ref-low"
            type="number"
            step="any"
            value={referenceLow}
            onChange={(e) => setReferenceLow(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>
        <div>
          <label htmlFor="corr-ref-high" className="block text-xs font-medium text-text-secondary">
            Reference high
          </label>
          <input
            id="corr-ref-high"
            type="number"
            step="any"
            value={referenceHigh}
            onChange={(e) => setReferenceHigh(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>
      </div>

      <div>
        <label htmlFor="corr-ref-text" className="block text-xs font-medium text-text-secondary">
          Reference range text
        </label>
        <input
          id="corr-ref-text"
          type="text"
          value={referenceText}
          onChange={(e) => setReferenceText(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        />
      </div>

      <div>
        <label htmlFor="corr-flag" className="block text-xs font-medium text-text-secondary">
          Report flag
        </label>
        <input
          id="corr-flag"
          type="text"
          value={reportFlag}
          onChange={(e) => setReportFlag(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        />
      </div>

      <div>
        <label htmlFor="corr-reason" className="block text-xs font-medium text-text-secondary">
          Reason for correction *
        </label>
        <textarea
          id="corr-reason"
          ref={reasonRef}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why does this value need correction?"
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-error">{error}</p>
      )}

      <div className="flex gap-3 border-t border-border pt-4">
        <Button type="submit" size="sm" loading={saving}>
          Save correction
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function TestDetailPage({ params }: { params: { testKey: string } }) {
  const testKey = decodeURIComponent(params.testKey);
  const [data, setData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [mode, setMode] = useState<"view" | "correct">("view");
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const loadData = useCallback(async () => {
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

      const response = await fetch(
        `/api/health-tracking/tests/${encodeURIComponent(testKey)}`
      );
      const json = await response.json();

      if (json.error) {
        setError(json.error.code);
      } else {
        setData(json.data);
      }
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, [testKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openMeasurement(m: Measurement, sourceElement?: HTMLElement) {
    lastFocusedRef.current = sourceElement ?? null;
    setSelectedMeasurement(m);
    setMode("view");
  }

  function closeDrawer() {
    setSelectedMeasurement(null);
    setMode("view");
    // Restore focus to the element that opened the drawer
    setTimeout(() => {
      lastFocusedRef.current?.focus();
    }, 0);
  }

  async function handleVerify(decision: "verified" | "rejected") {
    if (!selectedMeasurement) return;
    setVerifying(true);
    try {
      const response = await fetch(`/api/health-tracking/measurements/${selectedMeasurement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      if (response.ok) {
        closeDrawer();
        loadData();
      }
    } catch {
      // Error handled by UI state
    } finally {
      setVerifying(false);
    }
  }

  async function handleCorrection(correction: CorrectionPayload) {
    if (!selectedMeasurement) return;
    setVerifying(true);
    try {
      const response = await fetch(`/api/health-tracking/measurements/${selectedMeasurement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(correction),
      });

      if (response.ok) {
        closeDrawer();
        loadData();
      } else {
        const err = await response.json();
        // Error shown via toast or inline — for now just reset
        setVerifying(false);
      }
    } catch {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-8">
        <div>
          <Link href="/health-tracking" className="text-sm text-primary hover:underline">
            ← Back to Health Tracking
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary md:text-3xl">
            Test detail
          </h1>
        </div>
        <EmptyState
          icon="⚠️"
          title="We couldn't load this test's data"
          description="Check your connection and try again."
          action={{
            label: "Try again",
            onClick: loadData,
          }}
        />
      </div>
    );
  }

  const { trend, measurements } = data;
  const verifiedMeasurements = measurements.filter(
    (m) => m.verification_status === "verified" || m.verification_status === "corrected"
  );
  const pendingMeasurements = measurements.filter(
    (m) => m.verification_status === "pending"
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link href="/health-tracking" className="text-sm text-primary hover:underline">
          ← Back to Health Tracking
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary md:text-3xl capitalize">
          {testKey.replace(/_/g, " ")}
        </h1>
        {trend?.normalizedUnit && (
          <p className="mt-1 text-text-secondary">Unit: {trend.normalizedUnit}</p>
        )}
      </div>

      {/* Trend summary */}
      {trend && (
        <Card padding="lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-text-secondary">Latest verified value</p>
              <p className="mt-1 text-3xl font-bold text-text-primary">
                {trend.latestValue}
                {trend.normalizedUnit ? ` ${trend.normalizedUnit}` : ""}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {formatDate(trend.latestDate)}
              </p>
            </div>
            {trend.absoluteChange !== null && (
              <div className="text-right">
                <p className="text-sm text-text-secondary">Change</p>
                <p className={`mt-1 text-lg font-semibold ${
                  trend.changeDirection === "increased" ? "text-warning" :
                  trend.changeDirection === "decreased" ? "text-success" :
                  "text-text-secondary"
                }`}>
                  {trend.absoluteChange > 0 ? "+" : ""}
                  {trend.absoluteChange.toFixed(2)}
                  {trend.normalizedUnit ? ` ${trend.normalizedUnit}` : ""}
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <ChangeSummary trend={trend} />
          </div>
        </Card>
      )}

      {/* Graph */}
      {trend && trend.graphableMeasurements >= 2 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Trend over time
          </h2>
          <div className="mt-4">
            <TrendChart
              points={trend.points}
              unit={trend.normalizedUnit}
              testName={trend.normalizedTestName}
            />
          </div>
        </div>
      )}

      {/* Measurement history */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Measurement history
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {verifiedMeasurements.length} verified · {pendingMeasurements.length} pending review
        </p>

        <div className="mt-4 space-y-3">
          {measurements.map((m) => {
            const statusInfo = STATUS_LABELS[m.calculated_status] || STATUS_LABELS.cannot_determine;
            return (
              <Card
                key={m.id}
                padding="md"
                className="cursor-pointer transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">
                        {m.value_numeric !== null
                          ? `${m.value_numeric}${m.original_unit ? ` ${m.original_unit}` : ""}`
                          : m.value_text || "Text result"}
                      </span>
                      <Badge variant={statusInfo.variant as "verified" | "review" | "failed" | "processing"}>
                        {statusInfo.label}
                      </Badge>
                      <Badge variant={
                        m.verification_status === "verified" || m.verification_status === "corrected"
                          ? "verified"
                          : m.verification_status === "rejected"
                          ? "failed"
                          : "processing"
                      }>
                        {VERIFICATION_LABELS[m.verification_status] || m.verification_status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">
                      {m.documentName || "Unknown document"} · Page {m.page_number}
                      {m.observed_at && (
                        <span> · {formatDate(m.observed_at)}</span>
                      )}
                    </p>
                    {m.reference_text && (
                      <p className="mt-1 text-xs text-text-secondary">
                        Reference: {m.reference_text}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openMeasurement(m, e.currentTarget as HTMLElement);
                    }}
                  >
                    View
                  </Button>
                </div>
              </Card>
            );
          })}

          {measurements.length === 0 && (
            <EmptyState
              icon="📋"
              title="No measurements found"
              description="Upload medical reports to start tracking this test."
            />
          )}
        </div>
      </div>

      {/* Source evidence drawer — uses accessible Modal */}
      <Modal
        isOpen={!!selectedMeasurement}
        onClose={closeDrawer}
        title={mode === "correct" ? "Correct measurement" : "Source evidence"}
        size="lg"
      >
        {selectedMeasurement && (
          <div className="space-y-4">
            {mode === "view" ? (
              <>
                <div>
                  <p className="text-xs font-medium uppercase text-text-secondary">Test name</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {selectedMeasurement.original_test_name}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase text-text-secondary">Value</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {selectedMeasurement.value_numeric !== null
                      ? `${selectedMeasurement.value_numeric} ${selectedMeasurement.original_unit || ""}`
                      : selectedMeasurement.value_text || "—"}
                  </p>
                </div>

                {selectedMeasurement.reference_text && (
                  <div>
                    <p className="text-xs font-medium uppercase text-text-secondary">Reference range</p>
                    <p className="mt-1 text-sm text-text-primary">{selectedMeasurement.reference_text}</p>
                  </div>
                )}

                {selectedMeasurement.report_flag && (
                  <div>
                    <p className="text-xs font-medium uppercase text-text-secondary">Report flag</p>
                    <p className="mt-1 text-sm text-text-primary">{selectedMeasurement.report_flag}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium uppercase text-text-secondary">Source document</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {selectedMeasurement.documentName || "Unknown"} · Page {selectedMeasurement.page_number}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase text-text-secondary">Evidence</p>
                  <p className="mt-1 rounded bg-canvas p-3 text-sm italic text-text-secondary">
                    &ldquo;{selectedMeasurement.evidence_text}&rdquo;
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase text-text-secondary">Confidence</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {Math.round(selectedMeasurement.confidence * 100)}%
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase text-text-secondary">Range status</p>
                  <p className={`mt-1 text-sm font-medium ${STATUS_LABELS[selectedMeasurement.calculated_status]?.color || "text-text-secondary"}`}>
                    {STATUS_LABELS[selectedMeasurement.calculated_status]?.label || selectedMeasurement.calculated_status}
                  </p>
                </div>

                {/* Actions for pending measurements */}
                {selectedMeasurement.verification_status === "pending" && (
                  <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                    <Button
                      size="sm"
                      loading={verifying}
                      onClick={() => handleVerify("verified")}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setMode("correct")}
                    >
                      Correct
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleVerify("rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* Correction form */
              <CorrectionForm
                measurement={selectedMeasurement}
                onSave={handleCorrection}
                onCancel={() => setMode("view")}
                saving={verifying}
              />
            )}
          </div>
        )}
      </Modal>

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
