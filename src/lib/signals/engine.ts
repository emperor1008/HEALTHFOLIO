/**
 * Health Signal Monitor — deterministic comparison engine.
 *
 * Pure functions only: no database, no network, no randomness.
 * The engine decides WHICH signal facts exist for a measurement series;
 * persistence and wording live in ./service.ts and ./wording.ts.
 *
 * Safety rules enforced here:
 * - only verified/corrected, non-invalidated, numeric, dated measurements compare;
 * - only the same normalized test key and the same unit ever compare;
 * - no unit conversion is ever invented;
 * - percentages are only produced for a non-zero baseline;
 * - source reference ranges/flags are echoed only when present on the measurement;
 * - a first comparable result never produces a trend claim;
 * - identical inputs always produce identical outputs (stable stringify, sorted tie-breaks).
 */

export const SIGNAL_RULE_VERSION = "signals.v1";

export type SignalType =
  | "first_verified_result"
  | "numeric_change_observed"
  | "report_marked_outside_range"
  | "report_marked_within_range"
  | "comparison_unavailable_unit_mismatch"
  | "source_needs_review"
  | "measurement_invalidated";

export type LifecycleStatus =
  | "draft"
  | "acknowledged"
  | "saved_for_later"
  | "dismissed"
  | "archived";

/** The minimal measurement shape the engine needs (from medical_measurements). */
export interface SignalMeasurement {
  id: string;
  user_id: string;
  test_key: string;
  normalized_test_name: string;
  value_numeric: number | null;
  normalized_unit: string | null;
  verification_status: string;
  invalidated_at: string | null;
  specimen_collected_at: string | null;
  observed_at: string | null;
  report_issued_at: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  report_flag: string | null;
  calculated_status: string;
  document_id: string;
  page_number: number;
  created_at: string;
}

/** True when a measurement may take part in a comparison. */
export function isEligibleForComparison(m: SignalMeasurement): boolean {
  if (!m || m.user_id === undefined || m.user_id === null || m.user_id === "") return false;
  if (m.verification_status !== "verified" && m.verification_status !== "corrected") return false;
  if (m.invalidated_at !== null && m.invalidated_at !== undefined) return false;
  if (typeof m.value_numeric !== "number" || !Number.isFinite(m.value_numeric)) return false;
  if (!getSignalDate(m)) return false;
  if (!m.test_key) return false;
  return true;
}

/** The true report date used for ordering: specimen → observed → issued. */
export function getSignalDate(m: SignalMeasurement): string | null {
  return m.specimen_collected_at || m.observed_at || m.report_issued_at || null;
}

/** Sort a series by true date, then id — never by insertion order. */
export function sortSeries<T extends SignalMeasurement>(series: T[]): T[] {
  return [...series].sort((a, b) => {
    const da = getSignalDate(a) || "";
    const db = getSignalDate(b) || "";
    if (da !== db) return da < db ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Units compare only when both sides agree after trimming (case-insensitive). */
function unitsMatch(a: string | null, b: string | null): boolean {
  const na = (a || "").trim().toLowerCase();
  const nb = (b || "").trim().toLowerCase();
  if (na === "" && nb === "") return true;
  if (na === "" || nb === "") return false;
  return na === nb;
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

export interface ComparisonPayload {
  baselineValue: number;
  latestValue: number;
  unit: string | null;
  absoluteChange: number;
  percentChange: number | null;
  baselineDate: string;
  latestDate: string;
  daysBetween: number;
}

export interface RangePayload {
  value: number;
  unit: string | null;
  calculatedStatus: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceText: string | null;
  reportFlag: string | null;
}

export interface SignalEvidence {
  latest: { measurementId: string; documentId: string; pageNumber: number };
  baseline: { measurementId: string; documentId: string; pageNumber: number } | null;
}

export interface PlannedSignal {
  signalType: SignalType;
  dedupKey: string;
  testKey: string;
  displayName: string;
  latestMeasurementId: string;
  baselineMeasurementId: string | null;
  payload: ComparisonPayload | RangePayload | Record<string, unknown>;
  evidence: SignalEvidence;
  reasonCode: string | null;
}

export interface MonitorPlan {
  signals: PlannedSignal[];
  /** Measurements the engine excluded, with a safe internal reason (never shown raw). */
  excluded: Array<{ measurementId: string; reason: string }>;
}

/** Stable JSON stringify (sorted keys) for payload equality checks. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function dedupKeyFor(latestMeasurementId: string, signalType: SignalType): string {
  return `${latestMeasurementId}:${signalType}`;
}

/** The latest measurement itself must be eligible, or nothing is planned. */
function requireEligibleLatest(latest: SignalMeasurement): string | null {
  if (!latest) return "missing_latest";
  if (latest.verification_status !== "verified" && latest.verification_status !== "corrected")
    return "latest_not_verified";
  if (latest.invalidated_at) return "latest_invalidated";
  if (typeof latest.value_numeric !== "number" || !Number.isFinite(latest.value_numeric))
    return "latest_not_numeric";
  if (!getSignalDate(latest)) return "latest_missing_date";
  if (!latest.test_key) return "latest_missing_test_key";
  return null;
}

/**
 * Build the comparison signal for `latestId` from its same-test verified series.
 * The series must already contain only rows for one user and one test key;
 * the engine re-checks user ownership defensively.
 */
export function planComparisonSignal(
  userId: string,
  latestId: string,
  series: SignalMeasurement[]
): { signal: PlannedSignal | null; excluded: Array<{ measurementId: string; reason: string }> } {
  const excluded: Array<{ measurementId: string; reason: string }> = [];
  const latest = series.find((m) => m.id === latestId);
  if (!latest) return { signal: null, excluded: [{ measurementId: latestId, reason: "missing_latest" }] };

  const latestProblem = requireEligibleLatest(latest);
  if (latestProblem) return { signal: null, excluded: [{ measurementId: latestId, reason: latestProblem }] };

  // Ownership + comparability filter
  const eligible = series.filter((m) => {
    if (m.user_id !== userId) {
      if (m.id !== latestId) excluded.push({ measurementId: m.id, reason: "ownership_mismatch" });
      return false;
    }
    if (m.id === latestId) return true;
    if (!isEligibleForComparison(m)) {
      excluded.push({
        measurementId: m.id,
        reason:
          m.verification_status === "pending"
            ? "pending"
            : m.verification_status === "rejected"
              ? "rejected"
              : m.invalidated_at
                ? "invalidated"
                : "not_comparable",
      });
      return false;
    }
    if (m.test_key !== latest.test_key) {
      excluded.push({ measurementId: m.id, reason: "different_test_key" });
      return false;
    }
    return true;
  });

  const sorted = sortSeries(eligible);
  const latestDate = getSignalDate(latest) as string;

  // Baseline: newest eligible result strictly earlier than the latest by true date.
  const earlier = sorted.filter((m) => m.id !== latestId && (getSignalDate(m) as string) < latestDate);
  const baseline = earlier.length > 0 ? earlier[earlier.length - 1] : null;

  const evidence: SignalEvidence = {
    latest: {
      measurementId: latest.id,
      documentId: latest.document_id,
      pageNumber: latest.page_number,
    },
    baseline: baseline
      ? {
          measurementId: baseline.id,
          documentId: baseline.document_id,
          pageNumber: baseline.page_number,
        }
      : null,
  };

  const baseFields = {
    testKey: latest.test_key,
    displayName: latest.normalized_test_name,
    latestMeasurementId: latest.id,
  };

  // First comparable result — no trend claim.
  if (!baseline) {
    return {
      signal: {
        ...baseFields,
        baselineMeasurementId: null,
        signalType: "first_verified_result",
        dedupKey: dedupKeyFor(latest.id, "first_verified_result"),
        payload: {},
        evidence,
        reasonCode: null,
      },
      excluded,
    };
  }

  // Units differ — never invent a conversion.
  if (!unitsMatch(latest.normalized_unit, baseline.normalized_unit)) {
    return {
      signal: {
        ...baseFields,
        baselineMeasurementId: baseline.id,
        signalType: "comparison_unavailable_unit_mismatch",
        dedupKey: dedupKeyFor(latest.id, "comparison_unavailable_unit_mismatch"),
        payload: {
          latestUnit: latest.normalized_unit,
          baselineUnit: baseline.normalized_unit,
        },
        evidence,
        reasonCode: "unit_mismatch",
      },
      excluded,
    };
  }

  const baselineValue = baseline.value_numeric as number;
  const latestValue = latest.value_numeric as number;
  const absoluteChange = round6(latestValue - baselineValue);
  const percentChange = baselineValue !== 0 ? round6((absoluteChange / Math.abs(baselineValue)) * 100) : null;
  const baselineDate = getSignalDate(baseline) as string;
  const daysBetween = Math.max(
    0,
    Math.round(
      (new Date(latestDate).getTime() - new Date(baselineDate).getTime()) / 86400000
    )
  );

  return {
    signal: {
      ...baseFields,
      baselineMeasurementId: baseline.id,
      signalType: "numeric_change_observed",
      dedupKey: dedupKeyFor(latest.id, "numeric_change_observed"),
      payload: {
        baselineValue,
        latestValue,
        unit: latest.normalized_unit,
        absoluteChange,
        percentChange,
        baselineDate,
        latestDate,
        daysBetween,
      },
      evidence,
      reasonCode: null,
    },
    excluded,
  };
}

/**
 * Plan the source-range signal for a newly verified measurement.
 * Only echoes a range/flag that is actually stored on the measurement.
 * calculated_status "cannot_determine" produces no signal.
 */
export function planRangeSignal(latest: SignalMeasurement): PlannedSignal | null {
  const problem = requireEligibleLatest(latest);
  if (problem) return null;

  const outside =
    latest.calculated_status === "above_range" ||
    latest.calculated_status === "below_range" ||
    latest.calculated_status === "report_marked_abnormal";
  const within = latest.calculated_status === "within_range";
  if (!outside && !within) return null;

  const payload: RangePayload = {
    value: latest.value_numeric as number,
    unit: latest.normalized_unit,
    calculatedStatus: latest.calculated_status,
    referenceLow: latest.reference_low,
    referenceHigh: latest.reference_high,
    referenceText: latest.reference_text,
    reportFlag: latest.report_flag,
  };

  const signalType: SignalType = outside ? "report_marked_outside_range" : "report_marked_within_range";

  return {
    testKey: latest.test_key,
    displayName: latest.normalized_test_name,
    latestMeasurementId: latest.id,
    baselineMeasurementId: null,
    signalType,
    dedupKey: dedupKeyFor(latest.id, signalType),
    payload,
    evidence: {
      latest: {
        measurementId: latest.id,
        documentId: latest.document_id,
        pageNumber: latest.page_number,
      },
      baseline: null,
    },
    reasonCode: null,
  };
}

export interface ExistingSignalRow {
  id: string;
  dedup_key: string;
  lifecycle_status: LifecycleStatus;
  payload: unknown;
  signal_type: SignalType;
}

export interface SignalUpsertPlan {
  /** Open signals whose payload should be refreshed (re-evaluation). */
  updates: Array<{ id: string; payload: unknown; evidence: SignalEvidence }>;
  /** New signals to insert. */
  inserts: PlannedSignal[];
  /** Open signals that no longer match reality: archive with a safe reason. */
  archives: Array<{ id: string; reasonCode: string }>;
}

/**
 * Reconcile freshly computed signals against existing rows for the same
 * latest measurement. Idempotent: running twice with unchanged data yields
 * no operations. User decisions (dismissed/archived) are never resurrected
 * unless the underlying fact genuinely changed.
 */
export function planReconciliation(
  computed: PlannedSignal[],
  existing: ExistingSignalRow[]
): SignalUpsertPlan {
  const plan: SignalUpsertPlan = { updates: [], inserts: [], archives: [] };

  const computedByKey = new Map(computed.map((s) => [s.dedupKey, s]));
  const existingByKey = new Map(existing.map((s) => [s.dedup_key, s]));

  for (const [key, next] of Array.from(computedByKey.entries())) {
    const row = existingByKey.get(key);
    if (!row) {
      plan.inserts.push(next);
      continue;
    }
    if (row.lifecycle_status === "dismissed" || row.lifecycle_status === "archived") {
      // Respect the user's decision unless the fact itself changed.
      if (stableStringify(row.payload) !== stableStringify(next.payload)) {
        plan.inserts.push(next);
      }
      continue;
    }
    if (stableStringify(row.payload) !== stableStringify(next.payload)) {
      plan.updates.push({ id: row.id, payload: next.payload, evidence: next.evidence });
    }
  }

  // Open rows whose signal type no longer matches reality (e.g. after a
  // correction changed units) are archived with a safe reason.
  const typesNow = new Set(computed.map((s) => `${s.latestMeasurementId}:${s.signalType}`));
  for (const row of existing) {
    if (row.lifecycle_status !== "draft" && row.lifecycle_status !== "saved_for_later") continue;
    if (!typesNow.has(row.dedup_key)) {
      plan.archives.push({ id: row.id, reasonCode: "superseded_by_re_evaluation" });
    }
  }

  return plan;
}

/**
 * Plan archival of open signals tied to a measurement that was
 * rejected or invalidated. Never touches the measurement itself.
 */
export function planInvalidationArchival(
  affectedSignals: Array<{ id: string; lifecycle_status: LifecycleStatus }>,
  reasonCode: "measurement_invalidated" | "measurement_rejected"
): Array<{ id: string; reasonCode: string }> {
  return affectedSignals
    .filter((s) => s.lifecycle_status === "draft" || s.lifecycle_status === "saved_for_later")
    .map((s) => ({ id: s.id, reasonCode }));
}
