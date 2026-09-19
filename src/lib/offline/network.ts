/**
 * Network state detection abstraction. Wraps browser online/offline events
 * behind a tiny subscribe/query interface so it can be unit-tested with a
 * fake without touching real browser globals.
 */

export interface NetworkState {
  online: boolean;
  /** Navigator connection type hint when available (e.g. "wifi", "cellular"), else undefined. */
  effectiveType?: string;
  /** True when the browser reports a metered/slow connection, when available. */
  saveData?: boolean;
}

export type Unsubscribe = () => void;

export interface NetworkMonitor {
  getState(): NetworkState;
  subscribe(listener: (state: NetworkState) => void): Unsubscribe;
}

/** Read initial state and wire event listeners from a DOM-like environment. */
export function createNetworkMonitor(win: {
  navigator: { onLine: boolean; connection?: { effectiveType?: string; saveData?: boolean } };
  addEventListener: (type: string, handler: () => void) => void;
  removeEventListener: (type: string, handler: () => void) => void;
}): NetworkMonitor {
  const readState = (): NetworkState => ({
    online: win.navigator.onLine,
    effectiveType: win.navigator.connection?.effectiveType,
    saveData: win.navigator.connection?.saveData,
  });

  const listeners = new Set<(state: NetworkState) => void>();

  const emit = () => {
    const state = readState();
    for (const listener of listeners) listener(state);
  };

  win.addEventListener("online", emit);
  win.addEventListener("offline", emit);

  return {
    getState: readState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * True when a network-level failure means "try again later" (offline, timeout,
 * DNS, refused connection). Server responses with a status code are NOT
 * retryable at the transport level — they are deliberate responses.
 */
export function isTransportFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch "Failed to fetch" / offline
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    return code === "NETWORK_OFFLINE" || code === "TIMEOUT" || code === "ECONNRESET";
  }
  return false;
}
