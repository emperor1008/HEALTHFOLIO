/**
 * Stock-freshness policy (Part 4) — deterministic, server-authoritative.
 *
 * Freshness is computed ONLY from `server_recorded_at` (set by the database on
 * every stock event), never from client clocks. The policy is configurable so
 * the deployment can tune thresholds without code changes.
 *
 * SAFETY CONTRACT
 * - A stale/expired "available" event must NEVER be shown to patients as
 *   current availability.
 * - This module never interprets medicine suitability, dose, or substitutions.
 */

export interface FreshnessPolicy {
  /** Hours within which data is "fresh" — strong availability language OK. */
  freshHours: number;
  /** Hours after which data is "stale" — shown as "Not recently confirmed". */
  staleHours: number;
  /** Hours after which data is "expired" — never shown as available. */
  expiredHours: number;
}

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  freshHours: 24,
  staleHours: 72,
  expiredHours: 7 * 24,
};

export type FreshnessLevel = "fresh" | "aging" | "stale" | "expired";

export function classifyFreshness(
  serverRecordedAt: string,
  now: Date = new Date(),
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): FreshnessLevel {
  const recorded = new Date(serverRecordedAt).getTime();
  if (Number.isNaN(recorded)) return "expired";
  const hoursElapsed = (now.getTime() - recorded) / (1000 * 60 * 60);

  if (hoursElapsed < 0) return "fresh"; // future timestamp: clock skew — treat leniently
  if (hoursElapsed < policy.freshHours) return "fresh";
  if (hoursElapsed < policy.staleHours) return "aging";
  if (hoursElapsed < policy.expiredHours) return "stale";
  return "expired";
}

export interface PatientStockDisplay {
  /** One of the four safe patient states. */
  displayStatus:
    | "available"
    | "low_stock"
    | "unavailable"
    | "not_stocked"
    | "not_recently_confirmed"
    | "no_update";
  lastConfirmedAt: string | null;
  freshness: FreshnessLevel;
}

/**
 * Patient-facing display decision. Deterministic. Never leaks staff-only
 * fields (quantity hints, internal notes).
 */
export function patientDisplayForEvent(
  event: { status: string; server_recorded_at: string } | null,
  now: Date = new Date(),
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): PatientStockDisplay {
  if (!event) {
    return { displayStatus: "no_update", lastConfirmedAt: null, freshness: "expired" };
  }
  const freshness = classifyFreshness(event.server_recorded_at, now, policy);
  if (event.status === "available" && (freshness === "stale" || freshness === "expired")) {
    return {
      displayStatus: "not_recently_confirmed",
      lastConfirmedAt: event.server_recorded_at,
      freshness,
    };
  }
  if (event.status === "available" && freshness === "aging") {
    // Aging availability: keep status but the UI must use cautious language.
    return { displayStatus: "available", lastConfirmedAt: event.server_recorded_at, freshness };
  }
  return { displayStatus: event.status as PatientStockDisplay["displayStatus"], lastConfirmedAt: event.server_recorded_at, freshness };
}
