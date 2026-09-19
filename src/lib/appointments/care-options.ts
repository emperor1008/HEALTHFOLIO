/**
 * Deterministic, explainable care-options matcher.
 *
 * SAFETY
 * - Sources rows ONLY from real `clinician_profiles` (empty input ⇒ empty
 *   output — the UI shows the honest no-clinician state).
 * - Never ranks by "best": output label is "Available options" / "Available
 *   care team". `score` is exposed with reasons so matching is auditable.
 * - Stale availability is never shown as currently available: a profile is
 *   considered fresh only within `freshnessMinutes` (configurable) of
 *   `updated_at`, and only when the clinician signalled availability.
 * - Emergency packets never reach this matcher (guarded upstream).
 */

import type { TriageCategory } from "@/lib/triage/red-flags";

export interface ClinicianProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  facility_id: string | null;
  specialty: string;
  languages: string[];
  modes: string[];
  availability_state: "available" | "busy" | "offline";
  next_available_at: string | null;
  max_active_requests: number;
  updated_at: string;
}

export interface MatchContext {
  /** From the confirmed Part 2 packet: emergency | urgent | routine. */
  urgency: "emergency" | "urgent" | "routine";
  language: string;
  mode: "text" | "audio" | "video";
  /** Configurable freshness window; expired profiles are excluded. */
  freshnessMinutes?: number;
  now?: Date;
  /** Active assignment counts per clinician id (capacity check). */
  activeCounts?: Record<string, number>;
}

export interface MatchedOption {
  clinicianId: string;
  userId: string;
  displayName: string;
  facilityId: string | null;
  specialty: string;
  languages: string[];
  modes: string[];
  availabilityState: string;
  /** Human-auditable match explanation. */
  reasons: string[];
  score: number;
}

export const DEFAULT_FRESHNESS_MINUTES = 60;

/**
 * Match real available clinicians to a request.
 * Deterministic: same input ⇒ same output order.
 */
export function matchCareOptions(
  profiles: ClinicianProfileRow[],
  ctx: MatchContext
): MatchedOption[] {
  const now = ctx.now ?? new Date();
  const freshnessMs = (ctx.freshnessMinutes ?? DEFAULT_FRESHNESS_MINUTES) * 60_000;

  const eligible = profiles.filter((p) => {
    if (p.availability_state !== "available") return false;
    if (!p.languages.includes(ctx.language)) return false;
    if (!p.modes.includes(ctx.mode)) return false;
    // Freshness: must have signalled availability recently.
    const updated = new Date(p.updated_at).getTime();
    if (!Number.isFinite(updated) || now.getTime() - updated > freshnessMs) return false;
    // Capacity: active assignments must be below max.
    const active = ctx.activeCounts?.[p.id] ?? 0;
    if (active >= p.max_active_requests) return false;
    return true;
  });

  const scored = eligible.map((p) => {
    const reasons: string[] = [];
    let score = 0;

    if (p.specialty !== "general") {
      score += 2;
      reasons.push(`specialty:${p.specialty}`);
    }
    // More supported modes = more flexible scheduling, small boost.
    score += Math.min(p.modes.length - 1, 2);
    if (p.modes.includes("video")) reasons.push("mode:video_supported");
    if (p.next_available_at) {
      score += 1;
      reasons.push("next_available_listed");
    }

    // Urgency shaping (never delays emergency guidance — that happens
    // upstream before this matcher runs): urgent requests prefer clinicians
    // with higher headroom.
    if (ctx.urgency === "urgent") {
      const headroom = p.max_active_requests - (ctx.activeCounts?.[p.id] ?? 0);
      if (headroom >= 3) {
        score += 1;
        reasons.push("capacity_headroom");
      }
    }

    reasons.push(`languages:${p.languages.join("+")}`);
    return {
      clinicianId: p.id,
      userId: p.user_id,
      displayName: p.display_name,
      facilityId: p.facility_id,
      specialty: p.specialty,
      languages: p.languages,
      modes: p.modes,
      availabilityState: p.availability_state,
      reasons,
      score,
    } satisfies MatchedOption;
  });

  // Stable sort: score desc, then name asc (fully deterministic).
  scored.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return scored;
}
