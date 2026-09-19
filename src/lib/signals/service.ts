/**
 * Health Signal Monitor — server-side service.
 *
 * Runs on the server with the session user's Supabase client (RLS enforced).
 * No Ollama/LLM involvement: this is deterministic logic.
 *
 * Guarantees:
 * - monitoring failure never invalidates measurement verification;
 * - duplicate runs never create duplicate signals (dedup_key conflict handling);
 * - audit events never contain raw medical text, only ids and safe reason codes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SIGNAL_RULE_VERSION,
  planComparisonSignal,
  planRangeSignal,
  planReconciliation,
  planInvalidationArchival,
  type PlannedSignal,
  type SignalMeasurement,
} from "./engine";

export type ServiceClient = SupabaseClient<any, any, any>;

// ---------------------------------------------------------------------------
// Audit (privacy-safe: ids + reason codes only, no medical text)
// ---------------------------------------------------------------------------

export async function auditSignalEvent(
  supabase: ServiceClient,
  userId: string,
  event: {
    action: string;
    signalId?: string;
    measurementId?: string;
    documentId?: string;
    fromStatus?: string;
    toStatus?: string;
    reasonCode?: string;
  }
): Promise<void> {
  try {
    // Written with the admin client per project convention: audit_events has
    // no INSERT policy for end users. Metadata carries ids/reason codes only.
    const admin = createAdminClient();
    const metadata: Record<string, string | null> = {
      scope: "health_signal",
      action: event.action,
      signal_id: event.signalId ?? null,
      measurement_id: event.measurementId ?? null,
      document_id: event.documentId ?? null,
      from_status: event.fromStatus ?? null,
      to_status: event.toStatus ?? null,
      reason_code: event.reasonCode ?? null,
      rule_version: SIGNAL_RULE_VERSION,
    };
    await admin.from("audit_events").insert({
      user_id: userId,
      action: event.action,
      resource_type: "health_signal",
      resource_id: event.signalId ?? event.measurementId ?? null,
      metadata,
    });
  } catch {
    // Audit failure must never break the user flow.
  }
}

// ---------------------------------------------------------------------------
// Series loading (RLS-scoped; O(n) per test key)
// ---------------------------------------------------------------------------

const MEASUREMENT_COLUMNS =
  "id, user_id, test_key, normalized_test_name, value_numeric, normalized_unit, verification_status, invalidated_at, specimen_collected_at, observed_at, report_issued_at, reference_low, reference_high, reference_text, report_flag, calculated_status, document_id, page_number, created_at";

/**
 * Loads the verified/corrected series for one test key plus the latest row.
 * The latest row is fetched explicitly so a partially-filtered page can never
 * silently omit it.
 */
async function loadComparisonSeries(
  supabase: ServiceClient,
  userId: string,
  testKey: string,
  latestId: string
): Promise<SignalMeasurement[]> {
  const latestPromise = supabase
    .from("medical_measurements")
    .select(MEASUREMENT_COLUMNS)
    .eq("id", latestId)
    .eq("user_id", userId)
    .maybeSingle();

  const seriesPromise = supabase
    .from("medical_measurements")
    .select(MEASUREMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("test_key", testKey)
    .in("verification_status", ["verified", "corrected"])
    .is("invalidated_at", "null")
    .order("created_at", { ascending: false })
    .limit(200);

  const [latestRes, seriesRes] = await Promise.all([latestPromise, seriesPromise]);
  if (latestRes.error || !latestRes.data) {
    console.error("[signals] latest measurement load failed:", latestRes.error?.code || "not_found");
    return [];
  }
  if (seriesRes.error) {
    console.error("[signals] series load failed:", seriesRes.error.code || "unknown");
    return [(latestRes.data as SignalMeasurement)];
  }

  const rows = seriesRes.data as SignalMeasurement[];
  if (!rows.some((r) => r.id === latestId)) {
    return [latestRes.data as SignalMeasurement, ...rows];
  }
  return rows;
}

async function loadExistingSignals(
  supabase: ServiceClient,
  userId: string,
  latestId: string
): Promise<Array<{ id: string; dedup_key: string; lifecycle_status: string; payload: unknown; signal_type: string }>> {
  const { data, error } = await supabase
    .from("health_signals")
    .select("id, dedup_key, lifecycle_status, payload, signal_type")
    .eq("user_id", userId)
    .eq("latest_measurement_id", latestId);

  if (error) {
    console.error("[signals] existing signal load failed:", error.code || "unknown");
    return [];
  }
  return data || [];
}

// ---------------------------------------------------------------------------
// Plan application
// ---------------------------------------------------------------------------

async function applyPlannedSignals(
  supabase: ServiceClient,
  userId: string,
  plans: PlannedSignal[],
  existingRows: Array<{ id: string; dedup_key: string; lifecycle_status: string; payload: unknown; signal_type: string }>
): Promise<{ inserted: number; updated: number; archived: number; failed: boolean }> {
  const reconciliation = planReconciliation(
    plans,
    existingRows.map((r) => ({
      id: r.id,
      dedup_key: r.dedup_key,
      lifecycle_status: r.lifecycle_status as never,
      payload: r.payload,
      signal_type: r.signal_type as never,
    }))
  );

  let inserted = 0;
  let updated = 0;
  let archived = 0;
  let failed = false;

  for (const plan of reconciliation.inserts) {
    const { error } = await supabase
      .from("health_signals")
      .insert({
        user_id: userId,
        latest_measurement_id: plan.latestMeasurementId,
        baseline_measurement_id: plan.baselineMeasurementId,
        normalized_test_key: plan.testKey,
        display_name: plan.displayName,
        signal_type: plan.signalType,
        lifecycle_status: "draft",
        payload: plan.payload,
        evidence: plan.evidence,
        reason_code: plan.reasonCode,
        rule_version: SIGNAL_RULE_VERSION,
        dedup_key: plan.dedupKey,
      })
      .select("id")
      .single();

    if (error) {
      // Unique-violation on dedup_key = concurrent duplicate run: safe to ignore.
      if (error.code === "23505") continue;
      console.error("[signals] insert failed:", error.code || "unknown");
      failed = true;
      continue;
    }
    inserted += 1;
    await auditSignalEvent(supabase, userId, {
      action: "signal_created",
      measurementId: plan.latestMeasurementId,
      reasonCode: plan.reasonCode ?? undefined,
    });
  }

  for (const update of reconciliation.updates) {
    const { error } = await supabase
      .from("health_signals")
      .update({
        payload: update.payload,
        evidence: update.evidence,
        rule_version: SIGNAL_RULE_VERSION,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .eq("user_id", userId);
    if (error) {
      console.error("[signals] update failed:", error.code || "unknown");
      failed = true;
      continue;
    }
    updated += 1;
    await auditSignalEvent(supabase, userId, {
      action: "signal_updated",
      signalId: update.id,
    });
  }

  for (const archive of reconciliation.archives) {
    const { error } = await supabase
      .from("health_signals")
      .update({
        lifecycle_status: "archived",
        archived_at: new Date().toISOString(),
        reason_code: archive.reasonCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", archive.id)
      .eq("user_id", userId)
      .in("lifecycle_status", ["draft", "saved_for_later"]);
    if (error) {
      console.error("[signals] archive failed:", error.code || "unknown");
      failed = true;
      continue;
    }
    archived += 1;
    await auditSignalEvent(supabase, userId, {
      action: "signal_archived",
      signalId: archive.id,
      reasonCode: archive.reasonCode,
    });
  }

  return { inserted, updated, archived, failed };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export interface MonitorResult {
  status: "completed" | "skipped" | "failed";
  reason?: string;
  signalsCreated?: number;
}

/**
 * Run the monitor for one newly verified measurement.
 * Safe to call repeatedly: idempotent via dedup_key and reconciliation.
 * Never throws — the caller's verification flow must never break.
 */
export async function runSignalMonitorForMeasurement(
  supabase: ServiceClient,
  userId: string,
  measurementId: string
): Promise<MonitorResult> {
  try {
    if (!measurementId) return { status: "skipped", reason: "missing_measurement_id" };

    const latestRes = await supabase
      .from("medical_measurements")
      .select(MEASUREMENT_COLUMNS)
      .eq("id", measurementId)
      .eq("user_id", userId)
      .maybeSingle();

    if (latestRes.error || !latestRes.data) {
      console.error("[signals] monitor: latest load failed:", latestRes.error?.code || "not_found");
      return { status: "failed", reason: "latest_load_failed" };
    }
    const latest = latestRes.data as SignalMeasurement;

    if (
      (latest.verification_status !== "verified" && latest.verification_status !== "corrected") ||
      latest.invalidated_at
    ) {
      return { status: "skipped", reason: "latest_not_verified" };
    }

    await auditSignalEvent(supabase, userId, {
      action: "monitor_invoked",
      measurementId,
    });

    // 1) Comparison signal (needs the same-test series).
    const series = await loadComparisonSeries(supabase, userId, latest.test_key, measurementId);
    const comparison = planComparisonSignal(userId, measurementId, series);
    const plans: PlannedSignal[] = comparison.signal ? [comparison.signal] : [];

    // 2) Source-range signal (only from stored evidence flags).
    const rangeSignal = planRangeSignal(latest);
    if (rangeSignal) plans.push(rangeSignal);

    const existingRows = await loadExistingSignals(supabase, userId, measurementId);
    const result = await applyPlannedSignals(supabase, userId, plans, existingRows);

    if (result.failed) {
      await auditSignalEvent(supabase, userId, {
        action: "monitor_failed",
        measurementId,
      });
      return { status: "failed", reason: "partial_write_failure", signalsCreated: result.inserted };
    }

    return {
      status: "completed",
      signalsCreated: result.inserted,
    };
  } catch (err) {
    console.error("[signals] monitor error:", err instanceof Error ? err.name : "unknown");
    try {
      await auditSignalEvent(supabase, userId, {
        action: "monitor_failed",
        measurementId,
      });
    } catch {
      // ignore
    }
    return { status: "failed", reason: "unexpected_error" };
  }
}

/**
 * Archive open signals tied to a measurement that was rejected/invalidated.
 * Never modifies the measurement itself.
 */
export async function archiveSignalsForInvalidatedMeasurement(
  supabase: ServiceClient,
  userId: string,
  measurementId: string,
  reason: "measurement_invalidated" | "measurement_rejected"
): Promise<void> {
  try {
    const { data: affected, error } = await supabase
      .from("health_signals")
      .select("id, lifecycle_status")
      .or(
        `latest_measurement_id.eq.${measurementId},baseline_measurement_id.eq.${measurementId}`
      )
      .eq("user_id", userId)
      .in("lifecycle_status", ["draft", "saved_for_later"]);

    if (error) {
      console.error("[signals] invalidation lookup failed:", error.code || "unknown");
      return;
    }

    const archivalPlan = planInvalidationArchival(affected || [], reason);
    for (const item of archivalPlan) {
      await supabase
        .from("health_signals")
        .update({
          lifecycle_status: "archived",
          archived_at: new Date().toISOString(),
          reason_code: item.reasonCode,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("user_id", userId);
      await auditSignalEvent(supabase, userId, {
        action: "signal_archived",
        signalId: item.id,
        measurementId,
        reasonCode: item.reasonCode,
      });
    }
  } catch (err) {
    console.error("[signals] invalidation archive error:", err instanceof Error ? err.name : "unknown");
  }
}
