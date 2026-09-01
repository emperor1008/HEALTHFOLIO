import { describe, it, expect } from "vitest";
import {
  normalizeTestName,
  normalizeUnit,
  buildSourceFingerprint,
  areTestsEquivalent,
} from "@/lib/measurements/normalization";
import {
  calculateRangeStatus,
  getStatusLabel,
  getStatusColor,
} from "@/lib/measurements/status";
import {
  buildGraphPoints,
  calculateTrendSummary,
  isGraphEligible,
} from "@/lib/measurements/trends";
import type { MedicalMeasurement } from "@/lib/measurements/types";
import { getMeasurementDate, isMeasurementGraphable, isMeasurementConfirmed } from "@/lib/measurements/types";

// ─── Test-Name Normalization ────────────────────────────────────────────────

describe("normalizeTestName", () => {
  it("normalizes HbA1c variants to the same key", () => {
    expect(normalizeTestName("HbA1c")).toBe("hba1c");
    expect(normalizeTestName("Hemoglobin A1c")).toBe("hba1c");
    expect(normalizeTestName("Glycated Hemoglobin")).toBe("hba1c");
    expect(normalizeTestName("HbA 1c")).toBe("hba1c");
    expect(normalizeTestName("HAEMOGLOBIN A1C")).toBe("hba1c");
  });

  it("keeps fasting and random glucose separate", () => {
    expect(normalizeTestName("Fasting Blood Glucose")).toBe("fasting_blood_glucose");
    expect(normalizeTestName("Random Blood Glucose")).toBe("random_blood_glucose");
    expect(normalizeTestName("FBG")).toBe("fasting_blood_glucose");
    expect(normalizeTestName("RBG")).toBe("random_blood_glucose");
  });

  it("keeps Total Cholesterol, LDL, and HDL separate", () => {
    expect(normalizeTestName("Total Cholesterol")).toBe("total_cholesterol");
    expect(normalizeTestName("LDL Cholesterol")).toBe("ldl_cholesterol");
    expect(normalizeTestName("HDL Cholesterol")).toBe("hdl_cholesterol");
    expect(normalizeTestName("LDL")).toBe("ldl_cholesterol");
    expect(normalizeTestName("HDL")).toBe("hdl_cholesterol");
  });

  it("keeps Creatinine separate from Creatinine Clearance", () => {
    expect(normalizeTestName("Creatinine")).toBe("creatinine");
    expect(normalizeTestName("Serum Creatinine")).toBe("creatinine");
    expect(normalizeTestName("Creatinine Clearance")).toBe("creatinine_clearance");
  });

  it("keeps Free T4 separate from Total T4", () => {
    expect(normalizeTestName("Free T4")).toBe("free_t4");
    expect(normalizeTestName("FT4")).toBe("free_t4");
    expect(normalizeTestName("Total T4")).toBe("total_t4");
    expect(normalizeTestName("T4")).toBe("total_t4");
  });

  it("normalizes unknown tests to a stable form", () => {
    const result = normalizeTestName("Some Rare Test XYZ 123");
    expect(result).toBe("some rare test xyz 123");
  });

  it("does not merge unknown tests automatically", () => {
    const a = normalizeTestName("Custom Test Alpha");
    const b = normalizeTestName("Custom Test Beta");
    expect(a).not.toBe(b);
  });

  it("handles empty and minimal input", () => {
    expect(normalizeTestName("")).toBe("");
    expect(normalizeTestName("  ")).toBe("");
  });
});

describe("areTestsEquivalent", () => {
  it("identifies equivalent test names", () => {
    expect(areTestsEquivalent("HbA1c", "Hemoglobin A1c")).toBe(true);
    expect(areTestsEquivalent("LDL", "LDL Cholesterol")).toBe(true);
  });

  it("identifies distinct test names", () => {
    expect(areTestsEquivalent("Fasting Glucose", "Random Glucose")).toBe(false);
    expect(areTestsEquivalent("Creatinine", "Creatinine Clearance")).toBe(false);
    expect(areTestsEquivalent("Free T4", "Total T4")).toBe(false);
  });
});

describe("normalizeUnit", () => {
  it("normalizes units consistently", () => {
    expect(normalizeUnit("mg/dL")).toBe("mg/dl");
    expect(normalizeUnit("mg / dL")).toBe("mg/dl");
    expect(normalizeUnit("mmol/L")).toBe("mmol/l");
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe("buildSourceFingerprint", () => {
  it("creates stable fingerprints", () => {
    const fp1 = buildSourceFingerprint({
      documentId: "doc1",
      pageNumber: 1,
      normalizedTestName: "hba1c",
      evidenceText: "HbA1c: 6.5%",
    });
    const fp2 = buildSourceFingerprint({
      documentId: "doc1",
      pageNumber: 1,
      normalizedTestName: "hba1c",
      evidenceText: "HbA1c: 6.5%",
    });
    expect(fp1).toBe(fp2);
  });

  it("creates different fingerprints for different evidence", () => {
    const fp1 = buildSourceFingerprint({
      documentId: "doc1",
      pageNumber: 1,
      normalizedTestName: "hba1c",
      evidenceText: "HbA1c: 6.5%",
    });
    const fp2 = buildSourceFingerprint({
      documentId: "doc1",
      pageNumber: 1,
      normalizedTestName: "hba1c",
      evidenceText: "HbA1c: 7.2%",
    });
    expect(fp1).not.toBe(fp2);
  });
});

// ─── Range Status ───────────────────────────────────────────────────────────

describe("calculateRangeStatus", () => {
  it("returns within_range when value is between bounds", () => {
    expect(calculateRangeStatus({ valueNumeric: 5, referenceLow: 3, referenceHigh: 7, reportFlag: null })).toBe("within_range");
  });

  it("returns above_range when value exceeds upper bound", () => {
    expect(calculateRangeStatus({ valueNumeric: 10, referenceLow: 3, referenceHigh: 7, reportFlag: null })).toBe("above_range");
  });

  it("returns below_range when value is below lower bound", () => {
    expect(calculateRangeStatus({ valueNumeric: 1, referenceLow: 3, referenceHigh: 7, reportFlag: null })).toBe("below_range");
  });

  it("handles one-sided range (high only)", () => {
    expect(calculateRangeStatus({ valueNumeric: 10, referenceLow: null, referenceHigh: 7, reportFlag: null })).toBe("above_range");
    expect(calculateRangeStatus({ valueNumeric: 5, referenceLow: null, referenceHigh: 7, reportFlag: null })).toBe("within_range");
  });

  it("handles one-sided range (low only)", () => {
    expect(calculateRangeStatus({ valueNumeric: 1, referenceLow: 3, referenceHigh: null, reportFlag: null })).toBe("below_range");
    expect(calculateRangeStatus({ valueNumeric: 5, referenceLow: 3, referenceHigh: null, reportFlag: null })).toBe("within_range");
  });

  it("returns report_marked_abnormal when no numeric range but flag exists", () => {
    expect(calculateRangeStatus({ valueNumeric: null, referenceLow: null, referenceHigh: null, reportFlag: "Abnormal" })).toBe("report_marked_abnormal");
    expect(calculateRangeStatus({ valueNumeric: null, referenceLow: null, referenceHigh: null, reportFlag: "High" })).toBe("report_marked_abnormal");
  });

  it("returns cannot_determine when no range and no flag", () => {
    expect(calculateRangeStatus({ valueNumeric: null, referenceLow: null, referenceHigh: null, reportFlag: null })).toBe("cannot_determine");
    expect(calculateRangeStatus({ valueNumeric: 5, referenceLow: null, referenceHigh: null, reportFlag: null })).toBe("cannot_determine");
  });

  it("handles boundary values exactly at bounds", () => {
    expect(calculateRangeStatus({ valueNumeric: 3, referenceLow: 3, referenceHigh: 7, reportFlag: null })).toBe("within_range");
    expect(calculateRangeStatus({ valueNumeric: 7, referenceLow: 3, referenceHigh: 7, reportFlag: null })).toBe("within_range");
  });
});

describe("getStatusLabel", () => {
  it("returns correct labels", () => {
    expect(getStatusLabel("within_range")).toContain("Within");
    expect(getStatusLabel("above_range")).toContain("Above");
    expect(getStatusLabel("below_range")).toContain("Below");
    expect(getStatusLabel("report_marked_abnormal")).toContain("Marked abnormal");
    expect(getStatusLabel("cannot_determine")).toContain("could not be determined");
  });
});

describe("getStatusColor", () => {
  it("returns correct colors", () => {
    expect(getStatusColor("within_range")).toBe("text-success");
    expect(getStatusColor("above_range")).toBe("text-warning");
    expect(getStatusColor("report_marked_abnormal")).toBe("text-error");
  });
});

// ─── Measurement Types ──────────────────────────────────────────────────────

function makeMeasurement(overrides: Partial<MedicalMeasurement> = {}): MedicalMeasurement {
  return {
    id: "m1",
    user_id: "u1",
    portfolio_id: "p1",
    document_id: "d1",
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
    reference_text: "4.0 - 6.0 %",
    report_flag: "High",
    calculated_status: "above_range",
    specimen_collected_at: null,
    observed_at: "2024-01-15T10:00:00Z",
    report_issued_at: "2024-01-16T00:00:00Z",
    page_number: 1,
    evidence_text: "HbA1c: 6.5%",
    confidence: 0.95,
    verification_status: "verified",
    source_fingerprint: "doc1::1::hba1c::hba1c: 6.5%",
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
    invalidated_at: null,
    ...overrides,
  };
}

describe("getMeasurementDate", () => {
  it("prefers specimen_collected_at", () => {
    const m = makeMeasurement({
      specimen_collected_at: "2024-01-10T08:00:00Z",
      observed_at: "2024-01-15T10:00:00Z",
      report_issued_at: "2024-01-16T00:00:00Z",
    });
    expect(getMeasurementDate(m)).toBe("2024-01-10T08:00:00Z");
  });

  it("falls back to observed_at", () => {
    const m = makeMeasurement({
      specimen_collected_at: null,
      observed_at: "2024-01-15T10:00:00Z",
    });
    expect(getMeasurementDate(m)).toBe("2024-01-15T10:00:00Z");
  });

  it("falls back to report_issued_at", () => {
    const m = makeMeasurement({
      specimen_collected_at: null,
      observed_at: null,
      report_issued_at: "2024-01-16T00:00:00Z",
    });
    expect(getMeasurementDate(m)).toBe("2024-01-16T00:00:00Z");
  });

  it("returns null when no date exists", () => {
    const m = makeMeasurement({
      specimen_collected_at: null,
      observed_at: null,
      report_issued_at: null,
    });
    expect(getMeasurementDate(m)).toBeNull();
  });
});

describe("isMeasurementGraphable", () => {
  it("returns true for verified numeric measurement with date", () => {
    expect(isMeasurementGraphable(makeMeasurement())).toBe(true);
  });

  it("returns false for rejected measurements", () => {
    expect(isMeasurementGraphable(makeMeasurement({ verification_status: "rejected" }))).toBe(false);
  });

  it("returns false for invalidated measurements", () => {
    expect(isMeasurementGraphable(makeMeasurement({ invalidated_at: "2024-02-01T00:00:00Z" }))).toBe(false);
  });

  it("returns false for pending measurements", () => {
    expect(isMeasurementGraphable(makeMeasurement({ verification_status: "pending" }))).toBe(false);
  });

  it("returns false for text-only measurements", () => {
    expect(isMeasurementGraphable(makeMeasurement({ value_numeric: null, value_text: "Positive" }))).toBe(false);
  });

  it("returns false when no date exists", () => {
    expect(isMeasurementGraphable(makeMeasurement({
      specimen_collected_at: null,
      observed_at: null,
      report_issued_at: null,
    }))).toBe(false);
  });
});

describe("isMeasurementConfirmed", () => {
  it("returns true for verified", () => {
    expect(isMeasurementConfirmed(makeMeasurement({ verification_status: "verified" }))).toBe(true);
  });

  it("returns true for corrected", () => {
    expect(isMeasurementConfirmed(makeMeasurement({ verification_status: "corrected" }))).toBe(true);
  });

  it("returns false for pending", () => {
    expect(isMeasurementConfirmed(makeMeasurement({ verification_status: "pending" }))).toBe(false);
  });

  it("returns false for rejected", () => {
    expect(isMeasurementConfirmed(makeMeasurement({ verification_status: "rejected" }))).toBe(false);
  });
});

// ─── Trends ─────────────────────────────────────────────────────────────────

describe("buildGraphPoints", () => {
  it("builds sorted graph points from measurements", () => {
    const measurements = [
      makeMeasurement({
        id: "m2",
        observed_at: "2024-06-01T10:00:00Z",
        value_numeric: 7.0,
      }),
      makeMeasurement({
        id: "m1",
        observed_at: "2024-01-15T10:00:00Z",
        value_numeric: 6.5,
      }),
    ];

    const points = buildGraphPoints(measurements);
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe("2024-01-15T10:00:00Z");
    expect(points[1].date).toBe("2024-06-01T10:00:00Z");
    expect(points[0].value).toBe(6.5);
    expect(points[1].value).toBe(7.0);
  });

  it("excludes rejected and pending measurements", () => {
    const measurements = [
      makeMeasurement({ verification_status: "verified" }),
      makeMeasurement({ id: "m2", verification_status: "rejected" }),
      makeMeasurement({ id: "m3", verification_status: "pending" }),
    ];

    const points = buildGraphPoints(measurements);
    expect(points).toHaveLength(1);
  });

  it("excludes text-only measurements", () => {
    const measurements = [
      makeMeasurement({ value_numeric: 6.5 }),
      makeMeasurement({ id: "m2", value_numeric: null, value_text: "Positive" }),
    ];

    const points = buildGraphPoints(measurements);
    expect(points).toHaveLength(1);
  });
});

describe("calculateTrendSummary", () => {
  it("calculates trend with two measurements", () => {
    const measurements = [
      makeMeasurement({
        id: "m1",
        observed_at: "2024-01-15T10:00:00Z",
        value_numeric: 6.5,
      }),
      makeMeasurement({
        id: "m2",
        observed_at: "2024-06-01T10:00:00Z",
        value_numeric: 7.0,
      }),
    ];

    const trend = calculateTrendSummary("hba1c", measurements);
    expect(trend).not.toBeNull();
    expect(trend!.latestValue).toBe(7.0);
    expect(trend!.previousValue).toBe(6.5);
    expect(trend!.absoluteChange).toBeCloseTo(0.5);
    expect(trend!.changeDirection).toBe("increased");
    expect(trend!.graphableMeasurements).toBe(2);
  });

  it("returns null for no graphable measurements", () => {
    const trend = calculateTrendSummary("hba1c", []);
    expect(trend).toBeNull();
  });

  it("handles single measurement", () => {
    const measurements = [
      makeMeasurement({
        id: "m1",
        observed_at: "2024-01-15T10:00:00Z",
        value_numeric: 6.5,
      }),
    ];

    const trend = calculateTrendSummary("hba1c", measurements);
    expect(trend).not.toBeNull();
    expect(trend!.latestValue).toBe(6.5);
    expect(trend!.previousValue).toBeNull();
    expect(trend!.changeDirection).toBe("insufficient_data");
  });

  it("handles decreased values", () => {
    const measurements = [
      makeMeasurement({
        id: "m1",
        observed_at: "2024-01-15T10:00:00Z",
        value_numeric: 7.0,
      }),
      makeMeasurement({
        id: "m2",
        observed_at: "2024-06-01T10:00:00Z",
        value_numeric: 6.5,
      }),
    ];

    const trend = calculateTrendSummary("hba1c", measurements);
    expect(trend!.changeDirection).toBe("decreased");
    expect(trend!.absoluteChange).toBeCloseTo(-0.5);
  });

  it("handles unchanged values", () => {
    const measurements = [
      makeMeasurement({
        id: "m1",
        observed_at: "2024-01-15T10:00:00Z",
        value_numeric: 6.5,
      }),
      makeMeasurement({
        id: "m2",
        observed_at: "2024-06-01T10:00:00Z",
        value_numeric: 6.5,
      }),
    ];

    const trend = calculateTrendSummary("hba1c", measurements);
    expect(trend!.changeDirection).toBe("unchanged");
    expect(trend!.absoluteChange).toBe(0);
  });

  it("handles zero previous value without division by zero", () => {
    const measurements = [
      makeMeasurement({
        id: "m1",
        observed_at: "2024-01-15T10:00:00Z",
        value_numeric: 0,
      }),
      makeMeasurement({
        id: "m2",
        observed_at: "2024-06-01T10:00:00Z",
        value_numeric: 5,
      }),
    ];

    const trend = calculateTrendSummary("hba1c", measurements);
    expect(trend!.percentChange).toBeNull(); // Division by zero avoided
  });
});

describe("isGraphEligible", () => {
  it("returns eligible for 2+ verified measurements with same unit", () => {
    const measurements = [
      makeMeasurement({ verification_status: "verified" }),
      makeMeasurement({ id: "m2", verification_status: "verified" }),
    ];
    expect(isGraphEligible(measurements).eligible).toBe(true);
  });

  it("returns not eligible for fewer than 2 measurements", () => {
    const measurements = [
      makeMeasurement({ verification_status: "verified" }),
    ];
    expect(isGraphEligible(measurements).eligible).toBe(false);
  });

  it("returns not eligible when units differ", () => {
    const measurements = [
      makeMeasurement({ verification_status: "verified", normalized_unit: "mg/dl" }),
      makeMeasurement({ id: "m2", verification_status: "verified", normalized_unit: "mmol/l" }),
    ];
    expect(isGraphEligible(measurements).eligible).toBe(false);
    expect(isGraphEligible(measurements).reason).toContain("different units");
  });

  it("excludes rejected measurements from count", () => {
    const measurements = [
      makeMeasurement({ verification_status: "verified" }),
      makeMeasurement({ id: "m2", verification_status: "rejected" }),
    ];
    expect(isGraphEligible(measurements).eligible).toBe(false);
  });
});
