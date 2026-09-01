/**
 * Deterministic range-status calculation.
 *
 * Rules:
 * - Use ONLY the reference range printed in that specific report.
 * - Never use a universal reference range.
 * - Never let the LLM decide calculated_status.
 * - Never claim a result is "healthy" or "unhealthy".
 */

import type { CalculatedStatus } from "./types";

/**
 * Calculate the range status from the report's printed values.
 */
export function calculateRangeStatus(params: {
  valueNumeric: number | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  reportFlag: string | null;
}): CalculatedStatus {
  const { valueNumeric, referenceLow, referenceHigh, reportFlag } = params;

  // If we have a numeric value and at least one bound, we can compare
  if (valueNumeric !== null) {
    const hasLow = referenceLow !== null;
    const hasHigh = referenceHigh !== null;

    if (hasLow && hasHigh) {
      if (valueNumeric < referenceLow!) return "below_range";
      if (valueNumeric > referenceHigh!) return "above_range";
      return "within_range";
    }

    if (hasLow && !hasHigh) {
      if (valueNumeric < referenceLow!) return "below_range";
      return "within_range";
    }

    if (!hasLow && hasHigh) {
      if (valueNumeric > referenceHigh!) return "above_range";
      return "within_range";
    }
  }

  // No numeric bounds available — check for report flag
  if (reportFlag) {
    const flag = reportFlag.toLowerCase();
    if (
      flag.includes("abnormal") ||
      flag.includes("high") ||
      flag.includes("low") ||
      flag.includes("positive") ||
      flag.includes("elevated") ||
      flag.includes("increased") ||
      flag.includes("decreased") ||
      flag.includes("outside")
    ) {
      return "report_marked_abnormal";
    }
  }

  return "cannot_determine";
}

/**
 * Display wording for a calculated status.
 */
export function getStatusLabel(status: CalculatedStatus): string {
  switch (status) {
    case "within_range":
      return "Within this report's printed reference range";
    case "above_range":
      return "Above this report's printed reference range";
    case "below_range":
      return "Below this report's printed reference range";
    case "report_marked_abnormal":
      return "Marked abnormal by the report";
    case "cannot_determine":
      return "Range status could not be determined";
  }
}

/**
 * CSS class for status display (never use alone — always with text).
 */
export function getStatusColor(status: CalculatedStatus): string {
  switch (status) {
    case "within_range":
      return "text-success";
    case "above_range":
      return "text-warning";
    case "below_range":
      return "text-warning";
    case "report_marked_abnormal":
      return "text-error";
    case "cannot_determine":
      return "text-text-secondary";
  }
}
