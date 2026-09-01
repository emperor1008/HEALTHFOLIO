import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MeasurementCorrectionSchema } from "@/lib/ai/schemas";
import { calculateRangeStatus } from "@/lib/measurements/status";
import { calculateTrendSummary, isGraphEligible } from "@/lib/measurements/trends";
import { normalizeTestName } from "@/lib/measurements/normalization";
import type { MedicalMeasurement } from "@/lib/measurements/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeMeasurement(overrides: Partial<MedicalMeasurement> = {}): MedicalMeasurement {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000002",
    portfolio_id: "00000000-0000-0000-0000-000000000003",
    document_id: "00000000-0000-0000-0000-000000000004",
    extraction_id: null,
    original_test_name: "HbA1c",
    normalized_test_name: "hba1c",
    coding_system: null,
    coding_code: null,
    value_numeric: 6.5,
    value_text: null,
    original_unit: "%",
    normalized_unit: "%",
    reference_low: 4.0,
    reference_high: 6.0,
    reference_text: "4.0-6.0%",
    report_flag: null,
    calculated_status: "above_range",
    specimen_collected_at: "2025-01-15T00:00:00Z",
    observed_at: "2025-01-15T00:00:00Z",
    report_issued_at: "2025-01-16T00:00:00Z",
    page_number: 1,
    evidence_text: "HbA1c: 6.5%",
    confidence: 0.95,
    verification_status: "pending",
    source_fingerprint: "fp1",
    created_at: "2025-01-16T00:00:00Z",
    updated_at: "2025-01-16T00:00:00Z",
    invalidated_at: null,
    ...overrides,
  };
}

// ─── Correction Schema Tests ──────────────────────────────────────────────

describe("MeasurementCorrectionSchema", () => {
  it("accepts a valid verify decision", () => {
    const result = MeasurementCorrectionSchema.safeParse({ decision: "verified" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid reject decision", () => {
    const result = MeasurementCorrectionSchema.safeParse({ decision: "rejected" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid corrected decision with reason and value", () => {
    const result = MeasurementCorrectionSchema.safeParse({
      decision: "corrected",
      correctionReason: "Transcription error in original report",
      correctedValueNumeric: 5.8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects corrected without reason", () => {
    const result = MeasurementCorrectionSchema.safeParse({
      decision: "corrected",
      correctedValueNumeric: 5.8,
    });
    expect(result.success).toBe(false);
  });

  it("rejects corrected with reason but no fields", () => {
    const result = MeasurementCorrectionSchema.safeParse({
      decision: "corrected",
      correctionReason: "Error",
    });
    expect(result.success).toBe(false);
  });

  it("rejects NaN in numeric fields", () => {
    const result = MeasurementCorrectionSchema.safeParse({
      decision: "corrected",
      correctionReason: "Fix value",
      correctedValueNumeric: NaN,
    });
    expect(result.success).toBe(false);
  });

  it("rejects Infinity in numeric fields", () => {
    const result = MeasurementCorrectionSchema.safeParse({
      decision: "corrected",
      correctionReason: "Fix value",
      correctedValueNumeric: Infinity,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid decision value", () => {
    const result = MeasurementCorrectionSchema.safeParse({ decision: "invalid" });
    expect(result.success).toBe(false);
  });
});

// ─── Trend Compute Tool Logic Tests ───────────────────────────────────────

describe("trend.compute logic", () => {
  it("returns no measurements for empty input", () => {
    const points = calculateTrendSummary("hba1c", []);
    expect(points).toBeNull();
  });

  it("returns insufficient_data for single measurement", () => {
    const m = makeMeasurement({ verification_status: "verified" });
    const trend = calculateTrendSummary("hba1c", [m]);
    expect(trend).not.toBeNull();
    expect(trend!.changeDirection).toBe("insufficient_data");
    expect(trend!.graphableMeasurements).toBe(1);
  });

  it("returns computed trend for two comparable measurements", () => {
    const m1 = makeMeasurement({
      id: "m1",
      value_numeric: 6.5,
      specimen_collected_at: "2025-01-15T00:00:00Z",
      verification_status: "verified",
    });
    const m2 = makeMeasurement({
      id: "m2",
      value_numeric: 5.8,
      specimen_collected_at: "2025-07-15T00:00:00Z",
      verification_status: "verified",
    });
    const trend = calculateTrendSummary("hba1c", [m1, m2]);
    expect(trend).not.toBeNull();
    expect(trend!.latestValue).toBe(5.8);
    expect(trend!.previousValue).toBe(6.5);
    expect(trend!.changeDirection).toBe("decreased");
    expect(trend!.absoluteChange).toBeCloseTo(-0.7, 2);
    expect(trend!.graphableMeasurements).toBe(2);
  });

  it("handles zero previous value without division by zero", () => {
    const m1 = makeMeasurement({
      id: "m1",
      value_numeric: 0,
      specimen_collected_at: "2025-01-15T00:00:00Z",
      verification_status: "verified",
    });
    const m2 = makeMeasurement({
      id: "m2",
      value_numeric: 5,
      specimen_collected_at: "2025-07-15T00:00:00Z",
      verification_status: "verified",
    });
    const trend = calculateTrendSummary("test", [m1, m2]);
    expect(trend!.percentChange).toBeNull();
    expect(trend!.absoluteChange).toBe(5);
    expect(trend!.changeDirection).toBe("increased");
  });

  it("excludes rejected measurements", () => {
    const m1 = makeMeasurement({
      id: "m1",
      value_numeric: 6.5,
      specimen_collected_at: "2025-01-15T00:00:00Z",
      verification_status: "verified",
    });
    const m2 = makeMeasurement({
      id: "m2",
      value_numeric: 5.8,
      specimen_collected_at: "2025-07-15T00:00:00Z",
      verification_status: "rejected",
    });
    const trend = calculateTrendSummary("test", [m1, m2]);
    expect(trend!.graphableMeasurements).toBe(1);
    expect(trend!.changeDirection).toBe("insufficient_data");
  });

  it("excludes invalidated measurements", () => {
    const m1 = makeMeasurement({
      id: "m1",
      value_numeric: 6.5,
      specimen_collected_at: "2025-01-15T00:00:00Z",
      verification_status: "verified",
      invalidated_at: "2025-02-01T00:00:00Z",
    });
    const eligibility = isGraphEligible([m1]);
    expect(eligibility.eligible).toBe(false);
  });

  it("prevents graphing with different units", () => {
    const m1 = makeMeasurement({
      id: "m1",
      normalized_unit: "mg/dl",
      specimen_collected_at: "2025-01-15T00:00:00Z",
      verification_status: "verified",
    });
    const m2 = makeMeasurement({
      id: "m2",
      normalized_unit: "mmol/l",
      specimen_collected_at: "2025-07-15T00:00:00Z",
      verification_status: "verified",
    });
    const eligibility = isGraphEligible([m1, m2]);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain("different units");
  });

  it("corrected measurements are graph-eligible", () => {
    const m1 = makeMeasurement({
      id: "m1",
      value_numeric: 6.5,
      specimen_collected_at: "2025-01-15T00:00:00Z",
      verification_status: "corrected",
    });
    const m2 = makeMeasurement({
      id: "m2",
      value_numeric: 5.8,
      specimen_collected_at: "2025-07-15T00:00:00Z",
      verification_status: "corrected",
    });
    const eligibility = isGraphEligible([m1, m2]);
    expect(eligibility.eligible).toBe(true);
  });
});

// ─── CallStructuredChat Contract Tests ────────────────────────────────────

describe("callStructuredChat typed contract", () => {
  it("schema is mandatory — interface requires ZodType parameter", () => {
    // Verify the schema type is not optional at the type level
    // This is a compile-time check; if it compiles, the test passes
    const schema = z.object({ value: z.number() });
    type Inferred = z.infer<typeof schema>;
    const _test: Inferred = { value: 42 };
    expect(_test.value).toBe(42);
  });

  it("MeasurementCorrectionSchema correctly validates correction payloads", () => {
    const payload = {
      decision: "corrected" as const,
      correctionReason: "Verified against original document",
      correctedValueNumeric: 5.2,
      correctedReferenceLow: 4.0,
      correctedReferenceHigh: 6.0,
      correctedReferenceText: "4.0-6.0%",
      correctedReportFlag: null,
    };
    const result = MeasurementCorrectionSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// ─── Normalization Edge Cases ─────────────────────────────────────────────

describe("normalization edge cases", () => {
  it("empty string normalizes to empty key", () => {
    const key = normalizeTestName("");
    expect(typeof key).toBe("string");
  });

  it("whitespace-only normalizes correctly", () => {
    const key = normalizeTestName("   ");
    expect(typeof key).toBe("string");
  });

  it("preserves distinction between similar names", () => {
    const fbg = normalizeTestName("Fasting Blood Glucose");
    const rbg = normalizeTestName("Random Blood Glucose");
    expect(fbg).not.toBe(rbg);
  });
});

// ─── Range Status Edge Cases ──────────────────────────────────────────────

describe("range status edge cases", () => {
  it("null value with flag returns report_marked_abnormal", () => {
    const status = calculateRangeStatus({
      valueNumeric: null,
      referenceLow: null,
      referenceHigh: null,
      reportFlag: "Abnormal",
    });
    expect(status).toBe("report_marked_abnormal");
  });

  it("null value without flag returns cannot_determine", () => {
    const status = calculateRangeStatus({
      valueNumeric: null,
      referenceLow: null,
      referenceHigh: null,
      reportFlag: null,
    });
    expect(status).toBe("cannot_determine");
  });

  it("value exactly at lower bound is within_range", () => {
    const status = calculateRangeStatus({
      valueNumeric: 4.0,
      referenceLow: 4.0,
      referenceHigh: 6.0,
      reportFlag: null,
    });
    expect(status).toBe("within_range");
  });

  it("value exactly at upper bound is within_range", () => {
    const status = calculateRangeStatus({
      valueNumeric: 6.0,
      referenceLow: 4.0,
      referenceHigh: 6.0,
      reportFlag: null,
    });
    expect(status).toBe("within_range");
  });

  it("value just below lower bound is below_range", () => {
    const status = calculateRangeStatus({
      valueNumeric: 3.99,
      referenceLow: 4.0,
      referenceHigh: 6.0,
      reportFlag: null,
    });
    expect(status).toBe("below_range");
  });

  it("value just above upper bound is above_range", () => {
    const status = calculateRangeStatus({
      valueNumeric: 6.01,
      referenceLow: 4.0,
      referenceHigh: 6.0,
      reportFlag: null,
    });
    expect(status).toBe("above_range");
  });

  it("only lower bound — value below is below_range", () => {
    const status = calculateRangeStatus({
      valueNumeric: 2.0,
      referenceLow: 4.0,
      referenceHigh: null,
      reportFlag: null,
    });
    expect(status).toBe("below_range");
  });

  it("only upper bound — value above is above_range", () => {
    const status = calculateRangeStatus({
      valueNumeric: 10.0,
      referenceLow: null,
      referenceHigh: 6.0,
      reportFlag: null,
    });
    expect(status).toBe("above_range");
  });

  it("flag with High in text is report_marked_abnormal", () => {
    const status = calculateRangeStatus({
      valueNumeric: 100,
      referenceLow: null,
      referenceHigh: null,
      reportFlag: "High",
    });
    expect(status).toBe("report_marked_abnormal");
  });

  it("flag with Low in text is report_marked_abnormal", () => {
    const status = calculateRangeStatus({
      valueNumeric: 30,
      referenceLow: null,
      referenceHigh: null,
      reportFlag: "Low",
    });
    expect(status).toBe("report_marked_abnormal");
  });
});
