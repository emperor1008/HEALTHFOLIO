/**
 * Queue reliability metrics from the browser.
 *
 * The offline sync engine records `queue_item_*` metrics, but the metrics
 * service itself is server-only (it writes to the database). Importing it
 * from client code — even through a runtime indirection — pulled `pg`, the
 * session resolver and firebase-admin into the client bundle and broke the
 * build, so the engine POSTs to `/api/metrics/record` instead.
 *
 * Contract (unchanged from the direct call):
 *  - best-effort: failures are swallowed, metrics never break the queue;
 *  - privacy-safe: only event name + action type + counts/durations;
 *  - `keepalive` so a metric can still leave the tab during unload.
 */

export interface QueueMetricPayload {
  event: "queue_item_created" | "queue_item_synced" | "queue_item_failed";
  durationMs?: number | null;
  metadata: Record<string, unknown>;
}

export function recordQueueMetric(payload: QueueMetricPayload): void {
  try {
    void fetch("/api/metrics/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // offline / 401 / rate-limited — metrics are best-effort only
    });
  } catch {
    // never let telemetry break queue processing
  }
}
