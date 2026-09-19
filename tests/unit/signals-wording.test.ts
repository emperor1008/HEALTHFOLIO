/**
 * Health Signal Monitor — wording guard tests.
 * The forbidden-wording list below is asserted against the formatter's
 * hard guard: violating input must never pass through unchanged.
 */

import { describe, it, expect } from "vitest";
import {
  containsForbiddenWording,
  describeSignal,
  formatSignalDate,
  formatSignalValue,
} from "@/lib/signals/wording";

describe("containsForbiddenWording (test 17)", () => {
  it("rejects diagnosis, treatment, urgency, risk, and claim wording", () => {
    const forbidden = [
      "This is dangerous.",
      "This is medically significant.",
      "You need treatment.",
      "Urgent review needed.",
      "This is an emergency alert.",
      "High-risk result detected.",
      "Your condition is worsening.",
      "You should see a doctor immediately.",
      "You have diabetes.",
      "Health score: 82",
      "This result is abnormal.",
      "Change your dosage.",
    ];
    for (const text of forbidden) {
      expect(containsForbiddenWording(text), `should flag: ${text}`).toBe(true);
    }
  });

  it("allows factual, evidence-based wording", () => {
    const allowed = [
      "New verified result available.",
      "Compared with your previous verified result from 14 Jun 2026.",
      "Recorded value changed from 6.1 to 6.8.",
      "This report marks the latest result above its printed reference range.",
      "Healthfolio could not compare these values because their units differ.",
      "Review the source records before discussing results with a clinician.",
    ];
    for (const text of allowed) {
      expect(containsForbiddenWording(text), `should allow: ${text}`).toBe(false);
    }
  });

  it("falls back to a neutral line when copy somehow violates the guard", () => {
    // Force a violation through a cast — the guard must catch it.
    const copy = describeSignal(
      "measurement_invalidated" as never,
      "HbA1c",
      { forced: "this is dangerous and urgent" }
    );
    expect(containsForbiddenWording(copy.headline)).toBe(false);
    expect(containsForbiddenWording(copy.lines.join(" "))).toBe(false);
  });
});

describe("describeSignal copy", () => {
  it("first result states no comparison is available yet", () => {
    const c = describeSignal("first_verified_result", "HbA1c", {});
    expect(c.headline).toContain("First verified result recorded for HbA1c.");
    expect(c.lines[0]).toBe("No comparable verified result is available yet.");
  });

  it("numeric change uses factual delta wording", () => {
    const c = describeSignal("numeric_change_observed", "HbA1c", {
      baselineValue: 6.1,
      latestValue: 6.8,
      unit: "%",
      absoluteChange: 0.7,
      percentChange: 11.477459,
      baselineDate: "2026-06-01",
      latestDate: "2026-06-15",
      daysBetween: 14,
    });
    expect(c.headline).toBe("New verified result available for HbA1c.");
    expect(c.lines[1]).toBe("Recorded value changed from 6.1% to 6.8%.");
    expect(c.lines[2]).toContain("over 14 days between reports");
  });

  it("unit mismatch explains why comparison is unavailable", () => {
    const c = describeSignal("comparison_unavailable_unit_mismatch", "Glucose", {
      latestUnit: "mg/dL",
      baselineUnit: "mmol/L",
    });
    expect(c.lines[0]).toBe(
      "Healthfolio could not compare these values because their units differ."
    );
  });

  it("outside-range copy names the printed range", () => {
    const c = describeSignal("report_marked_outside_range", "HbA1c", {
      value: 6.8,
      unit: "%",
      calculatedStatus: "above_range",
      referenceLow: 4.0,
      referenceHigh: 5.6,
      referenceText: null,
      reportFlag: "H",
    });
    expect(c.lines[0]).toBe("This report marks the latest result above its printed reference range.");
    expect(c.lines[1]).toContain("4% to 5.6%");
  });

  it("invalidated copy is calm and factual", () => {
    const c = describeSignal("measurement_invalidated", "HbA1c", {});
    expect(c.lines[0]).toBe("This source is no longer available for comparison.");
    expect(c.lines[1]).toBe("Your records were not changed.");
  });
});

describe("formatting helpers", () => {
  it("formats dates as 14 Jun 2026", () => {
    expect(formatSignalDate("2026-06-14")).toBe("14 Jun 2026");
    expect(formatSignalDate("2026-06-14T10:00:00Z")).toBe("14 Jun 2026");
    expect(formatSignalDate(null)).toBe("");
  });

  it("keeps plain numeric form without invented precision", () => {
    expect(formatSignalValue(6.8)).toBe("6.8");
    expect(formatSignalValue(0)).toBe("0");
    expect(formatSignalValue(null)).toBe("—");
  });
});
