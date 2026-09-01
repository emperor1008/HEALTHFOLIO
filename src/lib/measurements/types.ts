/**
 * Medical measurement types — shared between API, UI, and extraction.
 */

export interface MedicalMeasurement {
  id: string;
  user_id: string;
  portfolio_id: string;
  document_id: string;
  extraction_id: string | null;
  original_test_name: string;
  normalized_test_name: string;
  coding_system: string | null;
  coding_code: string | null;
  value_numeric: number | null;
  value_text: string | null;
  original_unit: string | null;
  normalized_unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  report_flag: string | null;
  calculated_status: CalculatedStatus;
  specimen_collected_at: string | null;
  observed_at: string | null;
  report_issued_at: string | null;
  page_number: number;
  evidence_text: string;
  confidence: number;
  verification_status: VerificationStatus;
  source_fingerprint: string;
  created_at: string;
  updated_at: string;
  invalidated_at: string | null;
}

export type VerificationStatus = "pending" | "verified" | "corrected" | "rejected";

export type CalculatedStatus =
  | "within_range"
  | "above_range"
  | "below_range"
  | "report_marked_abnormal"
  | "cannot_determine";

/** The date used for graphing priority: specimen → observed → reported */
export function getMeasurementDate(m: MedicalMeasurement): string | null {
  return m.specimen_collected_at || m.observed_at || m.report_issued_at || null;
}

/** Whether a measurement is eligible for graphs and summaries */
export function isMeasurementGraphable(m: MedicalMeasurement): boolean {
  if (m.verification_status === "rejected" || m.invalidated_at) return false;
  if (m.verification_status !== "verified" && m.verification_status !== "corrected") return false;
  if (m.value_numeric === null) return false;
  if (!getMeasurementDate(m)) return false;
  return true;
}

/** Whether a measurement is eligible for confirmed summaries (verified or corrected) */
export function isMeasurementConfirmed(m: MedicalMeasurement): boolean {
  if (m.verification_status === "rejected" || m.invalidated_at) return false;
  return m.verification_status === "verified" || m.verification_status === "corrected";
}

/** Graph-eligible point for charting */
export interface MeasurementGraphPoint {
  measurementId: string;
  date: string;
  value: number;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  reportFlag: string | null;
  documentId: string;
  pageNumber: number;
  evidenceText: string;
  documentName?: string;
}

/** Trend summary for a test group */
export interface TestTrendSummary {
  normalizedTestName: string;
  normalizedUnit: string | null;
  latestValue: number;
  latestDate: string;
  previousValue: number | null;
  previousDate: string | null;
  absoluteChange: number | null;
  percentChange: number | null;
  changeDirection: "increased" | "decreased" | "unchanged" | "insufficient_data";
  totalMeasurements: number;
  graphableMeasurements: number;
  points: MeasurementGraphPoint[];
  earliestDate: string | null;
}

/** Overview summary for the health tracking page */
export interface HealthTrackingSummary {
  totalTests: number;
  totalMeasurements: number;
  pendingReview: number;
  trends: TestTrendSummary[];
  latestMeasurements: Array<{
    normalizedTestName: string;
    normalizedUnit: string | null;
    latestValue: number | null;
    latestTextValue: string | null;
    calculatedStatus: CalculatedStatus;
    observedAt: string | null;
    documentId: string;
    pageNumber: number;
    measurementId: string;
  }>;
}
