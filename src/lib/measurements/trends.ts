/**
 * Deterministic trend calculations for health measurements.
 *
 * Rules:
 * - Never claim clinical significance.
 * - Use only verified/corrected measurements.
 * - Handle edge cases: zero previous value, duplicate dates, incompatible units.
 */

import type { MedicalMeasurement, MeasurementGraphPoint, TestTrendSummary } from "./types";
import { getMeasurementDate, isMeasurementGraphable } from "./types";

/**
 * Build graph-eligible points from measurements.
 * Returns points sorted chronologically.
 */
export function buildGraphPoints(
  measurements: MedicalMeasurement[],
  documentNames?: Map<string, string>
): MeasurementGraphPoint[] {
  const points: MeasurementGraphPoint[] = [];

  for (const m of measurements) {
    if (!isMeasurementGraphable(m)) continue;
    if (m.value_numeric === null) continue;

    const date = getMeasurementDate(m);
    if (!date) continue;

    points.push({
      measurementId: m.id,
      date,
      value: m.value_numeric,
      unit: m.normalized_unit,
      referenceLow: m.reference_low,
      referenceHigh: m.reference_high,
      reportFlag: m.report_flag,
      documentId: m.document_id,
      pageNumber: m.page_number,
      evidenceText: m.evidence_text,
      documentName: documentNames?.get(m.document_id),
    });
  }

  // Sort chronologically
  points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return points;
}

/**
 * Calculate the trend summary for a group of measurements with the same test.
 */
export function calculateTrendSummary(
  normalizedTestName: string,
  measurements: MedicalMeasurement[],
  documentNames?: Map<string, string>
): TestTrendSummary | null {
  const points = buildGraphPoints(measurements, documentNames);

  // Need at least 1 point for any summary
  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  const previous = points.length >= 2 ? points[points.length - 2] : null;

  let absoluteChange: number | null = null;
  let percentChange: number | null = null;
  let changeDirection: TestTrendSummary["changeDirection"] = "insufficient_data";

  if (previous) {
    absoluteChange = latest.value - previous.value;
    changeDirection = absoluteChange > 0 ? "increased" : absoluteChange < 0 ? "decreased" : "unchanged";

    if (previous.value !== 0) {
      percentChange = (absoluteChange / Math.abs(previous.value)) * 100;
    }
  } else {
    changeDirection = "insufficient_data";
  }

  // All confirmed measurements (verified or corrected, not rejected/invalidated)
  const confirmed = measurements.filter(
    (m) =>
      (m.verification_status === "verified" || m.verification_status === "corrected") &&
      !m.invalidated_at
  );

  return {
    normalizedTestName,
    normalizedUnit: latest.unit,
    latestValue: latest.value,
    latestDate: latest.date,
    previousValue: previous?.value ?? null,
    previousDate: previous?.date ?? null,
    absoluteChange,
    percentChange,
    changeDirection,
    totalMeasurements: confirmed.length,
    graphableMeasurements: points.length,
    points,
    earliestDate: points[0]?.date ?? null,
  };
}

/**
 * Check if a set of measurements is eligible for graphing.
 * Returns true if 2+ verified/corrected measurements exist with the same
 * normalized test name, same normalized unit, and valid dates.
 */
export function isGraphEligible(
  measurements: MedicalMeasurement[]
): { eligible: boolean; reason?: string } {
  const graphable = measurements.filter(
    (m) =>
      isMeasurementGraphable(m) &&
      (m.verification_status === "verified" || m.verification_status === "corrected")
  );

  if (graphable.length < 2) {
    return {
      eligible: false,
      reason: `Need at least 2 comparable measurements, found ${graphable.length}.`,
    };
  }

  // Check unit consistency
  const units = new Set(graphable.map((m) => m.normalized_unit));
  if (units.size > 1) {
    return {
      eligible: false,
      reason: "These results use different units and cannot yet be compared safely.",
    };
  }

  return { eligible: true };
}
