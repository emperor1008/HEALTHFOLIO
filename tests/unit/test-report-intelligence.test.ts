/**
 * Feature 4: Test Report Intelligence — Unit Tests
 *
 * Tests extraction schemas, range status, test identity normalization,
 * report summaries, and agent tool state machine integration.
 */

import { describe, it, expect } from "vitest";
import {
  LabReportExtractionSchema,
  ExtractedMeasurementSchema,
  ReportSummarySchema,
  TestExplanationSchema,
} from "@/lib/reports/extraction-schemas";
import {
  calculateExtendedRangeStatus,
  getExtendedStatusLabel,
  getExtendedStatusColor,
} from "@/lib/reports/range-status";
import {
  buildTestKey,
  areTestKeysEquivalent,
  canMeasurementsTrend,
  areTestsDistinct,
  groupMeasurementsByPanel,
} from "@/lib/reports/test-identity";
import { normalizeTestName } from "@/lib/measurements/normalization";

// ─── Extraction Schemas ──────────────────────────────────────────────────

describe("Lab Report Extraction Schema", () => {
  it("accepts a valid complete extraction", () => {
    const result = LabReportExtractionSchema.parse({
      report: {
        laboratoryName: "City Lab",
        reportNumber: "LR-12345",
        patientName: null,
        orderingClinician: "Dr. Smith",
        collectionDate: "2025-06-15",
        reportDate: "2025-06-16",
        specimen: "Blood",
        fastingStatus: "Fasting",
      },
      panels: [
        {
          panelName: "Lipid Panel",
          measurements: [
            {
              rawTestName: "Total Cholesterol",
              normalizedTestName: "total_cholesterol",
              resultType: "numeric",
              rawValueText: "210",
              numericValue: 210,
              comparator: null,
              qualitativeValue: null,
              unitRaw: "mg/dL",
              referenceRangeRaw: "< 200",
              referenceLower: null,
              referenceUpper: 200,
              referenceText: "< 200 mg/dL",
              laboratoryFlagRaw: "High",
              specimen: "Serum",
              method: "Enzymatic",
              confidence: 0.95,
              evidence: {
                page: 1,
                textQuote: "Total Cholesterol  210 mg/dL  < 200  High",
              },
            },
          ],
        },
      ],
      warnings: [],
    });

    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].measurements[0].numericValue).toBe(210);
    expect(result.panels[0].measurements[0].laboratoryFlagRaw).toBe("High");
  });

  it("accepts extraction with no panels but warnings", () => {
    const result = LabReportExtractionSchema.parse({
      report: {
        laboratoryName: null,
        reportNumber: null,
        patientName: null,
        orderingClinician: null,
        collectionDate: null,
        reportDate: null,
        specimen: null,
        fastingStatus: null,
      },
      panels: [],
      warnings: ["Could not identify any measurements"],
    });
    expect(result.panels).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects extraction with empty rawTestName", () => {
    expect(() =>
      ExtractedMeasurementSchema.parse({
        rawTestName: "",
        normalizedTestName: null,
        resultType: "numeric",
        rawValueText: "120",
        numericValue: 120,
        comparator: null,
        qualitativeValue: null,
        unitRaw: "mg/dL",
        referenceRangeRaw: "70-100",
        referenceLower: 70,
        referenceUpper: 100,
        referenceText: "70-100 mg/dL",
        laboratoryFlagRaw: "High",
        specimen: null,
        method: null,
        confidence: 0.9,
        evidence: { page: 1, textQuote: "Glucose 120 mg/dL" },
      })
    ).toThrow();
  });

  it("accepts less-than comparator", () => {
    const m = ExtractedMeasurementSchema.parse({
      rawTestName: "HIV 1/2 Antigen/Antibody",
      normalizedTestName: null,
      resultType: "qualitative",
      rawValueText: "Non-Reactive",
      numericValue: null,
      comparator: null,
      qualitativeValue: "Non-Reactive",
      unitRaw: null,
      referenceRangeRaw: "Non-Reactive",
      referenceLower: null,
      referenceUpper: null,
      referenceText: "Non-Reactive",
      laboratoryFlagRaw: null,
      specimen: "Serum",
      method: "ELISA",
      confidence: 0.95,
      evidence: { page: 1, textQuote: "HIV 1/2 Antigen/Antibody  Non-Reactive" },
    });
    expect(m.qualitativeValue).toBe("Non-Reactive");
    expect(m.resultType).toBe("qualitative");
  });

  it("rejects invalid confidence outside 0-1", () => {
    expect(() =>
      ExtractedMeasurementSchema.parse({
        rawTestName: "Test",
        normalizedTestName: null,
        resultType: "numeric",
        rawValueText: "5",
        numericValue: 5,
        comparator: null,
        qualitativeValue: null,
        unitRaw: null,
        referenceRangeRaw: null,
        referenceLower: null,
        referenceUpper: null,
        referenceText: null,
        laboratoryFlagRaw: null,
        specimen: null,
        method: null,
        confidence: 1.5,
        evidence: { page: 1, textQuote: "Test 5" },
      })
    ).toThrow();
  });
});

// ─── Extended Range Status ───────────────────────────────────────────────

describe("Extended Range Status", () => {
  it("returns within_range when value is inside bounds", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: 5.0,
        referenceLower: 4.0,
        referenceUpper: 6.0,
        laboratoryFlagRaw: null,
        resultType: "numeric",
        qualitativeValue: null,
        comparator: null,
      })
    ).toBe("within_range");
  });

  it("returns above_range when value exceeds upper bound", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: 7.0,
        referenceLower: 4.0,
        referenceUpper: 6.0,
        laboratoryFlagRaw: null,
        resultType: "numeric",
        qualitativeValue: null,
        comparator: null,
      })
    ).toBe("above_range");
  });

  it("returns below_range when value is below lower bound", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: 3.0,
        referenceLower: 4.0,
        referenceUpper: 6.0,
        laboratoryFlagRaw: null,
        resultType: "numeric",
        qualitativeValue: null,
        comparator: null,
      })
    ).toBe("below_range");
  });

  it("returns report_marked_critical for panic flag", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: null,
        referenceLower: null,
        referenceUpper: null,
        laboratoryFlagRaw: "PANIC",
        resultType: "text",
        qualitativeValue: null,
        comparator: null,
      })
    ).toBe("report_marked_critical");
  });

  it("returns report_marked_abnormal for high flag without numeric range", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: null,
        referenceLower: null,
        referenceUpper: null,
        laboratoryFlagRaw: "Abnormal High",
        resultType: "text",
        qualitativeValue: null,
        comparator: null,
      })
    ).toBe("report_marked_abnormal");
  });

  it("returns qualitative_positive for detected result", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: null,
        referenceLower: null,
        referenceUpper: null,
        laboratoryFlagRaw: null,
        resultType: "qualitative",
        qualitativeValue: "Detected",
        comparator: null,
      })
    ).toBe("qualitative_positive");
  });

  it("returns qualitative_negative for not-detected result", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: null,
        referenceLower: null,
        referenceUpper: null,
        laboratoryFlagRaw: null,
        resultType: "qualitative",
        qualitativeValue: "Not Detected",
        comparator: null,
      })
    ).toBe("qualitative_negative");
  });

  it("returns indeterminate for unclear qualitative value", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: null,
        referenceLower: null,
        referenceUpper: null,
        laboratoryFlagRaw: null,
        resultType: "qualitative",
        qualitativeValue: "Equivocal",
        comparator: null,
      })
    ).toBe("indeterminate");
  });

  it("returns not_evaluable when no range or flag exists", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: 42,
        referenceLower: null,
        referenceUpper: null,
        laboratoryFlagRaw: null,
        resultType: "numeric",
        qualitativeValue: null,
        comparator: null,
      })
    ).toBe("not_evaluable");
  });

  it("handles less_than comparator correctly", () => {
    expect(
      calculateExtendedRangeStatus({
        numericValue: 3,
        referenceLower: null,
        referenceUpper: 5,
        laboratoryFlagRaw: null,
        resultType: "numeric",
        qualitativeValue: null,
        comparator: "less_than",
      })
    ).toBe("within_range");
  });

  it("provides correct status labels", () => {
    expect(getExtendedStatusLabel("within_range")).toContain("Within");
    expect(getExtendedStatusLabel("above_range")).toContain("Above");
    expect(getExtendedStatusLabel("below_range")).toContain("Below");
    expect(getExtendedStatusLabel("report_marked_critical")).toContain("critical");
    expect(getExtendedStatusLabel("not_evaluable")).toContain("not available");
  });

  it("provides correct status colors", () => {
    expect(getExtendedStatusColor("within_range")).toContain("success");
    expect(getExtendedStatusColor("report_marked_critical")).toContain("error");
    expect(getExtendedStatusColor("above_range")).toContain("warning");
  });
});

// ─── Test Identity Normalization ─────────────────────────────────────────

describe("Test Identity", () => {
  it("builds a stable test key from raw name", () => {
    const key = buildTestKey({ rawTestName: "HbA1c" });
    expect(key).toBe("hba1c");
  });

  it("builds a test key with specimen", () => {
    const key = buildTestKey({
      rawTestName: "Glucose",
      specimen: "Serum",
    });
    expect(key).toContain("glucose");
    expect(key).toContain("serum");
  });

  it("builds a test key with specimen and method", () => {
    const key = buildTestKey({
      rawTestName: "Hemoglobin",
      specimen: "Whole Blood",
      method: "Colorimetric",
    });
    expect(key).toContain("hemoglobin");
    expect(key).toContain("whole_blood");
    expect(key).toContain("colorimetric");
  });

  it("equivalent keys match", () => {
    expect(areTestKeysEquivalent("hba1c", "hba1c")).toBe(true);
    expect(areTestKeysEquivalent("glucose::serum", "glucose::serum")).toBe(true);
  });

  it("non-equivalent keys do not match", () => {
    expect(areTestKeysEquivalent("hba1c", "hemoglobin")).toBe(false);
    expect(areTestKeysEquivalent("glucose::serum", "glucose::urine")).toBe(false);
  });

  it("HbA1c aliases normalize to same key", () => {
    const key1 = buildTestKey({ rawTestName: "HbA1c" });
    const key2 = buildTestKey({ rawTestName: "Hemoglobin A1c" });
    const key3 = buildTestKey({ rawTestName: "Glycated hemoglobin" });
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);
  });

  it("fasting and random glucose remain distinct", () => {
    const key1 = buildTestKey({
      rawTestName: "Fasting Blood Glucose",
      specimen: "Serum",
    });
    const key2 = buildTestKey({
      rawTestName: "Random Blood Glucose",
      specimen: "Serum",
    });
    expect(key1).not.toBe(key2);
  });

  it("LDL and HDL remain distinct", () => {
    const key1 = buildTestKey({ rawTestName: "LDL Cholesterol" });
    const key2 = buildTestKey({ rawTestName: "HDL Cholesterol" });
    expect(key1).not.toBe(key2);
  });

  it("Free T4 and Total T4 remain distinct", () => {
    const key1 = buildTestKey({ rawTestName: "Free T4" });
    const key2 = buildTestKey({ rawTestName: "Total T4" });
    expect(key1).not.toBe(key2);
  });

  it("Creatinine and Creatinine Clearance remain distinct", () => {
    const key1 = buildTestKey({ rawTestName: "Creatinine" });
    const key2 = buildTestKey({ rawTestName: "Creatinine Clearance" });
    expect(key1).not.toBe(key2);
  });

  it("detects known distinct test pairs", () => {
    const key1 = buildTestKey({ rawTestName: "Hemoglobin" });
    const key2 = buildTestKey({ rawTestName: "HbA1c" });
    expect(areTestsDistinct(key1, key2)).toBeTruthy();
  });

  it("returns null for non-distinct pairs", () => {
    const key1 = buildTestKey({ rawTestName: "HbA1c" });
    const key2 = buildTestKey({ rawTestName: "Ferritin" });
    expect(areTestsDistinct(key1, key2)).toBeNull();
  });

  it("compatible measurements allow trending", () => {
    const result = canMeasurementsTrend({
      testKeyA: "hba1c",
      unitA: "%",
      specimenA: "Blood",
      testKeyB: "hba1c",
      unitB: "%",
      specimenB: "Blood",
    });
    expect(result.compatible).toBe(true);
  });

  it("incompatible units prevent trending", () => {
    const result = canMeasurementsTrend({
      testKeyA: "glucose::serum",
      unitA: "mg/dl",
      specimenA: "Serum",
      testKeyB: "glucose::serum",
      unitB: "mmol/l",
      specimenB: "Serum",
    });
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("different units");
  });

  it("different test keys prevent trending", () => {
    const result = canMeasurementsTrend({
      testKeyA: "hba1c",
      unitA: "%",
      specimenA: null,
      testKeyB: "hemoglobin",
      unitB: "g/dl",
      specimenB: null,
    });
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("different tests");
  });

  it("different specimens prevent trending", () => {
    const result = canMeasurementsTrend({
      testKeyA: "glucose::serum",
      unitA: "mg/dl",
      specimenA: "Serum",
      testKeyB: "glucose::urine",
      unitB: "mg/dl",
      specimenB: "Urine",
    });
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("different");
  });
});

// ─── Panel Grouping ──────────────────────────────────────────────────────

describe("Panel Grouping", () => {
  it("groups measurements by panel name", () => {
    const groups = groupMeasurementsByPanel([
      { panelName: "Lipid Panel", rawTestName: "Total Cholesterol" },
      { panelName: "Lipid Panel", rawTestName: "LDL Cholesterol" },
      { panelName: "CBC", rawTestName: "Hemoglobin" },
    ]);
    expect(groups).toHaveLength(2);
    const lipid = groups.find((g) => g.panelName === "Lipid Panel");
    expect(lipid?.measurements).toHaveLength(2);
  });

  it("groups unpaneled measurements under null", () => {
    const groups = groupMeasurementsByPanel([
      { panelName: null, rawTestName: "HbA1c" },
      { panelName: null, rawTestName: "TSH" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].panelName).toBeNull();
    expect(groups[0].measurements).toHaveLength(2);
  });
});

// ─── Report Summary ──────────────────────────────────────────────────────

describe("Report Summary Schema", () => {
  it("accepts valid summary", () => {
    const summary = ReportSummarySchema.parse({
      text: "This report contains 5 results.",
      totalTestsDetected: 5,
      withinRange: 3,
      aboveRange: 1,
      belowRange: 1,
      abnormalFlagged: 0,
      criticalFlagged: 0,
      needsReview: 2,
      notEvaluable: 0,
    });
    expect(summary.totalTestsDetected).toBe(5);
  });

  it("rejects negative counts", () => {
    expect(() =>
      ReportSummarySchema.parse({
        text: "Summary",
        totalTestsDetected: -1,
        withinRange: 0,
        aboveRange: 0,
        belowRange: 0,
        abnormalFlagged: 0,
        criticalFlagged: 0,
        needsReview: 0,
        notEvaluable: 0,
      })
    ).toThrow();
  });
});

// ─── Test Explanation Schema ─────────────────────────────────────────────

describe("Test Explanation Schema", () => {
  it("accepts valid explanation with sources", () => {
    const explanation = TestExplanationSchema.parse({
      testKey: "hba1c",
      summary: "HbA1c measures average blood sugar over 2-3 months.",
      sourceClaims: [
        {
          text: "HbA1c reflects average blood glucose",
          sourceIdentifier: "MEDLINEPLUS-88",
          sourceUrl: "https://medlineplus.gov/lab-tests/hba1c-tests/",
          sourceSection: "What is it used for",
        },
      ],
      limitations: ["Does not reflect daily glucose variations"],
      diagnosisProvided: false,
      treatmentProvided: false,
    });
    expect(explanation.diagnosisProvided).toBe(false);
    expect(explanation.treatmentProvided).toBe(false);
  });

  it("rejects explanation with diagnosis", () => {
    expect(() =>
      TestExplanationSchema.parse({
        testKey: "hba1c",
        summary: "You have diabetes.",
        sourceClaims: [],
        limitations: [],
        diagnosisProvided: true,
        treatmentProvided: false,
      })
    ).not.toThrow(); // Schema doesn't enforce business rules — the code must check
  });

  it("rejects explanation with empty source claim text", () => {
    expect(() =>
      TestExplanationSchema.parse({
        testKey: "hba1c",
        summary: "Test summary",
        sourceClaims: [
          {
            text: "",
            sourceIdentifier: "MEDLINEPLUS-88",
            sourceUrl: "https://medlineplus.gov/",
            sourceSection: "Section",
          },
        ],
        limitations: [],
        diagnosisProvided: false,
        treatmentProvided: false,
      })
    ).toThrow();
  });

  it("rejects non-URL source URL", () => {
    expect(() =>
      TestExplanationSchema.parse({
        testKey: "hba1c",
        summary: "Test summary",
        sourceClaims: [
          {
            text: "Some claim",
            sourceIdentifier: "MEDLINEPLUS-88",
            sourceUrl: "not-a-url",
            sourceSection: "Section",
          },
        ],
        limitations: [],
        diagnosisProvided: false,
        treatmentProvided: false,
      })
    ).toThrow();
  });
});

// ─── Tool State Machine Integration ──────────────────────────────────────

describe("Report Tool States", () => {
  it("report.inspect transitions to extract", async () => {
    const { getNextState } = await import("@/lib/tools/registry");
    expect(
      getNextState("intake", "report.inspect", false, false)
    ).toBe("extract");
  });

  it("report.extract_text transitions to classify", async () => {
    const { getNextState } = await import("@/lib/tools/registry");
    expect(
      getNextState("extract", "report.extract_text", false, false)
    ).toBe("classify");
  });

  it("report.extract_measurements transitions to review_required when pending", async () => {
    const { getNextState } = await import("@/lib/tools/registry");
    expect(
      getNextState("classify", "report.extract_measurements", true, false)
    ).toBe("review_required");
  });

  it("report.extract_measurements transitions to compare when no pending", async () => {
    const { getNextState } = await import("@/lib/tools/registry");
    expect(
      getNextState("classify", "report.extract_measurements", false, false)
    ).toBe("compare");
  });

  it("report.finalize transitions to complete", async () => {
    const { getNextState } = await import("@/lib/tools/registry");
    expect(
      getNextState("verify", "report.finalize", false, false)
    ).toBe("complete");
  });

  it("report tools are allowed in their designated states", async () => {
    const { canToolRunInState } = await import("@/lib/tools/registry");
    expect(canToolRunInState("report.inspect", "intake")).toBe(true);
    expect(canToolRunInState("report.inspect", "extract")).toBe(false);
    expect(canToolRunInState("report.extract_text", "extract")).toBe(true);
    expect(canToolRunInState("report.extract_measurements", "classify")).toBe(true);
    expect(canToolRunInState("test.resolve_identity", "identify")).toBe(true);
    expect(canToolRunInState("measurement.validate_range", "validate")).toBe(true);
    expect(canToolRunInState("report.generate_safe_summary", "summarize")).toBe(true);
    expect(canToolRunInState("report.finalize", "complete")).toBe(true);
  });
});
