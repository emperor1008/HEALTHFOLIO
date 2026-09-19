/**
 * Health Signal Monitor — engine unit tests.
 * Fixtures are internal non-identifying values used only here; they never
 * appear in the app UI or user-facing examples.
 */

import { describe, it, expect } from "vitest";
import {
  isEligibleForComparison,
  sortSeries,
  planComparisonSignal,
  planRangeSignal,
  planReconciliation,
  planInvalidationArchival,
  stableStringify,
  SIGNAL_RULE_VERSION,
  type SignalMeasurement,
} from "@/lib/signals/engine";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";

let seq = 0;
function m(overrides: Partial<SignalMeasurement> = {}): SignalMeasurement {
  seq += 1;
  const id = overrides.id ?? `m${String(seq).padStart(3, "0")}`;
  return {
    id,
    user_id: USER,
    test_key: "hba1c",
    normalized_test_name: "HbA1c",
    value_numeric: 5.6,
    normalized_unit: "%",
    verification_status: "verified",
    invalidated_at: null,
    specimen_collected_at: `2026-0${(seq % 9) + 1}-15`,
    observed_at: null,
    report_issued_at: null,
    reference_low: null,
    reference_high: null,
    reference_text: null,
    report_flag: null,
    calculated_status: "not_evaluable",
    document_id: DOC,
    page_number: 1,
    created_at: `2026-0${(seq % 9) + 1}-16T00:00:00Z`,
    ...overrides,
  };
}

describe("eligibility", () => {
  it("excludes pending, rejected, invalidated, malformed, and wrong-user rows", () => {
    expect(isEligibleForComparison(m())).toBe(true);
    expect(isEligibleForComparison(m({ verification_status: "pending" }))).toBe(false);
    expect(isEligibleForComparison(m({ verification_status: "rejected" }))).toBe(false);
    expect(isEligibleForComparison(m({ invalidated_at: "2026-01-01" }))).toBe(false);
    expect(isEligibleForComparison(m({ value_numeric: null }))).toBe(false);
    expect(isEligibleForComparison(m({ value_numeric: NaN }))).toBe(false);
    expect(isEligibleForComparison(m({ specimen_collected_at: null, observed_at: null, report_issued_at: null }))).toBe(false);
    expect(isEligibleForComparison(m({ user_id: "" }))).toBe(false);
    expect(isEligibleForComparison(m({ test_key: "" }))).toBe(false);
  });
});

describe("series ordering", () => {
  it("sorts by true report date, not insertion order", () => {
    const a = m({ id: "a", specimen_collected_at: "2026-03-01" });
    const b = m({ id: "b", specimen_collected_at: "2026-01-01" });
    const c = m({ id: "c", specimen_collected_at: "2026-02-01" });
    const sorted = sortSeries([a, b, c]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks date ties deterministically by id", () => {
    const a = m({ id: "a", specimen_collected_at: "2026-01-01" });
    const b = m({ id: "b", specimen_collected_at: "2026-01-01" });
    const sorted = sortSeries([b, a]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("planComparisonSignal", () => {
  it("same test + same unit compares correctly (test 1)", () => {
    const baseline = m({ id: "b1", value_numeric: 6.1, specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", value_numeric: 6.8, specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [baseline, latest]);
    expect(signal?.signalType).toBe("numeric_change_observed");
    expect(signal?.baselineMeasurementId).toBe("b1");
    const p = signal?.payload as { absoluteChange: number; percentChange: number; daysBetween: number };
    expect(p.absoluteChange).toBeCloseTo(0.7, 6);
    expect(p.percentChange).toBeCloseTo(11.47541, 4);
    expect(p.daysBetween).toBe(14);
  });

  it("different normalized test keys never compare (test 2)", () => {
    const baseline = m({ id: "b1", test_key: "hba1c", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", test_key: "glucose_fasting", specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [baseline, latest]);
    expect(signal?.signalType).toBe("first_verified_result");
    expect(signal?.baselineMeasurementId).toBeNull();
  });

  it("different units produce comparison_unavailable_unit_mismatch (test 3)", () => {
    const baseline = m({ id: "b1", normalized_unit: "mmol/L", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", normalized_unit: "mg/dL", specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [baseline, latest]);
    expect(signal?.signalType).toBe("comparison_unavailable_unit_mismatch");
    expect(signal?.baselineMeasurementId).toBe("b1");
  });

  it("never invents unit conversions (test 4)", () => {
    const baseline = m({ id: "b1", normalized_unit: "mmol/L", value_numeric: 7.0, specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", normalized_unit: "mg/dL", value_numeric: 126, specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [baseline, latest]);
    expect(signal?.signalType).not.toBe("numeric_change_observed");
    const p = signal?.payload as Record<string, unknown>;
    expect(p.absoluteChange).toBeUndefined();
    expect(p.percentChange).toBeUndefined();
  });

  it("excludes pending rows from the series (test 5)", () => {
    const pending = m({ id: "p1", verification_status: "pending", specimen_collected_at: "2026-05-01" });
    const baseline = m({ id: "b1", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", specimen_collected_at: "2026-06-15" });
    const { signal, excluded } = planComparisonSignal(USER, "l1", [pending, baseline, latest]);
    expect(signal?.baselineMeasurementId).toBe("b1");
    expect(excluded.some((e) => e.measurementId === "p1" && e.reason === "pending")).toBe(true);
  });

  it("excludes rejected rows (test 6)", () => {
    const rejected = m({ id: "r1", verification_status: "rejected", invalidated_at: "2026-06-02", specimen_collected_at: "2026-05-01" });
    const baseline = m({ id: "b1", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [rejected, baseline, latest]);
    expect(signal?.baselineMeasurementId).toBe("b1");
  });

  it("excludes invalidated rows (test 7)", () => {
    const invalidated = m({ id: "i1", invalidated_at: "2026-06-02", specimen_collected_at: "2026-05-01" });
    const baseline = m({ id: "b1", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [invalidated, baseline, latest]);
    expect(signal?.baselineMeasurementId).toBe("b1");
  });

  it("excludes wrong-user rows (test 8)", () => {
    const foreign = m({ id: "f1", user_id: OTHER, specimen_collected_at: "2026-05-01" });
    const baseline = m({ id: "b1", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [foreign, baseline, latest]);
    expect(signal?.baselineMeasurementId).toBe("b1");
  });

  it("first verified result makes no trend claim (test 10)", () => {
    const latest = m({ id: "l1", specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [latest]);
    expect(signal?.signalType).toBe("first_verified_result");
    expect(signal?.payload).toEqual({});
  });

  it("baseline value zero does not divide by zero (test 11)", () => {
    const baseline = m({ id: "b1", value_numeric: 0, specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", value_numeric: 4.2, specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [baseline, latest]);
    const p = signal?.payload as { absoluteChange: number; percentChange: number | null };
    expect(p.absoluteChange).toBeCloseTo(4.2, 6);
    expect(p.percentChange).toBeNull();
  });

  it("uses the immediately previous verified result as baseline", () => {
    const older = m({ id: "o1", specimen_collected_at: "2026-01-01" });
    const baseline = m({ id: "b1", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", specimen_collected_at: "2026-06-15" });
    const { signal } = planComparisonSignal(USER, "l1", [older, baseline, latest]);
    expect(signal?.baselineMeasurementId).toBe("b1");
  });

  it("falls back through observed_at then report_issued_at for ordering", () => {
    const a = m({ id: "a", specimen_collected_at: null, observed_at: "2026-01-01", report_issued_at: null });
    const b = m({ id: "b", specimen_collected_at: null, observed_at: "2026-02-01", report_issued_at: null });
    const { signal } = planComparisonSignal(USER, "b", [a, b]);
    expect(signal?.baselineMeasurementId).toBe("a");
  });

  it("is deterministic for identical inputs (test 18)", () => {
    const baseline = m({ id: "b1", specimen_collected_at: "2026-06-01" });
    const latest = m({ id: "l1", specimen_collected_at: "2026-06-15" });
    const r1 = planComparisonSignal(USER, "l1", [latest, baseline]);
    const r2 = planComparisonSignal(USER, "l1", [baseline, latest]);
    expect(stableStringify(r1.signal)).toBe(stableStringify(r2.signal));
  });
});

describe("planRangeSignal", () => {
  it("echoes a source-stored range and flag only (test 12)", () => {
    const latest = m({
      id: "l1",
      calculated_status: "above_range",
      reference_low: 4.0,
      reference_high: 5.6,
      report_flag: "H",
    });
    const s = planRangeSignal(latest);
    expect(s?.signalType).toBe("report_marked_outside_range");
    const p = s?.payload as { referenceLow: number | null; referenceHigh: number | null; reportFlag: string | null };
    expect(p.referenceLow).toBe(4.0);
    expect(p.referenceHigh).toBe(5.6);
    expect(p.reportFlag).toBe("H");
  });

  it("produces no range signal when nothing is stored", () => {
    const latest = m({ id: "l1", calculated_status: "not_evaluable", reference_low: null, reference_high: null, report_flag: null });
    expect(planRangeSignal(latest)).toBeNull();
  });

  it("produces no signal for cannot_determine status", () => {
    const latest = m({ id: "l1", calculated_status: "cannot_determine", reference_low: 4, reference_high: 6 });
    expect(planRangeSignal(latest)).toBeNull();
  });

  it("produces a within-range signal when the report marks it so", () => {
    const latest = m({ id: "l1", calculated_status: "within_range", reference_low: 4.0, reference_high: 5.6 });
    const s = planRangeSignal(latest);
    expect(s?.signalType).toBe("report_marked_within_range");
  });
});

describe("planReconciliation (idempotency, tests 13/14/19)", () => {
  const computed = [
    {
      signalType: "numeric_change_observed" as const,
      dedupKey: "l1:numeric_change_observed",
      testKey: "hba1c",
      displayName: "HbA1c",
      latestMeasurementId: "l1",
      baselineMeasurementId: "b1",
      payload: { baselineValue: 6.1, latestValue: 6.8, unit: "%", absoluteChange: 0.7, percentChange: 11.477459, baselineDate: "2026-06-01", latestDate: "2026-06-15", daysBetween: 14 },
      evidence: { latest: { measurementId: "l1", documentId: DOC, pageNumber: 1 }, baseline: null },
      reasonCode: null,
    },
  ];

  it("duplicate invocation inserts nothing (idempotent)", () => {
    const existing = [
      {
        id: "s1",
        dedup_key: "l1:numeric_change_observed",
        lifecycle_status: "draft" as const,
        payload: computed[0].payload,
        signal_type: "numeric_change_observed" as const,
      },
    ];
    const plan = planReconciliation(computed, existing);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.archives).toHaveLength(0);
  });

  it("re-evaluates (updates) the right signal after a correction changes the payload", () => {
    const changed = [{ ...computed[0], payload: { ...computed[0].payload, latestValue: 7.1, absoluteChange: 1.0 } }];
    const existing = [
      {
        id: "s1",
        dedup_key: "l1:numeric_change_observed",
        lifecycle_status: "draft" as const,
        payload: computed[0].payload,
        signal_type: "numeric_change_observed" as const,
      },
    ];
    const plan = planReconciliation(changed, existing);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe("s1");
    expect((plan.updates[0].payload as { latestValue: number }).latestValue).toBe(7.1);
  });

  it("never resurrects a dismissed signal unless the fact changed", () => {
    const existing = [
      {
        id: "s1",
        dedup_key: "l1:numeric_change_observed",
        lifecycle_status: "dismissed" as const,
        payload: computed[0].payload,
        signal_type: "numeric_change_observed" as const,
      },
    ];
    const plan = planReconciliation(computed, existing);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
  });

  it("archives open rows whose type no longer matches reality", () => {
    const existing = [
      {
        id: "s1",
        dedup_key: "l1:numeric_change_observed",
        lifecycle_status: "draft" as const,
        payload: computed[0].payload,
        signal_type: "numeric_change_observed" as const,
      },
    ];
    // Reality now says unit mismatch → the open change signal is superseded.
    const nowComputed = [
      {
        signalType: "comparison_unavailable_unit_mismatch" as const,
        dedupKey: "l1:comparison_unavailable_unit_mismatch",
        testKey: "hba1c",
        displayName: "HbA1c",
        latestMeasurementId: "l1",
        baselineMeasurementId: "b1",
        payload: { latestUnit: "mg/dL", baselineUnit: "mmol/L" },
        evidence: { latest: { measurementId: "l1", documentId: DOC, pageNumber: 1 }, baseline: null },
        reasonCode: "unit_mismatch",
      },
    ];
    const plan = planReconciliation(nowComputed, existing);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.archives).toHaveLength(1);
    expect(plan.archives[0].id).toBe("s1");
  });
});

describe("planInvalidationArchival (test 15)", () => {
  it("archives only open signals, with a safe reason", () => {
    const affected = [
      { id: "s1", lifecycle_status: "draft" as const },
      { id: "s2", lifecycle_status: "saved_for_later" as const },
      { id: "s3", lifecycle_status: "acknowledged" as const },
      { id: "s4", lifecycle_status: "dismissed" as const },
      { id: "s5", lifecycle_status: "archived" as const },
    ];
    const plan = planInvalidationArchival(affected, "measurement_invalidated");
    expect(plan.map((p) => p.id).sort()).toEqual(["s1", "s2"]);
    expect(plan.every((p) => p.reasonCode === "measurement_invalidated")).toBe(true);
  });
});

describe("rule versioning (test 20)", () => {
  it("exposes a stable rule version", () => {
    expect(SIGNAL_RULE_VERSION).toBe("signals.v1");
  });
});
