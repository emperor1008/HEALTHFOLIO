/**
 * Network profile + quality classification (pure core, browser wiring below).
 *
 * Reads, in order of preference:
 *   1. navigator.onLine (every browser)
 *   2. Network Information API — effectiveType / downlink / rtt / saveData
 *      (Chromium only; all fields become null where unavailable)
 *   3. WebRTC getStats() RTT/loss once a call is active (any browser)
 *
 * Nothing is invented: a measurement the browser cannot provide stays null,
 * and quality is derived only from measurements that actually exist.
 */

import type {
  EffectiveConnectionType,
  NetworkProfile,
  NetworkQuality,
  PeerStatsSample,
} from "./types";

/** Minimal shape of navigator.connection (all fields optional in browsers). */
export interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

export interface NetworkSignalInput {
  onLine: boolean;
  connection?: NetworkInformationLike;
}

const EFFECTIVE_TYPES: readonly EffectiveConnectionType[] = [
  "slow-2g",
  "2g",
  "3g",
  "4g",
];

function readEffectiveType(raw: unknown): EffectiveConnectionType | null {
  return typeof raw === "string" && (EFFECTIVE_TYPES as readonly string[]).includes(raw)
    ? (raw as EffectiveConnectionType)
    : null;
}

function readFiniteNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

/** Read the browser signal into a normalized shape (safe in any browser). */
export function readNetworkSignal(signal: NetworkSignalInput): {
  onLine: boolean;
  effectiveType: EffectiveConnectionType | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
} {
  const conn = signal.connection;
  return {
    onLine: signal.onLine === true,
    effectiveType: conn ? readEffectiveType(conn.effectiveType) : null,
    downlinkMbps: conn ? readFiniteNumber(conn.downlink) : null,
    rttMs: conn ? readFiniteNumber(conn.rtt) : null,
    saveData: conn ? conn.saveData === true : false,
  };
}

/**
 * Classify quality from the measurements that are actually available.
 *
 * Rules (checked top-down; the first match wins):
 * - offline         navigator says offline
 * - poor            2G-class effective type, save-data, RTT > 1000ms,
 *                   downlink < 0.3 Mbps, or packet loss > 15%
 * - degraded        3G-class, RTT > 500ms, downlink < 1 Mbps, or loss > 5%
 * - excellent       RTT ≤ 100ms AND downlink ≥ 5 Mbps (both known-good)
 * - good            everything else that is online (including "no measurable
 *                   signal": treated as good, never as excellent)
 *
 * WebRTC stats (when present) always dominate the browser's coarse hints for
 * the poor/degraded bands, because they measure the actual call path.
 */
export function classifyNetworkQuality(input: {
  onLine: boolean;
  effectiveType: EffectiveConnectionType | null;
  rttMs: number | null;
  downlinkMbps: number | null;
  saveData: boolean;
  packetLossRatio?: number | null;
}): NetworkQuality {
  if (!input.onLine) return "offline";

  const loss = input.packetLossRatio;
  const lossKnown = typeof loss === "number" && Number.isFinite(loss);

  if (
    input.effectiveType === "slow-2g" ||
    input.effectiveType === "2g" ||
    input.saveData ||
    (input.rttMs !== null && input.rttMs > 1000) ||
    (input.downlinkMbps !== null && input.downlinkMbps < 0.3) ||
    (lossKnown && loss !== null && loss > 0.15)
  ) {
    return "poor";
  }

  if (
    input.effectiveType === "3g" ||
    (input.rttMs !== null && input.rttMs > 500) ||
    (input.downlinkMbps !== null && input.downlinkMbps < 1) ||
    (lossKnown && loss !== null && loss > 0.05)
  ) {
    return "degraded";
  }

  if (
    input.rttMs !== null &&
    input.rttMs <= 100 &&
    input.downlinkMbps !== null &&
    input.downlinkMbps >= 5
  ) {
    return "excellent";
  }

  return "good";
}

/** Build a full NetworkProfile from browser signals (+ optional call stats). */
export function buildNetworkProfile(
  signal: NetworkSignalInput,
  stats?: PeerStatsSample | null,
  now: number = Date.now()
): NetworkProfile {
  const read = readNetworkSignal(signal);
  const quality = classifyNetworkQuality({
    onLine: read.onLine,
    effectiveType: read.effectiveType,
    rttMs: stats?.rttMs ?? read.rttMs,
    downlinkMbps: read.downlinkMbps,
    saveData: read.saveData,
    packetLossRatio: stats?.packetLossRatio ?? null,
  });
  return {
    online: read.onLine,
    effectiveType: read.effectiveType,
    downlinkMbps: read.downlinkMbps,
    rttMs: stats?.rttMs ?? read.rttMs,
    saveData: read.saveData,
    quality,
    sampledAt: now,
  };
}

/**
 * Browser wiring: a subscribe/query monitor over online/offline events and
 * the Network Information API (when present). All listeners are removed by
 * the returned unsubscribe function. Safe in non-browser environments.
 */
export function createConsultationNetworkMonitor(win: Window | undefined): {
  getProfile(): NetworkProfile;
  getSignal(): NetworkSignalInput;
  subscribe(listener: (profile: NetworkProfile) => void): () => void;
  dispose(): void;
} {
  const listeners = new Set<(profile: NetworkProfile) => void>();
  const cleanups: Array<() => void> = [];

  const getSignal = (): NetworkSignalInput => {
    if (!win || typeof win.navigator !== "object") return { onLine: false };
    const nav = win.navigator as Navigator & { connection?: NetworkInformationLike };
    return { onLine: win.navigator.onLine, connection: nav.connection };
  };

  const emit = () => {
    const profile = buildNetworkProfile(getSignal());
    for (const listener of listeners) listener(profile);
  };

  if (win) {
    win.addEventListener("online", emit);
    win.addEventListener("offline", emit);
    cleanups.push(() => {
      win.removeEventListener("online", emit);
      win.removeEventListener("offline", emit);
    });

    const conn = (win.navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    if (conn?.addEventListener) {
      conn.addEventListener("change", emit);
      cleanups.push(() => conn.removeEventListener?.("change", emit));
    }
  }

  return {
    getProfile: () => buildNetworkProfile(getSignal()),
    getSignal,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;
      listeners.clear();
    },
  };
}
