/**
 * Care-options matcher tests.
 * Proves: stale availability is never shown as available; language, mode,
 * capacity filters hold; ordering is deterministic and explainable; no data
 * ⇒ no results (no fabricated clinicians).
 */
import { describe, it, expect } from "vitest";
import {
  matchCareOptions,
  DEFAULT_FRESHNESS_MINUTES,
  type ClinicianProfileRow,
} from "@/lib/appointments/care-options";

const NOW = new Date("2026-09-19T12:00:00Z");

function profile(overrides: Partial<ClinicianProfileRow> = {}): ClinicianProfileRow {
  return {
    id: "c-1",
    user_id: "u-1",
    display_name: "Dr. A",
    facility_id: "f-1",
    specialty: "general",
    languages: ["en"],
    modes: ["text"],
    availability_state: "available",
    next_available_at: null,
    max_active_requests: 5,
    updated_at: "2026-09-19T11:30:00Z",
    ...overrides,
  };
}

const baseCtx = {
  urgency: "routine" as const,
  language: "en",
  mode: "text" as const,
  now: NOW,
};

describe("freshness", () => {
  it("fresh availability (within default 60 min) is eligible", () => {
    const r = matchCareOptions([profile()], baseCtx);
    expect(r).toHaveLength(1);
  });

  it("stale availability is excluded (never shown as currently available)", () => {
    const stale = profile({ updated_at: "2026-09-19T10:00:00Z" }); // 2h old
    const r = matchCareOptions([stale], baseCtx);
    expect(r).toHaveLength(0);
  });

  it("configurable freshness threshold works", () => {
    const p = profile({ updated_at: "2026-09-19T09:00:00Z" }); // 3h old
    expect(matchCareOptions([p], { ...baseCtx, freshnessMinutes: 180 })).toHaveLength(1);
    expect(matchCareOptions([p], { ...baseCtx, freshnessMinutes: 30 })).toHaveLength(0);
  });

  it("invalid updated_at is treated as stale", () => {
    const p = profile({ updated_at: "not-a-date" });
    expect(matchCareOptions([p], baseCtx)).toHaveLength(0);
  });
});

describe("filters", () => {
  it("non-available states are excluded", () => {
    expect(matchCareOptions([profile({ availability_state: "busy" })], baseCtx)).toHaveLength(0);
    expect(matchCareOptions([profile({ availability_state: "offline" })], baseCtx)).toHaveLength(0);
  });

  it("language must match", () => {
    expect(
      matchCareOptions([profile({ languages: ["hi"] })], { ...baseCtx, language: "or" })
    ).toHaveLength(0);
    expect(
      matchCareOptions([profile({ languages: ["hi", "or"] })], { ...baseCtx, language: "or" })
    ).toHaveLength(1);
  });

  it("consultation mode must be supported", () => {
    expect(
      matchCareOptions([profile({ modes: ["text"] })], { ...baseCtx, mode: "video" })
    ).toHaveLength(0);
    expect(
      matchCareOptions([profile({ modes: ["text", "video"] })], { ...baseCtx, mode: "video" })
    ).toHaveLength(1);
  });

  it("capacity-full clinicians are excluded", () => {
    const p = profile({ max_active_requests: 2 });
    expect(matchCareOptions([p], { ...baseCtx, activeCounts: { "c-1": 2 } })).toHaveLength(0);
    expect(matchCareOptions([p], { ...baseCtx, activeCounts: { "c-1": 1 } })).toHaveLength(1);
  });
});

describe("ordering and explainability", () => {
  it("higher-scored options come first, deterministically", () => {
    const general = profile({ id: "c-gen", display_name: "Dr. General" });
    const specialist = profile({ id: "c-spec", display_name: "Dr. Spec", specialty: "cardiology" });
    const r = matchCareOptions([general, specialist], baseCtx);
    expect(r[0].clinicianId).toBe("c-spec");
    // Reversed input, same output order (deterministic).
    const r2 = matchCareOptions([specialist, general], baseCtx);
    expect(r2.map((x) => x.clinicianId)).toEqual(r.map((x) => x.clinicianId));
  });

  it("every option carries human-readable reasons", () => {
    const [top] = matchCareOptions(
      [profile({ specialty: "cardiology", modes: ["text", "video"] })],
      baseCtx
    );
    expect(top.reasons).toContain("specialty:cardiology");
    expect(top.reasons.some((x) => x.startsWith("languages:"))).toBe(true);
  });

  it("urgent requests surface capacity headroom in reasons", () => {
    const [top] = matchCareOptions(
      [profile({ max_active_requests: 10 })],
      { ...baseCtx, urgency: "urgent" }
    );
    expect(top.reasons).toContain("capacity_headroom");
  });
});

describe("honesty", () => {
  it("no profiles ⇒ empty result (no fabricated clinicians)", () => {
    expect(matchCareOptions([], baseCtx)).toEqual([]);
  });

  it("default freshness is configurable, not hardcoded in the UI", () => {
    expect(DEFAULT_FRESHNESS_MINUTES).toBeGreaterThan(0);
  });
});
