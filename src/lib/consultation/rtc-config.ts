/**
 * Centralized WebRTC configuration.
 *
 * Every RTCPeerConnection in the app must take its configuration from here —
 * STUN servers are never hardcoded anywhere else.
 *
 * - Zero-cost default: public STUN only (no TURN, no paid infrastructure).
 * - Optional override via NEXT_PUBLIC_ICE_SERVERS (a JSON array of
 *   RTCIceServer objects), so deployments can add their own STUN/TURN without
 *   code changes. Private TURN credentials, if ever used, must be injected at
 *   deploy time through that env var — never committed to the repo.
 */

/** Public, zero-cost STUN defaults. No TURN: media falls back gracefully on strict NATs. */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com" }];

/**
 * Parse an env-provided ICE server list. Returns null for missing/invalid
 * input so the caller can fall back to the defaults (never throws).
 */
export function parseIceServersEnv(raw: string | undefined): RTCIceServer[] | null {
  if (!raw || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const servers: RTCIceServer[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const candidate = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    if (typeof candidate.urls !== "string" && !Array.isArray(candidate.urls)) return null;
    const server: RTCIceServer = { urls: candidate.urls as RTCIceServer["urls"] };
    if (typeof candidate.username === "string") server.username = candidate.username;
    if (typeof candidate.credential === "string") server.credential = candidate.credential;
    servers.push(server);
  }
  return servers;
}

/** Build the RTCPeerConnection configuration used by every consultation call. */
export function getRtcConfiguration(
  envValue: string | undefined = typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_ICE_SERVERS
    : undefined
): RTCConfiguration {
  const iceServers = parseIceServersEnv(envValue) ?? DEFAULT_ICE_SERVERS;
  return {
    iceServers,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

/** True when this browser can attempt a WebRTC connection at all. */
export function isWebRtcSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection === "function"
  );
}
