"use client";

/**
 * Impact & Reliability dashboard (Part 5) — staff-only.
 * Shows ONLY real recorded metric events. When nothing has happened yet it
 * says "No data yet" truthfully. Definitions of every derived number are
 * shown on the page itself (transparency requirement).
 */

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Card } from "@/components/ui/Card";
import { SkeletonList } from "@/components/ui/Skeletons";

interface Summary {
  totalEvents: number;
  byEvent: Record<string, number>;
  syncReliability: { attempted: number; acknowledged: number } | null;
  fallbackRate: { attempts: number; fallbacks: number } | null;
  medianTimeToClinicianActionMs: number | null;
}

interface Payload {
  summary: Summary;
  definitions: Record<string, string>;
  generatedAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  queue_item_created: "Queue items created",
  queue_item_synced: "Queue items synchronized",
  queue_item_failed: "Queue items needing attention",
  care_request_submitted: "Care requests submitted",
  triage_completed: "Safety routings completed",
  clinician_action_recorded: "Care-team actions recorded",
  appointment_proposed: "Appointments proposed",
  appointment_confirmed: "Appointments confirmed",
  appointment_completed: "Appointments completed",
  consultation_fallback_used: "Consultation fallbacks used",
  pharmacy_status_updated: "Pharmacy stock updates",
  pharmacy_response_recorded: "Pharmacy confirmations answered",
  consent_granted: "Record shares granted",
  consent_revoked: "Record shares revoked",
};

function formatDuration(ms: number | null, lang: string): string | null {
  if (ms === null) return null;
  const minutes = Math.round(ms / 60000);
  try {
    return new Intl.NumberFormat(lang === "or" ? "or-IN" : lang === "hi" ? "hi-IN" : "en-IN", {
      style: "unit",
      unit: "minute",
      unitDisplay: "long",
    }).format(minutes);
  } catch {
    return `${minutes} min`;
  }
}

export default function ReliabilityPage() {
  const { language } = useLanguage();
  const [data, setData] = useState<Payload | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/metrics/summary")
      .then(async (r) => {
        if (r.status === 403 || r.status === 401) {
          if (alive) setForbidden(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((payload: Payload | null) => {
        if (alive) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
        <h1 className="text-2xl font-semibold text-forest-900">Impact &amp; reliability</h1>
        <SkeletonList count={3} className="mt-4" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
        <h1 className="text-2xl font-semibold text-forest-900">Impact &amp; reliability</h1>
        <Card className="mt-4">
          <p className="text-sm text-forest-800">
            This dashboard is available to authorized staff only.
          </p>
        </Card>
      </div>
    );
  }

  const s = data?.summary;
  const definitions = data?.definitions ?? {};

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <h1 className="text-2xl font-semibold text-forest-900">Impact &amp; reliability</h1>
      <p className="mt-1 text-sm text-forest-700">
        Real recorded events only. Numbers update as staff and patients use the
        platform. No estimates or projections are shown.
      </p>

      {!s || s.totalEvents === 0 ? (
        <Card className="mt-4">
          <p className="text-sm text-forest-800">
            No data yet. Metrics appear here once the platform is used — for
            example after the first queued action is synchronized or the first
            pharmacy confirms stock.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mt-4">
            <h2 className="font-semibold text-forest-900">Reliability</h2>
            {s.syncReliability ? (
              <p className="mt-2 text-sm text-forest-800">
                Sync reliability:{" "}
                <strong>
                  {s.syncReliability.acknowledged}/{s.syncReliability.attempted}
                </strong>{" "}
                queued actions acknowledged.
              </p>
            ) : (
              <p className="mt-2 text-sm text-forest-700">
                No queued actions recorded yet.
              </p>
            )}
            {s.medianTimeToClinicianActionMs !== null && (
              <p className="mt-1 text-sm text-forest-800">
                Median time to care-team action:{" "}
                <strong>{formatDuration(s.medianTimeToClinicianActionMs, language)}</strong>
              </p>
            )}
            {s.fallbackRate && s.fallbackRate.attempts > 0 && (
              <p className="mt-1 text-sm text-forest-800">
                Consultation fallbacks:{" "}
                <strong>
                  {s.fallbackRate.fallbacks}/{s.fallbackRate.attempts}
                </strong>{" "}
                consultation starts.
              </p>
            )}
          </Card>

          <Card className="mt-4">
            <h2 className="font-semibold text-forest-900">Recorded events</h2>
            <ul className="mt-2 space-y-1">
              {Object.entries(s.byEvent)
                .sort((a, b) => b[1] - a[1])
                .map(([event, count]) => (
                  <li key={event} className="flex justify-between text-sm text-forest-800">
                    <span>{EVENT_LABELS[event] ?? event}</span>
                    <span className="font-semibold">{count}</span>
                  </li>
                ))}
            </ul>
          </Card>
        </>
      )}

      {data?.definitions && (
        <Card className="mt-4">
          <h2 className="font-semibold text-forest-900">How these numbers are defined</h2>
          <dl className="mt-2 space-y-2 text-sm">
            {Object.entries(definitions).map(([key, text]) => (
              <div key={key}>
                <dt className="font-medium text-forest-900">
                  {key === "syncReliability"
                    ? "Sync reliability"
                    : key === "availabilityFreshness"
                      ? "Availability freshness"
                      : key === "timeToClinicianAction"
                        ? "Time to clinician action"
                        : "Consultation fallback rate"}
                </dt>
                <dd className="text-forest-700">{text}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}
