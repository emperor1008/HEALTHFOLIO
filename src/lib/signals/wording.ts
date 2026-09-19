/**
 * Health Signal Monitor — safe user-facing wording.
 *
 * Converts engine payloads into factual, evidence-based sentences only.
 * A hard guard rejects any forbidden diagnosis/treatment/urgency/risk wording
 * so it can never reach the UI. Dates render as "14 Jun 2026" style.
 * Numbers keep their plain form (no invented precision).
 */

import type { ComparisonPayload, RangePayload, SignalType } from "./engine";

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bdangerous\b/i,
  /\bmedically significant\b/i,
  /\bserious\b/i,
  /\bsevere\b/i,
  /\bcritical\b/i,
  /\bhigh[- ]risk\b/i,
  /\blow[- ]risk\b/i,
  /\bat risk\b/i,
  /\brisk(y)?\b/i,
  /\burgent(ly)?\b/i,
  /\bemergenc(y|ies)\b/i,
  /\byou need treatment\b/i,
  /\btreatment\b/i,
  /\bdosage\b/i,
  /\bdose adjustment\b/i,
  /\bdiagnos(is|e|ed|es)\b/i,
  /\bdisease\b/i,
  /\bcondition is (worsening|improving)\b/i,
  /\bworsen(ing)?\b/i,
  /\bimprov(e|ed|ing)\b/i,
  /\bhealth score\b/i,
  /\balert\b/i,
  /\byou have\b/i,
  /\babnormal\b/i,
  /\bnormal\b/i,
  /\bbetter\b/i,
  /\bworse\b/i,
  /\bconcern(ing)?\b/i,
  /\bshould (see|consult|talk to) (a|your) doctor\b/i,
];

export function containsForbiddenWording(text: string): boolean {
  if (!text) return false;
  return FORBIDDEN_PATTERNS.some((p) => p.test(text));
}

/** Formats a date-like string as "14 Jun 2026"; returns "" when unusable. */
export function formatSignalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Plain numeric display: keeps decimals the data already has, no invented precision. */
export function formatSignalValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return String(value);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function signedPercent(n: number): string {
  return `${n > 0 ? "+" : ""}${n}%`;
}

/** "6.8" + "%" → "6.8%" (no space, no invented precision). */
function withUnit(value: string, unit: string | null | undefined): string {
  return unit ? `${value}${unit}` : value;
}

export interface SignalCopy {
  headline: string;
  lines: string[];
}

/**
 * Factual copy for a signal. Every string is passed through the
 * forbidden-wording guard; a violation yields a neutral fallback.
 */
export function describeSignal(
  signalType: SignalType,
  displayName: string,
  payload: unknown
): SignalCopy {
  let copy: SignalCopy;
  try {
    copy = buildCopy(signalType, displayName, payload);
  } catch {
    copy = {
      headline: "New verified result available.",
      lines: ["Review the source records before discussing results with a clinician."],
    };
  }

  const safe = {
    headline: containsForbiddenWording(copy.headline)
      ? "New verified result available."
      : copy.headline,
    lines: copy.lines.map((l) =>
      containsForbiddenWording(l)
        ? "Review the source records before discussing results with a clinician."
        : l
    ),
  };
  return safe;
}

function buildCopy(signalType: SignalType, displayName: string, payload: unknown): SignalCopy {
  const p = (payload || {}) as Record<string, unknown>;

  switch (signalType) {
    case "first_verified_result":
      return {
        headline: `First verified result recorded for ${displayName}.`,
        lines: [
          "No comparable verified result is available yet.",
          "Review the source records before discussing results with a clinician.",
        ],
      };

    case "numeric_change_observed": {
      const c = p as unknown as ComparisonPayload;
      const unit = c.unit;
      const lines = [
        `Compared with your previous verified result from ${formatSignalDate(c.baselineDate)}.`,
        `Recorded value changed from ${withUnit(formatSignalValue(c.baselineValue), unit)} to ${withUnit(formatSignalValue(c.latestValue), unit)}.`,
      ];
      if (c.percentChange !== null && c.percentChange !== undefined) {
        lines.push(
          `That is a change of ${withUnit(signed(c.absoluteChange), unit)} (${signedPercent(c.percentChange)}) over ${c.daysBetween} days between reports.`
        );
      } else {
        lines.push(`That is a change of ${withUnit(signed(c.absoluteChange), unit)} over ${c.daysBetween} days between reports.`);
      }
      lines.push("Review the source records before discussing results with a clinician.");
      return { headline: `New verified result available for ${displayName}.`, lines };
    }

    case "report_marked_outside_range": {
      const r = p as unknown as RangePayload;
      const lines: string[] = [];
      const unit = r.unit;
      if (r.referenceLow !== null && r.referenceHigh !== null) {
        lines.push(
          r.calculatedStatus === "below_range"
            ? "This report marks the latest result below its printed reference range."
            : "This report marks the latest result above its printed reference range."
        );
        lines.push(
          `Printed reference range on the report: ${withUnit(formatSignalValue(r.referenceLow), unit)} to ${withUnit(formatSignalValue(r.referenceHigh), unit)}. Recorded value: ${withUnit(formatSignalValue(r.value), unit)}.`
        );
      } else if (r.referenceText) {
        lines.push(
          `This report marks the result outside its reference range. Reference printed on the report: ${r.referenceText}.`
        );
      } else {
        lines.push(
          `This report marks the result outside its printed reference range. Recorded value: ${withUnit(formatSignalValue(r.value), unit)}.`
        );
      }
      lines.push("Review the source records before discussing results with a clinician.");
      return { headline: `Report notes for ${displayName}.`, lines };
    }

    case "report_marked_within_range": {
      const r = p as unknown as RangePayload;
      const unit = r.unit;
      const lines: string[] = [];
      if (r.referenceLow !== null && r.referenceHigh !== null) {
        lines.push(
          `This report marks the result within its printed reference range. Printed range: ${withUnit(formatSignalValue(r.referenceLow), unit)} to ${withUnit(formatSignalValue(r.referenceHigh), unit)}. Recorded value: ${withUnit(formatSignalValue(r.value), unit)}.`
        );
      } else {
        lines.push(
          `This report marks the result within its printed reference range. Recorded value: ${withUnit(formatSignalValue(r.value), unit)}.`
        );
      }
      lines.push("Review the source records before discussing results with a clinician.");
      return { headline: `Report notes for ${displayName}.`, lines };
    }

    case "comparison_unavailable_unit_mismatch": {
      const lu = (p.latestUnit as string) || "";
      const bu = (p.baselineUnit as string) || "";
      return {
        headline: `Comparison unavailable for ${displayName}.`,
        lines: [
          "Healthfolio could not compare these values because their units differ.",
          `Earlier result recorded in ${bu || "a different unit"}; latest result recorded in ${lu || "a different unit"}.`,
          "Review the source records before discussing results with a clinician.",
        ],
      };
    }

    case "source_needs_review":
      return {
        headline: `Source needs review for ${displayName}.`,
        lines: [
          "The linked source document needs review before a comparison can be made.",
          "Review the source records before discussing results with a clinician.",
        ],
      };

    case "measurement_invalidated":
      return {
        headline: `A previously compared result is no longer available for ${displayName}.`,
        lines: [
          "This source is no longer available for comparison.",
          "Your records were not changed.",
        ],
      };

    default:
      return {
        headline: "New verified result available.",
        lines: ["Review the source records before discussing results with a clinician."],
      };
  }
}
