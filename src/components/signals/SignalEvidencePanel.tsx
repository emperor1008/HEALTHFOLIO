"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatSignalDate, formatSignalValue } from "@/lib/signals/wording";

/**
 * Evidence for one Health Signal: the current and (when comparable) baseline
 * result side by side. Document context is fetched from the existing
 * measurement API, which enforces ownership server-side and returns a short-
 * lived signed URL only for the owner.
 */

const GENERIC_ERROR =
  "We could not load the evidence for this signal. Your health records were not changed.";

interface MeasurementDetail {
  measurement: {
    id: string;
    normalized_test_name: string;
    value_numeric: number | null;
    normalized_unit: string | null;
    verification_status: string;
    specimen_collected_at: string | null;
    observed_at: string | null;
    report_issued_at: string | null;
    reference_low: number | null;
    reference_high: number | null;
    reference_text: string | null;
    report_flag: string | null;
  };
  document: { id: string; originalName: string; documentType: string } | null;
  signedUrl: string | null;
}

interface SignalEvidencePanelProps {
  latestMeasurementId: string;
  baselineMeasurementId: string | null;
  onClose: () => void;
}

function reportDate(m: MeasurementDetail["measurement"]): string {
  return formatSignalDate(m.specimen_collected_at || m.observed_at || m.report_issued_at);
}

export function SignalEvidencePanel({
  latestMeasurementId,
  baselineMeasurementId,
  onClose,
}: SignalEvidencePanelProps) {
  const [latest, setLatest] = useState<MeasurementDetail | null>(null);
  const [baseline, setBaseline] = useState<MeasurementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const requests = [fetchMeasurement(latestMeasurementId)];
        if (baselineMeasurementId) {
          requests.push(fetchMeasurement(baselineMeasurementId));
        }
        // Parallel fetches — independent data, no sequential round trips.
        const [latestRes, baselineRes] = await Promise.all([
          requests[0],
          requests[1] ?? Promise.resolve(null),
        ]);
        if (cancelled) return;
        setLatest(latestRes);
        setBaseline(baselineRes);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [latestMeasurementId, baselineMeasurementId]);

  return (
    <div
      role="region"
      aria-label="Signal evidence"
      className="rounded-card border border-border bg-canvas p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-forest-900">Evidence</h3>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close evidence panel">
          Close
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse" aria-hidden="true">
          <div className="h-20 rounded-card bg-border/40" />
          {baselineMeasurementId && <div className="h-20 rounded-card bg-border/40" />}
        </div>
      ) : error ? (
        <p className="text-sm text-text-secondary">{GENERIC_ERROR}</p>
      ) : (
        <div className={baseline ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
          {latest && <ResultBlock label="Latest result" detail={latest} />}
          {baseline && <ResultBlock label="Earlier result" detail={baseline} />}
        </div>
      )}
    </div>
  );
}

function ResultBlock({ label, detail }: { label: string; detail: MeasurementDetail }) {
  const m = detail.measurement;
  const [openSource, setOpenSource] = useState(false);

  return (
    <div className="rounded-card border border-border bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
        <Badge variant={m.verification_status === "corrected" ? "info" : "verified"}>
          {m.verification_status === "corrected" ? "Verified (corrected)" : "Verified"}
        </Badge>
      </div>
      <p className="text-2xl font-semibold text-forest-900">
        {formatSignalValue(m.value_numeric)}
        {m.normalized_unit ? <span className="text-base text-text-secondary">{m.normalized_unit}</span> : null}
      </p>
      <p className="text-sm text-text-secondary">
        {m.normalized_test_name} · {reportDate(m)}
      </p>
      {(m.reference_low !== null || m.reference_high !== null || m.reference_text) && (
        <p className="text-xs text-text-secondary">
          Printed on report:{" "}
          {m.reference_low !== null && m.reference_high !== null
            ? `${formatSignalValue(m.reference_low)}${m.normalized_unit ?? ""} to ${formatSignalValue(m.reference_high)}${m.normalized_unit ?? ""}`
            : m.reference_text}
        </p>
      )}
      {detail.document && (
        <div className="pt-1">
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            onClick={() => setOpenSource((v) => !v)}
            aria-expanded={openSource}
          >
            {detail.document.originalName}
          </button>
          {openSource && detail.signedUrl && (
            <div className="mt-2">
              {/* Owner-only, short-lived signed URL from the server */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.signedUrl}
                alt={`Page evidence for ${m.normalized_test_name}`}
                className="max-h-72 rounded border border-border"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function fetchMeasurement(id: string): Promise<MeasurementDetail> {
  const res = await fetch(`/api/health-tracking/measurements/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("evidence_unavailable");
  const json = (await res.json()) as { data: MeasurementDetail };
  return json.data;
}
