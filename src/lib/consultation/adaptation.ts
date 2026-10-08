/**
 * Automatic quality adaptation (pure decision core).
 *
 * Degradation hierarchy — never abrupt, never a lie:
 *   video (high) → video (medium) → video (low) → audio → text
 *
 * Decisions are made from the *worse* of two signals:
 *   - the browser NetworkProfile quality (Network Information API + onLine)
 *   - WebRTC getStats() RTT / packet loss (measures the actual call path)
 *
 * Hysteresis prevents flapping:
 *   - degrade only after `DEGRADE_AFTER_SAMPLES` consecutive bad samples
 *   - upgrade only after `UPGRADE_AFTER_SAMPLES` consecutive good samples and
 *     a minimum dwell time at the current level
 *   - fall to audio only after the connection stays at `poor` for
 *     `AUDIO_FALLBACK_AFTER_SAMPLES` samples while already at the lowest
 *     video level (reduce first, switch last)
 *
 * Reconnection backoff is bounded: exponential with a cap, never infinite.
 */

import type { ConnectionMode, NetworkProfile, PeerStatsSample } from "./types";

/** Consecutive bad samples before reducing video quality. */
export const DEGRADE_AFTER_SAMPLES = 3;
/** Consecutive good samples before restoring one video quality step. */
export const UPGRADE_AFTER_SAMPLES = 5;
/** Consecutive "poor" samples at the lowest video level before audio fallback. */
export const AUDIO_FALLBACK_AFTER_SAMPLES = 6;
/** Minimum time (ms) at a video level before an upgrade is allowed. */
export const MIN_UPGRADE_DWELL_MS = 15_000;

export type VideoProfileLevel = "high" | "medium" | "low";

export interface AdaptationInput {
  profile: NetworkProfile;
  stats?: PeerStatsSample | null;
  /** Current video quality level (irrelevant when mode !== "video"). */
  videoLevel: VideoProfileLevel;
  mode: ConnectionMode;
  /** Consecutive samples where quality was bad. */
  badStreak: number;
  /** Consecutive samples where quality was good/excellent. */
  goodStreak: number;
  /** When the current video level was entered (epoch ms). */
  levelSinceMs: number;
  nowMs: number;
}

export interface AdaptationDecision {
  /** New video level to apply (may equal the current one). */
  videoLevel: VideoProfileLevel;
  /** Mode to move to: "video" stays, "audio" is the bounded fallback. */
  mode: "video" | "audio";
  action: "maintain" | "reduce_video" | "upgrade_video" | "switch_audio";
  /** Coarse quality actually used for the decision (measured, not invented). */
  effectiveQuality: NetworkProfile["quality"];
}

const LEVEL_ORDER: VideoProfileLevel[] = ["low", "medium", "high"];

function levelIndex(level: VideoProfileLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/**
 * Effective quality = the worse of the network profile quality and the
 * quality implied by WebRTC stats (when measurable).
 */
export function effectiveCallQuality(
  profile: NetworkProfile,
  stats?: PeerStatsSample | null
): NetworkProfile["quality"] {
  const rank: Record<NetworkProfile["quality"], number> = {
    offline: 0,
    poor: 1,
    degraded: 2,
    good: 3,
    excellent: 4,
  };
  let worst = rank[profile.quality];
  if (profile.online) {
    if (stats?.rttMs != null) {
      if (stats.rttMs > 1000) worst = Math.min(worst, 1);
      else if (stats.rttMs > 500) worst = Math.min(worst, 2);
    }
    if (stats?.packetLossRatio != null) {
      if (stats.packetLossRatio > 0.15) worst = Math.min(worst, 1);
      else if (stats.packetLossRatio > 0.05) worst = Math.min(worst, 2);
    }
  }
  const byRank = (Object.keys(rank) as Array<NetworkProfile["quality"]>).find(
    (k) => rank[k] === worst
  );
  return byRank ?? profile.quality;
}

/**
 * Decide the next adaptation step. Pure — inputs come from the caller's
 * sampling loop; nothing here reads globals or schedules work.
 */
export function decideAdaptation(input: AdaptationInput): AdaptationDecision {
  const quality = effectiveCallQuality(input.profile, input.stats);
  const bad = quality === "poor" || quality === "offline";
  const weak = bad || quality === "degraded";
  const good = quality === "good" || quality === "excellent";

  // ── Already on audio: watch for a sustained good network before video. ──
  if (input.mode === "audio") {
    return {
      videoLevel: input.videoLevel,
      mode: "audio",
      action: "maintain",
      effectiveQuality: quality,
    };
  }

  // ── Degrade: sustained bad/weak samples. ────────────────────────────────
  if (weak && input.badStreak >= DEGRADE_AFTER_SAMPLES) {
    const atLowest = input.videoLevel === "low";
    if (bad && atLowest && input.badStreak >= AUDIO_FALLBACK_AFTER_SAMPLES) {
      return {
        videoLevel: "low",
        mode: "audio",
        action: "switch_audio",
        effectiveQuality: quality,
      };
    }
    if (!atLowest) {
      const next = LEVEL_ORDER[levelIndex(input.videoLevel) - 1] ?? "low";
      return {
        videoLevel: next,
        mode: "video",
        action: "reduce_video",
        effectiveQuality: quality,
      };
    }
    // At the lowest level but not bad enough (long enough) for audio:
    // keep sending low-quality video — reduce first, switch last.
    return {
      videoLevel: input.videoLevel,
      mode: "video",
      action: "maintain",
      effectiveQuality: quality,
    };
  }

  // ── Upgrade: sustained good samples + dwell time. ──────────────────────
  if (
    good &&
    input.goodStreak >= UPGRADE_AFTER_SAMPLES &&
    input.nowMs - input.levelSinceMs >= MIN_UPGRADE_DWELL_MS &&
    levelIndex(input.videoLevel) < LEVEL_ORDER.length - 1
  ) {
    const next = LEVEL_ORDER[levelIndex(input.videoLevel) + 1] ?? "high";
    return {
      videoLevel: next,
      mode: "video",
      action: "upgrade_video",
      effectiveQuality: quality,
    };
  }

  return {
    videoLevel: input.videoLevel,
    mode: "video",
    action: "maintain",
    effectiveQuality: quality,
  };
}

/** Video capture constraints for each level (low-end device friendly). */
export const VIDEO_PROFILE_CONSTRAINTS: Record<
  VideoProfileLevel,
  { width: number; height: number; frameRate: number; maxBitrateBps: number }
> = {
  high: { width: 1280, height: 720, frameRate: 24, maxBitrateBps: 900_000 },
  medium: { width: 640, height: 360, frameRate: 15, maxBitrateBps: 400_000 },
  low: { width: 320, height: 240, frameRate: 10, maxBitrateBps: 150_000 },
};

// ── Bounded reconnection backoff ───────────────────────────────────────────

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/**
 * Exponential backoff with a hard cap. `random` is injectable for tests;
 * production passes Math.random so retries do not synchronize.
 * attempt 1 → base, 2 → 2×base, 3 → 4×base … capped at BACKOFF_MAX_MS.
 */
export function computeBackoffDelay(
  attempt: number,
  baseMs: number = BACKOFF_BASE_MS,
  maxMs: number = BACKOFF_MAX_MS,
  random: () => number = Math.random
): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = baseMs * Math.pow(2, n - 1);
  const capped = Math.min(raw, maxMs);
  // ±10% jitter, clamped to [0, maxMs].
  const jitter = capped * 0.1 * (random() * 2 - 1);
  return Math.max(0, Math.min(maxMs, Math.round(capped + jitter)));
}
