/**
 * useConsultation — the consultation orchestrator (patient AND clinician).
 *
 * Wires together:
 *   - the pure consultation state machine (single source of truth)
 *   - local media acquisition (permission only on user join)
 *   - the Supabase Realtime signalling transport (ready/offer/answer/ice/
 *     mode/leave — presence for join/leave detection)
 *   - the real RTCPeerConnection session (perfect negotiation, bounded ICE
 *     restarts, stats)
 *   - the network profile monitor + adaptation loop (reduce first, switch
 *     to audio only when the network stays poor, text as last resort)
 *   - bounded reconnection with exponential backoff (never an infinite loop)
 *   - hand-off to the existing offline queue for text (store-and-forward)
 *   - privacy-safe diagnostics + metric events (no SDP, no symptom text)
 *
 * All mutable plumbing lives in refs; React state holds only what the UI
 * renders. Nothing here ever fakes a connection state.
 */

"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  INITIAL_CONSULTATION_STATE,
  transition,
  type ConsultationEvent,
  type ConsultationState,
} from "./state-machine";
import {
  buildNetworkProfile,
  createConsultationNetworkMonitor,
  type NetworkInformationLike,
} from "./network-profile";
import {
  computeBackoffDelay,
  decideAdaptation,
  effectiveCallQuality,
  VIDEO_PROFILE_CONSTRAINTS,
  type VideoProfileLevel,
} from "./adaptation";
import {
  MediaAcquireError,
  acquireLocalMedia,
  isMediaCaptureSupported,
  setCameraEnabled,
  setMicrophoneEnabled,
  stopStream,
} from "./media";
import { ConsultationPeerSession } from "./peer";
import {
  createSupabaseSignallingTransport,
  getSignallingConfig,
  type ConsultationSignal,
  type SignallingState,
  type SignallingTransport,
} from "./signalling";
import { getRtcConfiguration, isWebRtcSupported } from "./rtc-config";
import {
  getConsultationDiagnostics,
  logConsultationEvent,
  subscribeConsultationDiagnostics,
  type ConsultationDiagnosticEntry,
} from "./diagnostics";
import type {
  ConnectionMode,
  ConsultationRole,
  ConsultationSession,
  NetworkProfile,
  PeerStatsSample,
} from "./types";

export type SessionLoadState = "loading" | "ready" | "unauthorized" | "not_found" | "error";

export interface ModeRecommendation {
  from: ConsultationRole;
  mode: ConnectionMode;
  at: number;
}

export interface UseConsultationResult {
  session: ConsultationSession | null;
  sessionLoad: SessionLoadState;
  state: ConsultationState;
  profile: NetworkProfile;
  videoLevel: VideoProfileLevel;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  cameraOff: boolean;
  mediaError: MediaAcquireError | null;
  /** True when the deployment has Supabase Realtime configured for calls. */
  liveCallAvailable: boolean;
  peerPresent: boolean;
  transportState: SignallingState;
  /** Incoming mode recommendation from the other participant (if any). */
  recommendation: ModeRecommendation | null;
  /** Counters surfaced in diagnostics and the clinician status line. */
  degradationCount: number;
  audioFallbackCount: number;
  reconnectionCount: number;
  diagnostics: readonly ConsultationDiagnosticEntry[];
  join: (mode: "video" | "audio") => Promise<void>;
  switchMode: (mode: ConnectionMode) => Promise<void>;
  /** Retry after a recoverable error; defaults to the last attempted mode. */
  retry: (mode?: "video" | "audio") => Promise<void>;
  /** Re-fetch the session detail (after a load failure). */
  reloadSession: () => void;
  /** Clinician→patient mode suggestion (transport-level, optional). */
  recommendMode: (mode: "video" | "audio") => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  dismissMediaError: () => void;
  acceptRecommendation: () => Promise<void>;
  dismissRecommendation: () => void;
  end: (reason?: string) => void;
}

function mapMediaErrorToCode(error: MediaAcquireError): ConsultationEvent {
  switch (error.kind) {
    case "permission_denied":
      return { type: "MEDIA_FAILED", error: "permission_denied" };
    case "unsupported":
      return { type: "MEDIA_FAILED", error: "unsupported_browser" };
    case "device_missing":
      return error.media === "video"
        ? { type: "MEDIA_FAILED", error: "camera_unavailable" }
        : { type: "MEDIA_FAILED", error: "microphone_unavailable" };
    case "device_in_use":
      return error.media === "audio"
        ? { type: "MEDIA_FAILED", error: "microphone_unavailable" }
        : { type: "MEDIA_FAILED", error: "camera_unavailable" };
    default:
      return { type: "MEDIA_FAILED", error: "unknown" };
  }
}

/** Fire-and-forget telemetry: never blocks or breaks the consultation. */
function postConsultationEvent(sessionId: string, event: string, detail?: string): void {
  void fetch(`/api/consultations/${sessionId}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...(detail ? { detail } : {}) }),
  }).catch(() => undefined);
}

export function useConsultation(sessionId: string): UseConsultationResult {
  // ── Machine state (single source of truth for status/mode/error) ────────
  const [machine, dispatch] = useReducer(
    (state: ConsultationState, event: ConsultationEvent) => transition(state, event),
    INITIAL_CONSULTATION_STATE
  );

  // ── Rendered state ──────────────────────────────────────────────────────
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [sessionLoad, setSessionLoad] = useState<SessionLoadState>("loading");
  const [profile, setProfile] = useState<NetworkProfile>(() =>
    buildNetworkProfile(
      typeof window !== "undefined" && typeof window.navigator === "object"
        ? {
            onLine: window.navigator.onLine,
            connection: (window.navigator as Navigator & { connection?: NetworkInformationLike })
              .connection,
          }
        : { onLine: false }
    )
  );
  const [videoLevel, setVideoLevel] = useState<VideoProfileLevel>("medium");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [mediaError, setMediaError] = useState<MediaAcquireError | null>(null);
  const [peerPresent, setPeerPresent] = useState(false);
  const [transportState, setTransportState] = useState<SignallingState>("disconnected");
  const [recommendation, setRecommendation] = useState<ModeRecommendation | null>(null);
  const [degradationCount, setDegradationCount] = useState(0);
  const [audioFallbackCount, setAudioFallbackCount] = useState(0);
  const [reconnectionCount, setReconnectionCount] = useState(0);
  const [diagnostics, setDiagnostics] = useState<readonly ConsultationDiagnosticEntry[]>(() =>
    getConsultationDiagnostics()
  );
  const [sessionLoadNonce, setSessionLoadNonce] = useState(0);

  // ── Mutable plumbing (refs — mirrored from state via an effect below) ───
  const sessionRef = useRef<ConsultationSession | null>(null);
  const machineRef = useRef<ConsultationState>(machine);
  const transportRef = useRef<SignallingTransport | null>(null);
  const peerRef = useRef<ConsultationPeerSession | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const expectedPeerRef = useRef<string | null>(null);
  const statsRef = useRef<PeerStatsSample | null>(null);
  const attemptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joiningRef = useRef(false);
  const endedRef = useRef(false);
  const monitorRef = useRef<ReturnType<typeof createConsultationNetworkMonitor> | null>(null);
  const videoLevelRef = useRef<VideoProfileLevel>(videoLevel);
  const cameraOffRef = useRef<boolean>(cameraOff);
  const adaptRef = useRef({ badStreak: 0, goodStreak: 0, levelSince: 0 });
  const handleSignalRef = useRef<(signal: ConsultationSignal) => void>(() => undefined);
  const handlePeersRef = useRef<(peers: readonly { participantId: string }[]) => void>(
    () => undefined
  );
  const evaluateAdaptationRef = useRef<() => void>(() => undefined);
  const joinModeRef = useRef<"video" | "audio">("audio");

  const liveCallAvailable = useMemo(() => getSignallingConfig() !== null, []);

  const selfParticipantId = useCallback(
    () => sessionRef.current?.participantId ?? sessionRef.current?.id ?? "",
    []
  );

  /**
   * Re-sync the machine with a peer connection that is ALREADY connected.
   * Covers presence churn: a transient empty sync must never leave a live
   * call stuck in `waiting_for_peer`/`connecting` when media is flowing.
   */
  const syncConnectedState = useCallback(() => {
    const pc = peerRef.current;
    if (pc && pc.connectionState === "connected") {
      const hasVideo =
        localStreamRef.current?.getVideoTracks().some((t) => t.enabled) ?? false;
      dispatch({ type: "PC_CONNECTED", mode: hasVideo ? "video" : "audio" });
    }
  }, []);

  const teardown = useCallback(() => {
    if (attemptTimerRef.current) {
      clearTimeout(attemptTimerRef.current);
      attemptTimerRef.current = null;
    }
    peerRef.current?.stop();
    peerRef.current = null;
    transportRef.current?.close();
    transportRef.current = null;
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    expectedPeerRef.current = null;
    statsRef.current = null;
    joiningRef.current = false;
  }, []);

  // ── Session load + network monitor + diagnostics + cleanup ─────────────
  useEffect(() => {
    let alive = true;    const monitor = createConsultationNetworkMonitor(window);
    monitorRef.current = monitor;
    const unsubMonitor = monitor.subscribe((next) => {
      if (alive) setProfile(next);
    });
    const unsubDiag = subscribeConsultationDiagnostics(() => {
      if (alive) setDiagnostics(getConsultationDiagnostics());
    });

    fetch(`/api/consultations/${sessionId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401 || res.status === 403) {
          setSessionLoad("unauthorized");
          return;
        }
        if (res.status === 404) {
          setSessionLoad("not_found");
          return;
        }
        if (!res.ok) {
          setSessionLoad("error");
          return;
        }
        const data = (await res.json()) as { session?: ConsultationSession };
        if (!alive) return;
        if (data.session) {
          setSession(data.session);
          setSessionLoad("ready");
        } else {
          setSessionLoad("error");
        }
      })
      .catch(() => {
        // Offline or server unreachable: stay honest, keep text usable.
        if (alive) setSessionLoad("error");
      });

    return () => {
      alive = false;
      unsubMonitor();
      unsubDiag();
      monitor.dispose();
      monitorRef.current = null;
      teardown();
    };
  }, [sessionId, teardown, sessionLoadNonce]);

  // ── Mirror rendered state into refs (post-render, never during render) ──
  useEffect(() => {
    machineRef.current = machine;
    sessionRef.current = session;
    videoLevelRef.current = videoLevel;
    cameraOffRef.current = cameraOff;
  });

  // ── Signal handling ─────────────────────────────────────────────────────
  const handleSignal = useCallback((signal: ConsultationSignal) => {
    const peerId = expectedPeerRef.current;
    if (peerId && signal.participantId !== peerId) return; // only our peer
    if (!peerId) expectedPeerRef.current = signal.participantId;

    switch (signal.type) {
      case "ready": {
        setPeerPresent(true);
        logConsultationEvent("consultation_peer_present", { count: 1 });
        dispatch({ type: "PEER_PRESENT" });
        syncConnectedState();
        return;
      }
      case "offer":
      case "answer":
      case "ice-candidate": {
        peerRef.current?.handleSignal(signal);
        if (signal.type === "offer") dispatch({ type: "NEGOTIATION_STARTED" });
        return;
      }
      case "mode": {
        if (signal.source === "recommend") {
          setRecommendation({ from: "clinician", mode: signal.mode, at: Date.now() });
        } else {
          dispatch({ type: "FORCE_MODE", mode: signal.mode });
        }
        return;
      }
      case "leave": {
        setPeerPresent(false);
        logConsultationEvent("consultation_peer_absent", { count: 0 });
        dispatch({ type: "PEER_ABSENT" });
        return;
      }
      default:
        return;
    }
  }, [syncConnectedState]);

  const handlePeers = useCallback((peers: readonly { participantId: string }[]) => {
    setPeerPresent(peers.length > 0);
    if (peers.length > 0) {
      if (!expectedPeerRef.current) expectedPeerRef.current = peers[0].participantId;
      logConsultationEvent("consultation_peer_present", { count: peers.length });
      dispatch({ type: "PEER_PRESENT" });
      syncConnectedState();
    } else {
      logConsultationEvent("consultation_peer_absent", { count: 0 });
      dispatch({ type: "PEER_ABSENT" });
    }
  }, [syncConnectedState]);

  // ── Adaptation evaluation (runs after every stats sample) ───────────────
  const evaluateAdaptation = useCallback(() => {
    const current = machineRef.current;
    if (current.status !== "connected_video" && current.status !== "degraded_video") return;
    const currentProfile = monitorRef.current?.getProfile() ?? profile;
    const adapt = adaptRef.current;
    if (adapt.levelSince === 0) adapt.levelSince = Date.now(); // dwell starts at first sample
    const stats = statsRef.current;

    const quality = effectiveCallQuality(currentProfile, stats);
    if (quality === "poor" || quality === "degraded" || quality === "offline") {
      adapt.badStreak += 1;
      adapt.goodStreak = 0;
    } else {
      adapt.goodStreak += 1;
      adapt.badStreak = 0;
    }

    const decision = decideAdaptation({
      profile: currentProfile,
      stats,
      videoLevel,
      mode: current.mode === "audio" ? "audio" : "video",
      badStreak: adapt.badStreak,
      goodStreak: adapt.goodStreak,
      levelSinceMs: adapt.levelSince,
      nowMs: Date.now(),
    });

    if (decision.action === "reduce_video") {
      if (decision.videoLevel !== videoLevel) {
        setVideoLevel(decision.videoLevel);
        adapt.levelSince = Date.now();
        void peerRef.current?.applyVideoLevel(decision.videoLevel);
        dispatch({ type: "QUALITY_DEGRADED" });
        logConsultationEvent("video_degraded", {
          level: decision.videoLevel,
          quality: decision.effectiveQuality,
        });
        setDegradationCount((n) => n + 1);
        postConsultationEvent(sessionId, "degraded_quality");
      }
      return;
    }

    if (decision.action === "switch_audio") {
      // Sustained poor network at the lowest video level → bounded fallback.
      const stream = localStreamRef.current;
      const videoTrack = stream?.getVideoTracks()[0];
      peerRef.current?.detachVideoTrack();
      if (videoTrack) {
        stream?.removeTrack(videoTrack);
        videoTrack.stop();
      }
      setCameraOff(true);
      dispatch({ type: "FORCE_MODE", mode: "audio" });
      logConsultationEvent("switched_to_audio", { reason: "network" });
      setAudioFallbackCount((n) => n + 1);
      postConsultationEvent(sessionId, "degraded_to_audio");
      return;
    }

    if (decision.action === "upgrade_video" && decision.videoLevel !== videoLevel) {
      setVideoLevel(decision.videoLevel);
      adapt.levelSince = Date.now();
      void peerRef.current?.applyVideoLevel(decision.videoLevel);
      if (machineRef.current.status === "degraded_video") dispatch({ type: "QUALITY_RECOVERED" });
      logConsultationEvent("video_upgraded", {
        level: decision.videoLevel,
        quality: decision.effectiveQuality,
      });
    }
  }, [sessionId, videoLevel, profile]);

  // ── Ref mirror for callbacks captured by identity-stable handlers ───────
  useEffect(() => {
    handleSignalRef.current = handleSignal;
    handlePeersRef.current = handlePeers;
    evaluateAdaptationRef.current = evaluateAdaptation;
  });

  // ── Bounded reconnection (exponential backoff, single scheduled attempt) ─
  const attemptReconnectRef = useRef<() => void>(() => undefined);
  const attemptReconnect = useCallback(() => {
    if (endedRef.current) return;
    if (machineRef.current.status !== "reconnecting") return;
    if (attemptTimerRef.current) return;

    const attempt = machineRef.current.retryAttempt + 1;
    const delay = computeBackoffDelay(attempt);
    attemptTimerRef.current = setTimeout(() => {
      attemptTimerRef.current = null;
      if (machineRef.current.status !== "reconnecting") return;

      const online = monitorRef.current?.getProfile().online ?? false;
      const pcState = peerRef.current?.connectionState ?? "closed";
      const pcUsable =
        pcState === "connected" || pcState === "connecting" || pcState === "new";

      if (online && pcUsable && transportRef.current?.state === "connected") {
        if (peerRef.current?.connectionState === "connected") {
          logConsultationEvent("reconnection_succeeded", { attempt });
          dispatch({
            type: "RECONNECT_SUCCEEDED",
            mode: machineRef.current.mode === "audio" ? "audio" : "video",
          });
          postConsultationEvent(sessionId, "reconnection_succeeded");
        } else {
          dispatch({ type: "RECONNECT_TICK" });
          attemptReconnectRef.current();
        }
        return;
      }

      if (online) {
        // Network is back but the signalling room dropped: rejoin the SAME
        // room (server-minted capability) — never a second session.
        void (async () => {
          const cfg = getSignallingConfig();
          const s = sessionRef.current;
          if (!cfg || !s?.roomChannel) throw new Error("no_signalling");
          transportRef.current?.close();
          const fresh = createSupabaseSignallingTransport({
            config: cfg,
            channelName: s.roomChannel,
            sessionId: s.id,
            self: {
              participantId: selfParticipantId(),
              role: s.role,
              mode: machineRef.current.mode === "audio" ? "audio" : "video",
            },
            events: {
              onSignal: (sig) => handleSignalRef.current(sig),
              onPeersChanged: (peers) => handlePeersRef.current(peers),
              onStateChanged: (st) => setTransportState(st),
            },
          });
          transportRef.current = fresh;
          await fresh.join();
        })()
          .then(() => {
            if (peerRef.current?.connectionState === "connected") {
              logConsultationEvent("reconnection_succeeded", { attempt });
              dispatch({
                type: "RECONNECT_SUCCEEDED",
                mode: machineRef.current.mode === "audio" ? "audio" : "video",
              });
              postConsultationEvent(sessionId, "reconnection_succeeded");
            } else {
              dispatch({ type: "RECONNECT_TICK" });
              attemptReconnectRef.current();
            }
          })
          .catch(() => {
            dispatch({ type: "RECONNECT_TICK" });
            attemptReconnectRef.current();
          });
        return;
      }

      // Still offline: count the attempt, schedule the next one (bounded).
      logConsultationEvent("reconnection_failed", { attempt, reason: "offline" });
      dispatch({ type: "RECONNECT_TICK" });
      attemptReconnectRef.current();
    }, delay);
  }, [sessionId, selfParticipantId]);

  // Keep the rescheduling entry point pointing at the latest callback
  // (a ref write in an effect — never during render).
  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect;
  });

  // ── Join flow ───────────────────────────────────────────────────────────
  const join = useCallback(
    async (mode: "video" | "audio") => {
      if (joiningRef.current) return;
      const s = sessionRef.current;
      endedRef.current = false;
      setMediaError(null);

      const signalling = getSignallingConfig();
      if (!signalling || !s?.roomChannel) {
        logConsultationEvent("consultation_room_failed", {
          reason: !signalling ? "no_signalling" : "no_room",
        });
        dispatch({
          type: "MEDIA_FAILED",
          error: !signalling ? "signalling_unavailable" : "room_not_available",
        });
        return;
      }
      if (!isWebRtcSupported() || !isMediaCaptureSupported()) {
        dispatch({ type: "MEDIA_FAILED", error: "unsupported_browser" });
        return;
      }

      joiningRef.current = true;
      joinModeRef.current = mode;
      dispatch({ type: "JOIN", mode });
      logConsultationEvent("consultation_join_started", { mode, role: s.role });
      postConsultationEvent(s.id, "join");

      // 1. Local media — the permission prompt happens HERE, never earlier.
      let stream: MediaStream;
      try {
        stream = await acquireLocalMedia({
          video: mode === "video",
          videoConstraints: VIDEO_PROFILE_CONSTRAINTS[videoLevelRef.current],
        });
      } catch (error) {
        joiningRef.current = false;
        if (error instanceof MediaAcquireError) {
          setMediaError(error);
          dispatch(mapMediaErrorToCode(error));
        } else {
          dispatch({ type: "MEDIA_FAILED", error: "unknown" });
        }
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicMuted(false);
      setCameraOff(mode !== "video");
      dispatch({ type: "MEDIA_OK" });

      // 2. Peer session (perfect negotiation: the patient is the polite peer).
      const participantId = selfParticipantId();
      const peer = new ConsultationPeerSession({
        polite: s.role === "patient",
        sessionId: s.id,
        participantId,
        rtcConfig: getRtcConfiguration(),
        callbacks: {
          sendSignal: (signal) => {
            transportRef.current?.send(signal);
          },
          onLocalStream: () => undefined,
          onRemoteStream: (remote) => setRemoteStream(remote),
          onConnectionStateChange: (pcState) => {
            if (pcState === "connected") {
              const hasVideo =
                localStreamRef.current?.getVideoTracks().some((t) => t.enabled) ?? false;
              dispatch({ type: "PC_CONNECTED", mode: hasVideo ? "video" : "audio" });
              logConsultationEvent("consultation_connected", {
                mode: hasVideo ? "video" : "audio",
              });
              setReconnectionCount(0);
            } else if (pcState === "failed") {
              const st = machineRef.current.status;
              if (
                st === "connected_video" ||
                st === "degraded_video" ||
                st === "connected_audio"
              ) {
                dispatch({ type: "NETWORK_LOST" });
                setReconnectionCount((n) => n + 1);
                attemptReconnect();
              }
            }
          },
          onIceStateChange: () => undefined,
          onStats: (sample) => {
            statsRef.current = sample;
            evaluateAdaptationRef.current();
          },
          onRestartIceNeeded: () => {
            const st = machineRef.current.status;
            if (
              st === "connected_video" ||
              st === "degraded_video" ||
              st === "connected_audio"
            ) {
              dispatch({ type: "NETWORK_LOST" });
              setReconnectionCount((n) => n + 1);
              postConsultationEvent(sessionId, "reconnection_started");
            }
            attemptReconnect();
          },
          onRestartExhausted: () => {
            logConsultationEvent("reconnection_failed", { attempt: 5, reason: "exhausted" });
            dispatch({ type: "RECONNECT_EXHAUSTED" });
            postConsultationEvent(sessionId, "reconnection_failed");
          },
        },
      });
      peerRef.current = peer;
      peer.start(stream);
      void peer.applyVideoLevel(videoLevelRef.current);

      // 3. Signalling room (server-minted capability; authorized on GET).
      const transport = createSupabaseSignallingTransport({
        config: signalling,
        channelName: s.roomChannel,
        sessionId: s.id,
        self: { participantId, role: s.role, mode },
        events: {
          onSignal: (signal) => handleSignalRef.current(signal),
          onPeersChanged: (peers) => handlePeersRef.current(peers),
          onStateChanged: (st) => setTransportState(st),
        },
      });
      transportRef.current = transport;

      try {
        await transport.join();
      } catch {
        joiningRef.current = false;
        logConsultationEvent("consultation_room_failed", { reason: "join_failed" });
        dispatch({ type: "MEDIA_FAILED", error: "signalling_unavailable" });
        transport.close();
        transportRef.current = null;
        peer.stop();
        peerRef.current = null;
        stopStream(stream);
        localStreamRef.current = null;
        setLocalStream(null);
        return;
      }

      joiningRef.current = false;
      logConsultationEvent("consultation_room_joined", { role: s.role });
      dispatch({ type: "ROOM_READY" });
      transport.send({
        type: "ready",
        sessionId: s.id,
        participantId,
        role: s.role,
        mode,
      });
      postConsultationEvent(s.id, `mode_${mode}`);
    },
    [attemptReconnect, selfParticipantId, sessionId]
  );

  // ── Manual mode switching ───────────────────────────────────────────────
  const switchMode = useCallback(
    async (mode: ConnectionMode) => {
      const s = sessionRef.current;
      if (!s) return;

      if (mode === "text") {
        logConsultationEvent("switched_to_text", { reason: "user" });
        dispatch({ type: "FORCE_MODE", mode: "text" });
        transportRef.current?.send({
          type: "mode",
          sessionId: s.id,
          participantId: selfParticipantId(),
          mode: "text",
          source: "user",
        });
        postConsultationEvent(s.id, "mode_text");
        // Free the mic/camera; the text thread (offline-capable) remains.
        peerRef.current?.stop();
        peerRef.current = null;
        transportRef.current?.close();
        transportRef.current = null;
        stopStream(localStreamRef.current);
        localStreamRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        return;
      }

      if (mode === "audio") {
        const stream = localStreamRef.current;
        const videoTrack = stream?.getVideoTracks()[0];
        peerRef.current?.detachVideoTrack();
        if (videoTrack) {
          stream?.removeTrack(videoTrack);
          videoTrack.stop();
        }
        setCameraOff(true);
        dispatch({ type: "FORCE_MODE", mode: "audio" });
        logConsultationEvent("switched_to_audio", { reason: "user" });
        transportRef.current?.send({
          type: "mode",
          sessionId: s.id,
          participantId: selfParticipantId(),
          mode: "audio",
          source: "user",
        });
        postConsultationEvent(s.id, "mode_audio");
        return;
      }

      // video requested
      if (
        machineRef.current.status === "store_and_forward" ||
        machineRef.current.status === "ended" ||
        machineRef.current.status === "error"
      ) {
        // The previous media session was fully torn down: rejoin honestly.
        dispatch({ type: "RESET" });
        await join("video");
        return;
      }

      let stream = localStreamRef.current;
      if (!stream) {
        try {
          stream = await acquireLocalMedia({
            video: true,
            videoConstraints: VIDEO_PROFILE_CONSTRAINTS[videoLevelRef.current],
          });
        } catch (error) {
          if (error instanceof MediaAcquireError) setMediaError(error);
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        peerRef.current?.start(stream);
      } else if (stream.getVideoTracks().length === 0) {
        try {
          const withVideo = await acquireLocalMedia({
            video: true,
            videoConstraints: VIDEO_PROFILE_CONSTRAINTS[videoLevelRef.current],
          });
          for (const track of withVideo.getTracks()) stream.addTrack(track);
          stopStream(withVideo);
        } catch (error) {
          if (error instanceof MediaAcquireError) setMediaError(error);
          return; // audio keeps running — never break the call for video
        }
      }

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack && peerRef.current) {
        cameraTrack.enabled = true;
        peerRef.current.attachVideoTrack(cameraTrack);
        void peerRef.current.applyVideoLevel(videoLevelRef.current);
        setCameraOff(false);
        dispatch({ type: "FORCE_MODE", mode: "video" });
        if (peerRef.current.connectionState === "connected") {
          dispatch({ type: "PC_CONNECTED", mode: "video" });
        }
        logConsultationEvent("video_enabled", { level: videoLevelRef.current });
        transportRef.current?.send({
          type: "mode",
          sessionId: s.id,
          participantId: selfParticipantId(),
          mode: "video",
          source: "user",
        });
        postConsultationEvent(s.id, "mode_video");
      }
    },
    [join, selfParticipantId]
  );

  // ── Controls ────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      setMicrophoneEnabled(localStreamRef.current, !next);
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOff((prev) => {
      const stream = localStreamRef.current;
      if (!stream || stream.getVideoTracks().length === 0) return prev;
      const next = !prev;
      setCameraEnabled(stream, !next);
      return next;
    });
  }, []);

  const retry = useCallback(
    async (mode?: "video" | "audio") => {
      setMediaError(null);
      dispatch({ type: "RESET" });
      await join(mode ?? joinModeRef.current);
    },
    [join]
  );

  const reloadSession = useCallback(() => {
    setSessionLoad("loading");
    setSessionLoadNonce((n) => n + 1);
  }, []);

  const recommendMode = useCallback(
    (mode: "video" | "audio") => {
      const s = sessionRef.current;
      if (!s) return;
      transportRef.current?.send({
        type: "mode",
        sessionId: s.id,
        participantId: selfParticipantId(),
        mode,
        source: "recommend",
      });
    },
    [selfParticipantId]
  );

  const dismissMediaError = useCallback(() => {
    setMediaError(null);
    dispatch({ type: "RESET" });
  }, []);

  const acceptRecommendation = useCallback(async () => {
    const rec = recommendation;
    if (!rec) return;
    setRecommendation(null);
    await switchMode(rec.mode);
  }, [recommendation, switchMode]);

  const dismissRecommendation = useCallback(() => setRecommendation(null), []);

  const end = useCallback(
    (reason = "user") => {
      const s = sessionRef.current;
      endedRef.current = true;
      if (s) {
        transportRef.current?.send({
          type: "leave",
          sessionId: s.id,
          participantId: selfParticipantId(),
        });
        postConsultationEvent(s.id, "leave");
      }
      teardown();
      dispatch({ type: "END" });
      logConsultationEvent("consultation_ended", { reason });
      setRemoteStream(null);
      setLocalStream(null);
      setPeerPresent(false);
      setTransportState("disconnected");
    },
    [selfParticipantId, teardown]
  );

  // ── Offline detection → reconnection ────────────────────────────────────
  const lastOnlineRef = useRef(true);
  useEffect(() => {
    const online = profile.online;
    const was = lastOnlineRef.current;
    lastOnlineRef.current = online;
    if (online === was) return;
    const st = machineRef.current.status;
    const active =
      st === "connected_video" ||
      st === "degraded_video" ||
      st === "connected_audio" ||
      st === "connecting" ||
      st === "waiting_for_peer" ||
      st === "joining";
    if (!online && active) {
      logConsultationEvent("offline_fallback_started", { reason: "network_lost" });
      dispatch({ type: "NETWORK_LOST" });
      setReconnectionCount((n) => n + 1);
      postConsultationEvent(sessionId, "reconnection_started");
      attemptReconnect();
    } else if (online && st === "reconnecting") {
      attemptReconnect();
    }
  }, [profile.online, sessionId, attemptReconnect]);

  // ── Foreground refresh: resample stats when the tab becomes visible ─────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void peerRef.current?.sampleStats();
        if (machineRef.current.status === "reconnecting") attemptReconnect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [attemptReconnect]);

  return {
    session,
    sessionLoad,
    state: machine,
    profile,
    videoLevel,
    localStream,
    remoteStream,
    micMuted,
    cameraOff,
    mediaError,
    liveCallAvailable,
    peerPresent,
    transportState,
    recommendation,
    degradationCount,
    audioFallbackCount,
    reconnectionCount,
    diagnostics,
    join,
    switchMode,
    retry,
    reloadSession,
    recommendMode,
    toggleMic,
    toggleCamera,
    dismissMediaError,
    acceptRecommendation,
    dismissRecommendation,
    end,
  };
}
