/**
 * Metrics service. `recordMetric` is safe-by-construction (invalid events are
 * dropped, never thrown into request paths). Aggregation reads are used only
 * by the protected dashboard API, which resolves staff role server-side.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateMetric, type MetricRecord } from "./events";

export async function recordMetric(input: unknown): Promise<void> {
  const record: MetricRecord | null = validateMetric(input);
  if (!record) return; // invalid → silently dropped (never breaks the request)
  try {
    const admin = await createAdminClient();
    void admin
      .from("reliability_metrics")
      .insert({
        event: record.event,
        duration_ms: record.durationMs ?? null,
        metadata: record.metadata ?? {},
      })
      .then(() => undefined, () => undefined);
  } catch {
    // Metrics must never break the primary request path.
  }
}

export interface MetricSummary {
  totalEvents: number;
  byEvent: Record<string, number>;
  syncReliability: { attempted: number; acknowledged: number } | null;
  fallbackRate: { attempts: number; fallbacks: number } | null;
  medianTimeToClinicianActionMs: number | null;
}

export async function getMetricSummary(): Promise<MetricSummary> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("reliability_metrics")
    .select("event, duration_ms, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error || !data) {
    return {
      totalEvents: 0,
      byEvent: {},
      syncReliability: null,
      fallbackRate: null,
      medianTimeToClinicianActionMs: null,
    };
  }

  const byEvent: Record<string, number> = {};
  for (const row of data) {
    byEvent[row.event] = (byEvent[row.event] ?? 0) + 1;
  }

  const attempted =
    (byEvent["queue_item_created"] ?? 0);
  const acknowledged = byEvent["queue_item_synced"] ?? 0;

  const fallbackConsults =
    (byEvent["consultation_fallback_used"] ?? 0);
  const consultationAttempts =
    (byEvent["appointment_confirmed"] ?? 0);

  const actionDurations: number[] = [];
  for (const row of data) {
    if (row.event === "clinician_action_recorded") {
      const meta = (row.metadata ?? {}) as { timeToActionMs?: number };
      if (typeof meta.timeToActionMs === "number") actionDurations.push(meta.timeToActionMs);
    }
  }
  actionDurations.sort((a, b) => a - b);
  const median =
    actionDurations.length > 0
      ? actionDurations[Math.floor(actionDurations.length / 2)]
      : null;

  return {
    totalEvents: data.length,
    byEvent,
    syncReliability:
      attempted > 0 ? { attempted, acknowledged } : null,
    fallbackRate:
      consultationAttempts > 0
        ? { attempts: consultationAttempts, fallbacks: fallbackConsults }
        : null,
    medianTimeToClinicianActionMs: median,
  };
}
