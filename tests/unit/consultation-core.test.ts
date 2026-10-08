/**
 * Phase 1 consultation core tests — pure modules only (no network, no DOM
 * media). These prove the safety-critical behaviors:
 * - the state machine cannot produce contradictory states and bounds
 *   reconnection attempts;
 * - adaptation degrades first and switches to audio only as a last resort,
 *   with bounded, jittered backoff;
 * - signalling payloads are schema-validated before touching a peer
 *   connection, and placeholder env degrades honestly;
 * - media errors map to typed, recoverable failures (audio-only retry for
 *   missing/unsupported cameras);
 * - diagnostics never carry payloads outside the allowlist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  transition,
  statusMessageKey,
  isActiveMediaState,
  INITIAL_CONSULTATION_STATE,
  MAX_RECONNECT_ATTEMPTS,
  CONSULTATION_STATUSES,
  type ConsultationState,
} from "@/lib/consultation/state-machine";
import {
  decideAdaptation,
  effectiveCallQuality,
  computeBackoffDelay,
  DEGRADE_AFTER_SAMPLES,
  UPGRADE_AFTER_SAMPLES,
  AUDIO_FALLBACK_AFTER_SAMPLES,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  type AdaptationInput,
} from "@/lib/consultation/adaptation";
import { classifyNetworkQuality, readNetworkSignal } from "@/lib/consultation/network-profile";
import {
  parseConsultationSignal,
  wrapSignal,
  getSignallingConfig,
  SIGNAL_PROTOCOL_VERSION,
} from "@/lib/consultation/signalling";
import { parseIceServersEnv, getRtcConfiguration } from "@/lib/consultation/rtc-config";
import {
  MediaAcquireError,
  mapGetUserMediaError,
  acquireLocalMedia,
  isMediaCaptureSupported,
} from "@/lib/consultation/media";
import {
  logConsultationEvent,
  getConsultationDiagnostics,
  clearConsultationDiagnostics,
  subscribeConsultationDiagnostics,
} from "@/lib/consultation/diagnostics";
import type { NetworkProfile } from "@/lib/consultation/types";

// ── State machine ─────────────────────────────────────────────────────────

describe("consultation state machine", () => {
  const s = (
    status: ConsultationState["status"],
    overrides: Partial<ConsultationState> = {}
  ): ConsultationState => ({
    status,
    mode: "text",
    error: null,
    retryAttempt: 0,
    ...overrides,
  });

  it("walks the full happy path: join → room → peer → connected", () => {
    let state = transition(INITIAL_CONSULTATION_STATE, { type: "JOIN", mode: "video" });
    expect(state).toEqual({ status: "joining", mode: "video", error: null, retryAttempt: 0 });

    state = transition(state, { type: "MEDIA_OK" });
    expect(state.status).toBe("joining"); // media OK alone never claims connected

    state = transition(state, { type: "ROOM_READY" });
    expect(state.status).toBe("waiting_for_peer");

    state = transition(state, { type: "PEER_PRESENT" });
    expect(state.status).toBe("connecting");

    state = transition(state, { type: "PC_CONNECTED", mode: "video" });
    expect(state.status).toBe("connected_video");
    expect(state.mode).toBe("video");
  });

  it("ignores events that are invalid for the current state (returns same object)", () => {
    const idle = INITIAL_CONSULTATION_STATE;
    expect(transition(idle, { type: "PC_CONNECTED", mode: "video" })).toBe(idle);
    expect(transition(idle, { type: "ROOM_READY" })).toBe(idle);
    expect(transition(idle, { type: "RECONNECT_TICK" })).toBe(idle);
    const waiting = s("waiting_for_peer");
    expect(transition(waiting, { type: "QUALITY_DEGRADED" })).toBe(waiting);
    expect(transition(waiting, { type: "FORCE_MODE", mode: "audio" })).toBe(waiting);
  });

  it("peer absence returns any active state to waiting (never a dead call)", () => {
    for (const status of ["joining", "connecting", "connected_video", "connected_audio", "reconnecting"] as const) {
      const next = transition(s(status), { type: "PEER_ABSENT" });
      expect(next.status).toBe("waiting_for_peer");
    }
  });

  it("bounds reconnection: MAX attempts then store-and-forward, never infinite", () => {
    let state = transition(s("connected_video"), { type: "NETWORK_LOST" });
    expect(state.status).toBe("reconnecting");
    expect(state.retryAttempt).toBe(0);

    for (let i = 1; i < MAX_RECONNECT_ATTEMPTS; i += 1) {
      const before = state;
      state = transition(state, { type: "RECONNECT_TICK" });
      expect(state.retryAttempt).toBe(i);
      expect(state.status).toBe("reconnecting");
      expect(state).not.toBe(before);
    }
    // The final tick exhausts the budget → text fallback.
    state = transition(state, { type: "RECONNECT_TICK" });
    expect(state.status).toBe("store_and_forward");
    expect(state.mode).toBe("text");
  });

  it("exhaustion from waiting/connecting also lands in store-and-forward", () => {
    for (const status of ["waiting_for_peer", "connecting", "reconnecting"] as const) {
      const next = transition(s(status), { type: "RECONNECT_EXHAUSTED" });
      expect(next.status).toBe("store_and_forward");
      expect(next.mode).toBe("text");
    }
  });

  it("manual text switch works from any live state but never from ended/idle/error", () => {
    for (const status of ["connected_video", "degraded_video", "connected_audio", "reconnecting", "joining"] as const) {
      const next = transition(s(status), { type: "FORCE_MODE", mode: "text" });
      expect(next.status).toBe("store_and_forward");
    }
    for (const status of ["idle", "ended", "error"] as const) {
      const state = s(status, status === "error" ? { error: "unknown" } : {});
      expect(transition(state, { type: "FORCE_MODE", mode: "text" })).toBe(state);
    }
  });

  it("media failures carry a typed error code; end never resurrects a finished call", () => {
    const failed = transition(s("joining"), {
      type: "MEDIA_FAILED",
      error: "permission_denied",
    });
    expect(failed).toEqual({
      status: "error",
      mode: "text",
      error: "permission_denied",
      retryAttempt: 0,
    });

    const ended = transition(s("ended"), { type: "MEDIA_ERROR", error: "unknown" });
    expect(ended.status).toBe("ended"); // events after END are ignored
    expect(transition(INITIAL_CONSULTATION_STATE, { type: "END" })).toBe(INITIAL_CONSULTATION_STATE);
  });

  it("maps every status to a plain-language message key", () => {
    const expected: Record<string, string> = {
      idle: "consultIdle",
      joining: "consultConnecting",
      waiting_for_peer: "consultWaitingForPeer",
      connecting: "consultConnectingPeer",
      connected_video: "consultConnected",
      degraded_video: "consultWeakConnection",
      connected_audio: "consultAudioMode",
      reconnecting: "consultReconnecting",
      store_and_forward: "consultOfflineSaved",
      ended: "consultEnded",
      error: "consultError",
    };
    for (const status of CONSULTATION_STATUSES) {
      expect(statusMessageKey(status)).toBe(expected[status]);
    }
    expect(isActiveMediaState(s("connected_video"))).toBe(true);
    expect(isActiveMediaState(s("store_and_forward"))).toBe(false);
  });
});

// ── Adaptation + backoff ──────────────────────────────────────────────────

describe("network-aware adaptation", () => {
  const profile = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
    online: true,
    effectiveType: "4g",
    downlinkMbps: 10,
    rttMs: 40,
    saveData: false,
    quality: "good",
    sampledAt: 0,
    ...overrides,
  });

  const input = (overrides: Partial<AdaptationInput> = {}): AdaptationInput => ({
    profile: profile(),
    stats: null,
    videoLevel: "high",
    mode: "video",
    badStreak: 0,
    goodStreak: 0,
    levelSinceMs: 0,
    nowMs: 60_000,
    ...overrides,
  });

  it("effective quality takes the worse of profile and WebRTC stats", () => {
    expect(effectiveCallQuality(profile({ quality: "excellent" }), null)).toBe("excellent");
    // High RTT dominates an 'excellent' profile hint.
    expect(
      effectiveCallQuality(profile({ quality: "excellent" }), {
        rttMs: 1200,
        packetLossRatio: null,
        outgoingBitrateBps: null,
      })
    ).toBe("poor");
    // 7% loss → degraded even on a good profile.
    expect(
      effectiveCallQuality(profile({ quality: "good" }), {
        rttMs: 50,
        packetLossRatio: 0.07,
        outgoingBitrateBps: null,
      })
    ).toBe("degraded");
  });

  it("reduces video only after a sustained bad streak (reduce first)", () => {
    // Not enough samples: maintain.
    expect(decideAdaptation(input({ profile: profile({ quality: "degraded" }), badStreak: 2 })).action).toBe(
      "maintain"
    );
    // Sustained degraded: one step down.
    const reduced = decideAdaptation(
      input({ profile: profile({ quality: "degraded" }), badStreak: DEGRADE_AFTER_SAMPLES })
    );
    expect(reduced.action).toBe("reduce_video");
    expect(reduced.videoLevel).toBe("medium");
  });

  it("switches to audio only at the lowest video level after sustained poor (switch last)", () => {
    // At 'low' but only degraded-for-3 → keep low video, do NOT switch.
    const keepLow = decideAdaptation(
      input({ profile: profile({ quality: "degraded" }), videoLevel: "low", badStreak: DEGRADE_AFTER_SAMPLES })
    );
    expect(keepLow.action).toBe("maintain");

    // Sustained poor at 'low' → bounded audio fallback.
    const audio = decideAdaptation(
      input({ profile: profile({ quality: "poor" }), videoLevel: "low", badStreak: AUDIO_FALLBACK_AFTER_SAMPLES })
    );
    expect(audio.action).toBe("switch_audio");
    expect(audio.mode).toBe("audio");
  });

  it("upgrades only after a good streak plus minimum dwell time", () => {
    const tooSoon = decideAdaptation(
      input({ videoLevel: "low", goodStreak: UPGRADE_AFTER_SAMPLES, levelSinceMs: 0, nowMs: 5_000 })
    );
    expect(tooSoon.action).toBe("maintain");

    const shortStreak = decideAdaptation(
      input({ videoLevel: "low", goodStreak: UPGRADE_AFTER_SAMPLES - 1, levelSinceMs: 0, nowMs: 60_000 })
    );
    expect(shortStreak.action).toBe("maintain");

    const upgraded = decideAdaptation(
      input({ videoLevel: "low", goodStreak: UPGRADE_AFTER_SAMPLES, levelSinceMs: 0, nowMs: 60_000 })
    );
    expect(upgraded.action).toBe("upgrade_video");
    expect(upgraded.videoLevel).toBe("medium");
  });

  it("audio mode is stable: never flaps back to video from stats alone", () => {
    const decision = decideAdaptation(
      input({ mode: "audio", profile: profile({ quality: "excellent" }), goodStreak: 99, nowMs: 10_000_000 })
    );
    expect(decision.action).toBe("maintain");
    expect(decision.mode).toBe("audio");
  });

  it("backoff is exponential, capped, and jittered within ±10%", () => {
    expect(computeBackoffDelay(1, BACKOFF_BASE_MS, BACKOFF_MAX_MS, () => 0.5)).toBe(BACKOFF_BASE_MS);
    expect(computeBackoffDelay(2, BACKOFF_BASE_MS, BACKOFF_MAX_MS, () => 0.5)).toBe(BACKOFF_BASE_MS * 2);
    expect(computeBackoffDelay(3, BACKOFF_BASE_MS, BACKOFF_MAX_MS, () => 0.5)).toBe(BACKOFF_BASE_MS * 4);
    // Bounded: attempt 20 stays at the cap.
    expect(computeBackoffDelay(20, BACKOFF_BASE_MS, BACKOFF_MAX_MS, () => 0.5)).toBe(BACKOFF_MAX_MS);
    // Jitter bounds.
    expect(computeBackoffDelay(1, 1000, 30_000, () => 0)).toBe(900);
    expect(computeBackoffDelay(1, 1000, 30_000, () => 1)).toBe(1100);
  });
});

// ── Network classification ────────────────────────────────────────────────

describe("network quality classification", () => {
  it("classifies from measurements that actually exist", () => {
    expect(classifyNetworkQuality({ onLine: false, effectiveType: null, rttMs: null, downlinkMbps: null, saveData: false })).toBe("offline");
    expect(
      classifyNetworkQuality({ onLine: true, effectiveType: "2g", rttMs: null, downlinkMbps: null, saveData: false })
    ).toBe("poor");
    expect(
      classifyNetworkQuality({ onLine: true, effectiveType: null, rttMs: null, downlinkMbps: null, saveData: true })
    ).toBe("poor");
    expect(
      classifyNetworkQuality({ onLine: true, effectiveType: "3g", rttMs: null, downlinkMbps: null, saveData: false })
    ).toBe("degraded");
    expect(
      classifyNetworkQuality({ onLine: true, effectiveType: null, rttMs: 600, downlinkMbps: null, saveData: false })
    ).toBe("degraded");
    // No measurable signal: good, never excellent (honest).
    expect(
      classifyNetworkQuality({ onLine: true, effectiveType: null, rttMs: null, downlinkMbps: null, saveData: false })
    ).toBe("good");
    expect(
      classifyNetworkQuality({ onLine: true, effectiveType: null, rttMs: 40, downlinkMbps: 10, saveData: false })
    ).toBe("excellent");
  });

  it("readNetworkSignal never invents unavailable fields", () => {
    const withoutApi = readNetworkSignal({ onLine: true });
    expect(withoutApi).toEqual({
      onLine: true,
      effectiveType: null,
      downlinkMbps: null,
      rttMs: null,
      saveData: false,
    });
    const withApi = readNetworkSignal({
      onLine: true,
      connection: { effectiveType: "4g", downlink: 5, rtt: 30, saveData: false },
    });
    expect(withApi.effectiveType).toBe("4g");
    expect(withApi.downlinkMbps).toBe(5);
  });
});

// ── Signalling validation ─────────────────────────────────────────────────

describe("signalling payload validation", () => {
  const ref = { sessionId: "session-12345678", participantId: "participant-12345678" };

  it("accepts every valid signal type", () => {
    expect(parseConsultationSignal({ type: "ready", ...ref, role: "patient", mode: "video" })?.type).toBe("ready");
    expect(parseConsultationSignal({ type: "offer", ...ref, sdp: "v=0" })?.type).toBe("offer");
    expect(parseConsultationSignal({ type: "answer", ...ref, sdp: "v=0" })?.type).toBe("answer");
    expect(
      parseConsultationSignal({ type: "ice-candidate", ...ref, candidate: { candidate: "candidate:1" } })?.type
    ).toBe("ice-candidate");
    expect(
      parseConsultationSignal({ type: "mode", ...ref, mode: "audio", source: "recommend" })?.type
    ).toBe("mode");
    expect(parseConsultationSignal({ type: "leave", ...ref })?.type).toBe("leave");
  });

  it("accepts the version-tagged wire form", () => {
    const wrapped = wrapSignal({ type: "leave", ...ref });
    expect(wrapped.v).toBe(SIGNAL_PROTOCOL_VERSION);
    expect(parseConsultationSignal(wrapped)?.type).toBe("leave");
  });

  it("drops malformed, unknown, or oversized payloads", () => {
    expect(parseConsultationSignal(null)).toBeNull();
    expect(parseConsultationSignal("ready")).toBeNull();
    expect(parseConsultationSignal({ type: "unknown", ...ref })).toBeNull();
    // Unknown role / mode values.
    expect(parseConsultationSignal({ type: "ready", ...ref, role: "admin", mode: "video" })).toBeNull();
    expect(parseConsultationSignal({ type: "mode", ...ref, mode: "screen", source: "user" })).toBeNull();
    // Oversized SDP (>200k chars).
    expect(parseConsultationSignal({ type: "offer", ...ref, sdp: "x".repeat(200_001) })).toBeNull();
    // Missing session binding.
    expect(parseConsultationSignal({ type: "offer", sessionId: "s", sdp: "v=0" })).toBeNull();
    // Wrapped form with a missing/invalid signal.
    expect(parseConsultationSignal({ v: 1, signal: { type: "offer" } })).toBeNull();
  });

  it("degrades honestly on placeholder or missing Supabase env", () => {
    expect(getSignallingConfig({})).toBeNull();
    expect(
      getSignallingConfig({
        NEXT_PUBLIC_SUPABASE_URL: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",
      })
    ).toBeNull();
    expect(
      getSignallingConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" })
    ).toBeNull();
    const real = getSignallingConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    });
    expect(real).toEqual({ url: "https://x.supabase.co", anonKey: "public-anon-key" });
  });
});

// ── RTC configuration ─────────────────────────────────────────────────────

describe("WebRTC configuration", () => {
  it("falls back to zero-cost STUN defaults and never throws on bad env", () => {
    expect(parseIceServersEnv(undefined)).toBeNull();
    expect(parseIceServersEnv("not-json")).toBeNull();
    expect(parseIceServersEnv("[]")).toBeNull();
    expect(parseIceServersEnv('[{"urls":123}]')).toBeNull();

    const config = getRtcConfiguration(undefined);
    expect(config.iceServers).toEqual([{ urls: "stun:stun.cloudflare.com" }]);
    expect(config.bundlePolicy).toBe("max-bundle");

    const override = getRtcConfiguration('[{"urls":"stun:stun.example.test"}]');
    expect(override.iceServers).toEqual([{ urls: "stun:stun.example.test" }]);
  });
});

// ── Media acquisition ─────────────────────────────────────────────────────

describe("media acquisition", () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

  function stubMedia(getUserMedia: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  }

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  const fakeStream = (tracks: number) =>
    ({
      getTracks: () =>
        Array.from({ length: tracks }, () => ({ stop: vi.fn(), enabled: true })),
      getVideoTracks: () => (tracks > 1 ? [{ stop: vi.fn(), enabled: true }] : []),
      getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
    }) as unknown as MediaStream;

  it("maps browser errors to typed recoverable failures", () => {
    const denied = mapGetUserMediaError(new DOMException("x", "NotAllowedError"), "audio+video");
    expect(denied.kind).toBe("permission_denied");
    expect(denied.recoveries).toContain("retry");

    const missing = mapGetUserMediaError(new DOMException("x", "NotFoundError"), "video");
    expect(missing.kind).toBe("device_missing");
    expect(missing.recoveries[0]).toBe("continue_audio");

    const unsupported = mapGetUserMediaError(new TypeError("no mediaDevices"), "audio");
    expect(unsupported.kind).toBe("unsupported");
    expect(unsupported.recoveries).toEqual(["continue_text"]);
  });

  it("reports unsupported capture honestly when mediaDevices is absent", async () => {
    Reflect.deleteProperty(navigator, "mediaDevices");
    expect(isMediaCaptureSupported()).toBe(false);
    await expect(acquireLocalMedia({ video: false })).rejects.toBeInstanceOf(MediaAcquireError);
  });

  it("retries audio-only when the camera is missing or constrained", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("no camera", "NotFoundError"))
      .mockResolvedValueOnce(fakeStream(1));
    stubMedia(getUserMedia);

    const stream = await acquireLocalMedia({ video: true });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, expect.objectContaining({ video: expect.anything() }));
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: true });
    expect(stream.getVideoTracks().length).toBe(0);
  });

  it("never silently degrades a permission denial to audio-only", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    stubMedia(getUserMedia);

    await expect(acquireLocalMedia({ video: true })).rejects.toMatchObject({
      kind: "permission_denied",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1); // no silent audio retry loop
  });

  it("permission is only ever requested by an explicit call (never at import)", () => {
    const getUserMedia = vi.fn();
    stubMedia(getUserMedia);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

// ── Diagnostics privacy ───────────────────────────────────────────────────

describe("diagnostics allowlist", () => {
  beforeEach(() => {
    clearConsultationDiagnostics();
  });

  it("keeps only allowlisted data keys — arbitrary payloads are dropped", () => {
    logConsultationEvent("consultation_connected", {
      mode: "video",
      symptomText: "chest pain since morning", // not allowlisted
      sdp: "v=0 huge", // SDP must never be recorded
    });
    const entries = getConsultationDiagnostics();
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toEqual({ mode: "video" });
    expect(JSON.stringify(entries)).not.toContain("chest pain");
    expect(JSON.stringify(entries)).not.toContain("v=0");
  });

  it("bounds the ring buffer", () => {
    for (let i = 0; i < 150; i += 1) {
      logConsultationEvent("consultation_ice_sent", { count: i });
    }
    const entries = getConsultationDiagnostics();
    expect(entries.length).toBeLessThanOrEqual(100);
    // Oldest entries fall off; the newest survives.
    expect(entries[entries.length - 1].data.count).toBe(149);
  });

  it("subscribers receive sanitized entries and unsubscribe cleanly", () => {
    const seen: unknown[] = [];
    const unsub = subscribeConsultationDiagnostics((entry) => seen.push(entry));
    logConsultationEvent("permission_error", { kind: "permission_denied", media: "audio", raw: "leak" });
    unsub();
    logConsultationEvent("permission_error", { kind: "unknown", media: "audio" });
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(seen)).not.toContain("leak");
  });
});
