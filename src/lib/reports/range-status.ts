/**
 * Extended deterministic range-status calculation for laboratory reports.
 *
 * Supports all Feature 4 status types:
 * - below_range, within_range, above_range (numeric comparison)
 * - report_marked_abnormal, report_marked_critical (flag-based)
 * - qualitative_positive, qualitative_negative (qualitative results)
 * - indeterminate, not_evaluable, pending_review, rejected, invalidated
 *
 * Rules:
 * - Use ONLY the reference range printed in that specific report.
 * - Never use a universal reference range.
 * - Never let the LLM decide range_status.
 * - Never claim a result is "healthy" or "unhealthy".
 */

export type ExtendedRangeStatus =
  | "below_range"
  | "within_range"
  | "above_range"
  | "report_marked_abnormal"
  | "report_marked_critical"
  | "qualitative_positive"
  | "qualitative_negative"
  | "indeterminate"
  | "not_evaluable"
  | "pending_review"
  | "rejected"
  | "invalidated";

/**
 * Calculate the range status from the report's printed values.
 * This is a superset of the Feature 1 calculateRangeStatus.
 */
export function calculateExtendedRangeStatus(params: {
  numericValue: number | null;
  referenceLower: number | null;
  referenceUpper: number | null;
  laboratoryFlagRaw: string | null;
  resultType: string;
  qualitativeValue: string | null;
  comparator: string | null;
}): ExtendedRangeStatus {
  const {
    numericValue,
    referenceLower,
    referenceUpper,
    laboratoryFlagRaw,
    resultType,
    qualitativeValue,
    comparator,
  } = params;

  // Check for critical flag first
  if (laboratoryFlagRaw) {
    const flag = laboratoryFlagRaw.toLowerCase();
    if (
      flag.includes("critical") ||
      flag.includes("panic") ||
      flag.includes("alert")
    ) {
      return "report_marked_critical";
    }
  }

  // Numeric comparison
  if (numericValue !== null && resultType === "numeric") {
    const hasLow = referenceLower !== null;
    const hasHigh = referenceUpper !== null;

    // Handle comparators
    if (comparator === "less_than" || comparator === "less_than_or_equal") {
      // Value is below a threshold — use the bound as the comparison point
      if (hasHigh && numericValue > referenceUpper!) return "above_range";
      if (hasLow && numericValue < referenceLower!) return "below_range";
      return "within_range";
    }
    if (comparator === "greater_than" || comparator === "greater_than_or_equal") {
      if (hasHigh && numericValue > referenceUpper!) return "above_range";
      if (hasLow && numericValue < referenceLower!) return "below_range";
      return "within_range";
    }

    if (hasLow && hasHigh) {
      if (numericValue < referenceLower!) return "below_range";
      if (numericValue > referenceUpper!) return "above_range";
      return "within_range";
    }

    if (hasLow && !hasHigh) {
      if (numericValue < referenceLower!) return "below_range";
      return "within_range";
    }

    if (!hasLow && hasHigh) {
      if (numericValue > referenceUpper!) return "above_range";
      return "within_range";
    }
  }

  // Qualitative result
  if (resultType === "qualitative" && qualitativeValue) {
    const val = qualitativeValue.toLowerCase();
    // Check negative first — "Not Detected" contains "detected" but is negative
    if (
      val.includes("negative") ||
      val.includes("not detected") ||
      val.includes("normal") ||
      val.includes("within")
    ) {
      return "qualitative_negative";
    }
    if (
      val.includes("positive") ||
      val.includes("detected") ||
      val.includes("abnormal") ||
      val.includes("elevated")
    ) {
      return "qualitative_positive";
    }
    return "indeterminate";
  }

  // Check for abnormal flag
  if (laboratoryFlagRaw) {
    const flag = laboratoryFlagRaw.toLowerCase();
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

  // No usable range or flag
  return "not_evaluable";
}

/**
 * Human-readable status label for display.
 */
export function getExtendedStatusLabel(status: ExtendedRangeStatus): string {
  switch (status) {
    case "within_range":
      return "Within printed reference range";
    case "above_range":
      return "Above printed reference range";
    case "below_range":
      return "Below printed reference range";
    case "report_marked_abnormal":
      return "Laboratory marked abnormal";
    case "report_marked_critical":
      return "Laboratory marked critical";
    case "qualitative_positive":
      return "Qualitative positive result";
    case "qualitative_negative":
      return "Qualitative negative result";
    case "indeterminate":
      return "Result indeterminate";
    case "not_evaluable":
      return "Range not available";
    case "pending_review":
      return "Review needed";
    case "rejected":
      return "Rejected";
    case "invalidated":
      return "Invalidated";
  }
}

/**
 * CSS class for status display (never use alone — always with text).
 */
export function getExtendedStatusColor(status: ExtendedRangeStatus): string {
  switch (status) {
    case "within_range":
    case "qualitative_negative":
      return "text-success";
    case "above_range":
    case "below_range":
    case "report_marked_abnormal":
    case "qualitative_positive":
      return "text-warning";
    case "report_marked_critical":
      return "text-error";
    case "indeterminate":
    case "not_evaluable":
    case "pending_review":
      return "text-text-secondary";
    case "rejected":
    case "invalidated":
      return "text-text-secondary opacity-60";
  }
}
