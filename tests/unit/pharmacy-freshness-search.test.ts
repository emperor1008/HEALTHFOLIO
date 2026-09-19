/**
 * Part 4 unit tests — freshness policy and medicine search safety.
 */

import { describe, it, expect } from "vitest";
import {
  classifyFreshness,
  patientDisplayForEvent,
  DEFAULT_FRESHNESS_POLICY,
} from "@/lib/pharmacy/freshness";
import {
  searchMedicinesOffline,
  medicineDisplayLabel,
} from "@/lib/pharmacy/medicine-search";

const HOUR = 1000 * 60 * 60;
function hoursAgo(h: number, now: Date = new Date()): string {
  return new Date(now.getTime() - h * HOUR).toISOString();
}
const NOW = new Date("2026-09-19T10:00:00Z");

describe("freshness policy", () => {
  it("classifies fresh within the fresh threshold", () => {
    expect(classifyFreshness(hoursAgo(1, NOW), NOW, DEFAULT_FRESHNESS_POLICY)).toBe("fresh");
    expect(classifyFreshness(hoursAgo(23, NOW), NOW, DEFAULT_FRESHNESS_POLICY)).toBe("fresh");
  });

  it("classifies aging between fresh and stale thresholds", () => {
    expect(classifyFreshness(hoursAgo(30, NOW), NOW, DEFAULT_FRESHNESS_POLICY)).toBe("aging");
  });

  it("classifies stale between stale and expired thresholds", () => {
    expect(classifyFreshness(hoursAgo(96, NOW), NOW, DEFAULT_FRESHNESS_POLICY)).toBe("stale");
  });

  it("classifies expired beyond the expired threshold", () => {
    expect(classifyFreshness(hoursAgo(8 * 24, NOW), NOW, DEFAULT_FRESHNESS_POLICY)).toBe("expired");
  });

  it("treats invalid timestamps as expired (never as available)", () => {
    expect(classifyFreshness("not-a-date", NOW)).toBe("expired");
  });
});

describe("patient display projection", () => {
  it("keeps available + fresh as available", () => {
    const d = patientDisplayForEvent({ status: "available", server_recorded_at: hoursAgo(2, NOW) }, NOW);
    expect(d.displayStatus).toBe("available");
    expect(d.lastConfirmedAt).toBe(hoursAgo(2, NOW));
  });

  it("converts stale AVAILABLE into not_recently_confirmed (safety rule)", () => {
    const d = patientDisplayForEvent({ status: "available", server_recorded_at: hoursAgo(96, NOW) }, NOW);
    expect(d.displayStatus).toBe("not_recently_confirmed");
    expect(d.lastConfirmedAt).toBe(hoursAgo(96, NOW));
  });

  it("converts expired AVAILABLE into not_recently_confirmed (never current availability)", () => {
    const d = patientDisplayForEvent({ status: "available", server_recorded_at: hoursAgo(8 * 24, NOW) }, NOW);
    expect(d.displayStatus).toBe("not_recently_confirmed");
  });

  it("no event means no_update", () => {
    const d = patientDisplayForEvent(null, NOW);
    expect(d.displayStatus).toBe("no_update");
    expect(d.lastConfirmedAt).toBeNull();
  });

  it("non-available statuses pass through with their freshness", () => {
    const d = patientDisplayForEvent({ status: "low_stock", server_recorded_at: hoursAgo(1, NOW) }, NOW);
    expect(d.displayStatus).toBe("low_stock");
    expect(d.freshness).toBe("fresh");
  });
});

describe("medicine search safety", () => {
  it("preserves the original query verbatim", () => {
    const r = searchMedicinesOffline("  ParaCetamol 500mg ");
    expect(r.originalQuery).toBe("  ParaCetamol 500mg ");
  });

  it("matches exact names with high confidence", () => {
    const r = searchMedicinesOffline("paracetamol");
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates[0].confidence).toBeGreaterThanOrEqual(0.95);
    expect(r.suggestionAvailable).toBe(true);
  });

  it("resolves common brand aliases (Crocin → acetaminophen identity)", () => {
    const r = searchMedicinesOffline("crocin");
    expect(r.candidates[0]?.medicineId).toBe("rxnorm:161");
    expect(r.candidates[0]?.genericName).toBe("acetaminophen");
  });

  it("suggests a typo correction only above the confidence threshold", () => {
    const typo = searchMedicinesOffline("paracetmol");
    const ok = typo.candidates.length > 0 && typo.candidates[0].confidence >= 0.92;
    if (ok) {
      expect(typo.suggestionAvailable).toBe(true);
    } else {
      expect(typo.suggestionAvailable).toBe(false);
      expect(typo.candidates.length).toBe(0);
    }
  });

  it("returns no candidates for nonsense input (never guesses)", () => {
    const r = searchMedicinesOffline("zzzqqq");
    expect(r.candidates).toHaveLength(0);
    expect(r.suggestionAvailable).toBe(false);
  });

  it("is deterministic: same input, same ordered output", () => {
    const a = searchMedicinesOffline("amox");
    const b = searchMedicinesOffline("amox");
    expect(a).toEqual(b);
  });

  it("display label includes strength when present", () => {
    const r = searchMedicinesOffline("paracetamol 500mg");
    if (r.candidates.length > 0) {
      expect(medicineDisplayLabel(r.candidates[0])).toContain("500");
    }
  });

  it("carries no dosage or treatment advice fields at all", () => {
    const r = searchMedicinesOffline("ibuprofen");
    for (const c of r.candidates) {
      expect(Object.keys(c).sort()).toEqual(
        ["brandName", "confidence", "doseForm", "displayName", "genericName", "medicineId", "source", "strength"].sort(),
      );
    }
  });
});
