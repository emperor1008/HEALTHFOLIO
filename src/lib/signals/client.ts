/**
 * Client-side access to the Health Signals API.
 * All calls go through the app's own API routes (session-derived identity);
 * error states are generic and calm — raw backend details never surface.
 */

export interface SignalRow {
  id: string;
  latest_measurement_id: string;
  baseline_measurement_id: string | null;
  normalized_test_key: string;
  display_name: string;
  signal_type: string;
  lifecycle_status: "draft" | "acknowledged" | "saved_for_later" | "dismissed" | "archived";
  payload: Record<string, unknown>;
  evidence: {
    latest: { measurementId: string; documentId: string; pageNumber: number };
    baseline: { measurementId: string; documentId: string; pageNumber: number } | null;
  } | null;
  reason_code: string | null;
  rule_version: string;
  created_at: string;
  updated_at: string;
}

export type SignalsState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; signals: SignalRow[]; total: number };

export async function fetchOpenSignals(limit = 3): Promise<SignalRow[]> {
  const res = await fetch(`/api/signals?status=draft&limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error("signals_unavailable");
  const json = (await res.json()) as { signals: SignalRow[] };
  return json.signals || [];
}

export async function fetchSignalsByStatus(
  statuses: string[],
  limit = 20
): Promise<SignalRow[]> {
  const results = await Promise.all(
    statuses.map(async (s) => {
      const r = await fetch(`/api/signals?status=${encodeURIComponent(s)}&limit=${limit}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("signals_unavailable");
      return r.json();
    })
  );
  const rows = results.flatMap((r) => (r as { signals: SignalRow[] }).signals || []);
  // Newest activity first.
  rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return rows;
}

export type SignalAction = "acknowledge" | "dismiss" | "save_for_later" | "archive";

export async function applySignalAction(signalId: string, action: SignalAction): Promise<void> {
  const res = await fetch("/api/signals/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signalId, action }),
  });
  if (!res.ok) {
    // The API returns a calm message; the UI never prints internals.
    throw new Error("signal_action_unavailable");
  }
}

export async function reevaluateSignal(signalId: string): Promise<void> {
  const res = await fetch(`/api/signals/${signalId}/re-evaluate`, { method: "POST" });
  if (!res.ok) throw new Error("signal_action_unavailable");
}
