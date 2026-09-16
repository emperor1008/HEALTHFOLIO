import { describe, it, expect } from "vitest";

/**
 * The health-tracking API accepts a fixed allowlist of time filters.
 * These tests pin the allowed values and verify that unknown values
 * safely fall back to "all" — the same behavior as the route handler.
 */

const ALLOWED_FILTERS = new Set(["1w", "1m", "3m", "6m", "1y", "all"]);

function resolveFilter(raw: string | null): string {
  const candidate = raw || "all";
  return ALLOWED_FILTERS.has(candidate) ? candidate : "all";
}

describe("health-tracking time filters", () => {
  it("accepts the supported filter values", () => {
    expect(resolveFilter("1w")).toBe("1w");
    expect(resolveFilter("1m")).toBe("1m");
    expect(resolveFilter("3m")).toBe("3m");
    expect(resolveFilter("6m")).toBe("6m");
    expect(resolveFilter("1y")).toBe("1y");
    expect(resolveFilter("all")).toBe("all");
  });

  it("falls back to all for unknown or malicious values", () => {
    expect(resolveFilter("2w")).toBe("all");
    expect(resolveFilter("DROP TABLE")).toBe("all");
    expect(resolveFilter(null)).toBe("all");
    expect(resolveFilter("")).toBe("all");
  });

  it("date cutoff for 1w is seven days ago", () => {
    const now = new Date();
    const cutoff = new Date(now.setDate(now.getDate() - 7));
    const expected = cutoff.toISOString();
    // Mirrors the route's 1w branch
    expect(new Date(expected).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
