/**
 * Network Resilience Test Mode (Part 5) — development and testing ONLY.
 *
 * SAFETY RULES
 * - Disabled in production builds (double gate: NODE_ENV + explicit flag).
 * - It NEVER fakes successful server actions and NEVER writes data. It only
 *   delays/drops outbound requests or toggles the browser's reported online
 *   state for the session, so queue/UX behavior can be exercised locally.
 * - Real production records are untouched: dropped requests simply fail the
 *   same way a real network drop does, and the existing queue retries them.
 */

const STORAGE_KEY = "healthfolio.dev.networkResilience";

export type ResilienceProfile =
  | "off"
  | "offline"
  | "slow_2g"
  | "slow_3g"
  | "timeout"
  | "drop_during_sync";

export interface ResilienceProfileInfo {
  profile: ResilienceProfile;
  label: string;
  description: string;
  /** Artificial latency added to each request (ms). */
  latencyMs: number;
  /** Whether requests fail with a network-style error. */
  drops: boolean;
  /** Whether requests fail after a simulated timeout window. */
  timeoutMs: number | null;
}

export const RESILIENCE_PROFILES: Record<ResilienceProfile, ResilienceProfileInfo> = {
  off: {
    profile: "off",
    label: "Normal connection",
    description: "No simulation. Real network conditions apply.",
    latencyMs: 0,
    drops: false,
    timeoutMs: null,
  },
  offline: {
    profile: "offline",
    label: "Offline",
    description: "Every request drops immediately, like airplane mode.",
    latencyMs: 0,
    drops: true,
    timeoutMs: null,
  },
  slow_2g: {
    profile: "slow_2g",
    label: "Slow 2G",
    description: "≈1.5s added latency per request. Tests patience and progress states.",
    latencyMs: 1500,
    drops: false,
    timeoutMs: null,
  },
  slow_3g: {
    profile: "slow_3g",
    label: "Slow 3G",
    description: "≈500ms added latency per request.",
    latencyMs: 500,
    drops: false,
    timeoutMs: null,
  },
  timeout: {
    profile: "timeout",
    label: "Server timeout",
    description: "Requests hang then fail like a server timeout.",
    latencyMs: 0,
    drops: false,
    timeoutMs: 8000,
  },
  drop_during_sync: {
    profile: "drop_during_sync",
    label: "Drop during sync",
    description: "First request succeeds, the next drops — simulates losing the connection mid-sync.",
    latencyMs: 0,
    drops: true,
    timeoutMs: null,
  },
};

function isDevRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function readResilienceProfile(): ResilienceProfile {
  if (!isDevRuntime() || typeof window === "undefined") return "off";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && v in RESILIENCE_PROFILES) return v as ResilienceProfile;
  } catch {
    /* private mode */
  }
  return "off";
}

export function writeResilienceProfile(profile: ResilienceProfile): void {
  if (!isDevRuntime() || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, profile);
  } catch {
    /* ignore */
  }
}

let dropToggle = false;

/** Wrap fetch with the active profile. Returns fetch unchanged when "off". */
export function applyResilienceToFetch(
  baseUrl: string | typeof fetch,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  const base = typeof baseUrl === "string" ? undefined : baseUrl;
  return async function patched(input, init) {
    const profile = readResilienceProfile();
    const info = RESILIENCE_PROFILES[profile];

    if (info.drops) {
      if (profile === "drop_during_sync") {
        // Alternate: let one through, drop the next — mid-sync loss.
        dropToggle = !dropToggle;
        if (dropToggle) throw new TypeError("Simulated network drop (resilience test mode)");
      } else {
        throw new TypeError("Network unavailable (resilience test mode)");
      }
    }

    if (info.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, info.latencyMs));
    }
    if (info.timeoutMs !== null) {
      const timeout = info.timeoutMs;
      await new Promise((r) => setTimeout(r, timeout));
      throw new TypeError("Simulated timeout (resilience test mode)");
    }
    return (base ?? fetchImpl)(input, init);
  };
}

export function isResilienceTestModeActive(): boolean {
  return isDevRuntime() && readResilienceProfile() !== "off";
}

/**
 * Mirror the simulated profile into the browser's connectivity signal so the
 * offline queue's UI states stay truthful under simulation: with the
 * "offline" profile, navigator.onLine reports false and an "offline" event
 * fires, so pending rows show "Waiting for connection" (not "Syncing").
 * Restores the real getter for every other profile. Dev-only; no-op when
 * the prototype descriptor cannot be adjusted.
 */
export function applyConnectivityShim(): void {
  if (!isDevRuntime() || typeof window === "undefined") return;
  const offlineSim = readResilienceProfile() === "offline";
  try {
    const own = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    if (offlineSim) {
      Object.defineProperty(window.navigator, "onLine", {
        get: () => false,
        configurable: true,
      });
      window.dispatchEvent(new Event("offline"));
    } else if (own) {
      delete (window.navigator as { onLine?: boolean }).onLine;
      window.dispatchEvent(new Event("online"));
    }
  } catch {
    /* environment forbids the shim — the fetch-level drop still applies */
  }
}
