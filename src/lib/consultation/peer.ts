/**
 * Real WebRTC peer session (browser-to-browser media).
 *
 * This is the production media path — no fakes, no simulated success:
 *   - RTCPeerConnection + getUserMedia + SDP offer/answer + trickle ICE
 *   - "perfect negotiation" pattern (polite/impolite) so both participants
 *     joining at the same time cannot deadlock on glare
 *   - remote media arrives via real ontrack events
 *   - connection/ICE state is surfaced verbatim to the state machine
 *   - stats sampling (RTT, packet loss, outgoing bitrate) feeds adaptation
 *   - bounded ICE restart on failure (never an infinite loop)
 *   - video level changes use applyConstraints + sender bitrate caps and are
 *     best-effort: a browser that cannot adjust simply keeps the old level
 *
 * All signalling I/O is injected (`sendSignal`), so this module never knows
 * about Supabase — and tests can drive two sessions against each other.
 */

import { logConsultationEvent } from "./diagnostics";
import { VIDEO_PROFILE_CONSTRAINTS, type VideoProfileLevel } from "./adaptation";
import type { ConsultationSignal } from "./signalling";
import type { PeerStatsSample } from "./types";

export interface PeerSessionCallbacks {
  /** Deliver an offer/answer/ice signal to the signalling transport. */
  sendSignal: (signal: ConsultationSignal) => void;
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onIceStateChange: (state: RTCIceConnectionState) => void;
  onStats: (sample: PeerStatsSample) => void;
  /** Fired when the session wants an ICE restart (bounded by the session). */
  onRestartIceNeeded: (attempt: number) => void;
  /** Fired when reconnection attempts are exhausted. */
  onRestartExhausted: () => void;
}

export interface PeerSessionDeps {
  /** The patient is the polite peer; the clinician is impolite. */
  polite: boolean;
  sessionId: string;
  participantId: string;
  rtcConfig: RTCConfiguration;
  callbacks: PeerSessionCallbacks;
  /** Injected for tests; defaults to window.RTCPeerConnection. */
  peerConnectionFactory?: () => RTCPeerConnection;
  statsIntervalMs?: number;
  /** Bounded ICE restarts before onRestartExhausted. */
  maxRestartAttempts?: number;
  /** Grace period before treating "disconnected" as failed. */
  disconnectedGraceMs?: number;
}

type MediaKind = "audio" | "video";

const STATS_INTERVAL_DEFAULT_MS = 2_000;
const MAX_RESTARTS_DEFAULT = 5;
const DISCONNECTED_GRACE_DEFAULT_MS = 8_000;

export class ConsultationPeerSession {
  private readonly deps: PeerSessionDeps;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswer = false;
  private remoteCandidates: RTCIceCandidateInit[] = [];
  private closed = false;

  private restartAttempts = 0;
  private disconnectedTimer: ReturnType<typeof setTimeout> | null = null;

  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private prevStats: { packetsLost: number; packetsReceived: number; at: number } | null = null;

  /** Serializes all description operations (avoids interleaved set* calls). */
  private opQueue: Promise<void> = Promise.resolve();

  constructor(deps: PeerSessionDeps) {
    this.deps = deps;
  }

  get connectionState(): RTCPeerConnectionState {
    return this.pc?.connectionState ?? "new";
  }

  get iceConnectionState(): RTCIceConnectionState {
    return this.pc?.iceConnectionState ?? "new";
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const factory = this.deps.peerConnectionFactory;
    const pc: RTCPeerConnection = factory
      ? factory()
      : new window.RTCPeerConnection(this.deps.rtcConfig);
    this.pc = pc;

    pc.onnegotiationneeded = () => {
      void this.enqueue(async () => {
        if (this.closed || !this.pc) return;
        try {
          this.makingOffer = true;
          await this.pc.setLocalDescription();
          const local = this.pc.localDescription;
          if (local) {
            logConsultationEvent("consultation_offer_sent", {
              renegotiation: this.restartAttempts > 0,
            });
            this.deps.callbacks.sendSignal({
              type: local.type === "answer" ? "answer" : "offer",
              sessionId: this.deps.sessionId,
              participantId: this.deps.participantId,
              sdp: local.sdp ?? "",
            });
          }
        } catch {
          logConsultationEvent("consultation_connection_state", { state: "error" });
        } finally {
          this.makingOffer = false;
        }
      });
    };

    pc.onicecandidate = (event) => {
      this.deps.callbacks.sendSignal({
        type: "ice-candidate",
        sessionId: this.deps.sessionId,
        participantId: this.deps.participantId,
        candidate: event.candidate
          ? {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            }
          : null,
      });
      logConsultationEvent("consultation_ice_sent", { count: 1 });
    };

    pc.ontrack = (event) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream();
      this.remoteStream.addTrack(event.track);
      this.deps.callbacks.onRemoteStream(this.remoteStream);
      event.track.onended = () => {
        // Peer disabled their track: keep the stream object stable for React.
      };
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      logConsultationEvent("consultation_connection_state", { state });
      this.deps.callbacks.onConnectionStateChange(state);

      if (state === "connected") {
        this.restartAttempts = 0;
        this.clearDisconnectedTimer();
      } else if (state === "failed") {
        this.attemptIceRestart();
      } else if (state === "disconnected") {
        this.startDisconnectedTimer();
      } else if (state === "closed") {
        this.clearDisconnectedTimer();
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      logConsultationEvent("consultation_ice_state", { state });
      this.deps.callbacks.onIceStateChange(state);
      if (state === "failed") this.attemptIceRestart();
      else if (state === "connected") this.restartAttempts = 0;
    };

    this.startStatsLoop();
    return pc;
  }

  /** Attach the local stream (adds tracks; triggers negotiation). */
  start(localStream: MediaStream): void {
    if (this.closed) return;
    const pc = this.ensurePeerConnection();
    this.localStream = localStream;
    for (const track of localStream.getTracks()) {
      const already = pc.getSenders().some((s) => s.track === track);
      if (!already) pc.addTrack(track, localStream);
    }
    this.deps.callbacks.onLocalStream(localStream);
  }

  /** Attach/replace the camera track (used when upgrading audio → video). */
  attachVideoTrack(track: MediaStreamTrack): void {
    if (this.closed) return;
    const pc = this.ensurePeerConnection();
    const sender = pc.getSenders().find((s) => s.track?.kind === "video" || !s.track);
    if (sender && !sender.track) {
      void sender.replaceTrack(track);
    } else if (sender) {
      void sender.replaceTrack(track);
    } else {
      pc.addTrack(track, this.localStream ?? new MediaStream([track]));
    }
    if (this.localStream && !this.localStream.getVideoTracks().includes(track)) {
      this.localStream.addTrack(track);
    }
  }

  /** Detach the camera track without tearing down the video transceiver. */
  detachVideoTrack(): void {
    if (!this.pc) return;
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender) void sender.replaceTrack(null);
  }

  // ── Inbound signalling ─────────────────────────────────────────────────

  /** Handle one inbound offer/answer/ICE signal (serialized internally). */
  handleSignal(
    signal: Extract<
      ConsultationSignal,
      { type: "offer" | "answer" | "ice-candidate" }
    >
  ): void {
    if (this.closed) return;
    void this.enqueue(async () => {
      const pc = this.ensurePeerConnection();

      if (signal.type === "ice-candidate") {
        const init = signal.candidate;
        if (!pc.remoteDescription) {
          if (init) this.remoteCandidates.push(init);
          return;
        }
        try {
          await pc.addIceCandidate(init ?? null);
          logConsultationEvent("consultation_ice_received", { count: 1 });
        } catch (error) {
          if (!this.ignoreOffer) {
            logConsultationEvent("signalling_invalid_payload", { reason: "ice_rejected" });
            void error;
          }
        }
        return;
      }

      if (signal.type === "offer") {
        const description: RTCSessionDescriptionInit = { type: "offer", sdp: signal.sdp };
        const collision =
          this.settingRemoteAnswer || (description.type === "offer" && pc.signalingState !== "stable");
        this.ignoreOffer = !this.deps.polite && collision;
        if (this.ignoreOffer) return; // impolite peer ignores the colliding offer
        try {
          if (collision && this.deps.polite) {
            // Polite peer rolls back its own offer (implicit rollback support
            // is required in modern browsers; we also set explicitly).
            await pc.setLocalDescription({ type: "rollback" });
          }
          await pc.setRemoteDescription(description);
          await this.flushRemoteCandidates();
          await pc.setLocalDescription();
          const local = pc.localDescription;
          if (local) {
            logConsultationEvent("consultation_answer_sent", {});
            this.deps.callbacks.sendSignal({
              type: "answer",
              sessionId: this.deps.sessionId,
              participantId: this.deps.participantId,
              sdp: local.sdp ?? "",
            });
          }
        } catch {
          logConsultationEvent("consultation_connection_state", { state: "error" });
        }
        return;
      }

      // answer
      if (pc.signalingState !== "have-local-offer") return;
      this.settingRemoteAnswer = true;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await this.flushRemoteCandidates();
      } catch {
        logConsultationEvent("consultation_connection_state", { state: "error" });
      } finally {
        this.settingRemoteAnswer = false;
      }
    });
  }

  private async flushRemoteCandidates(): Promise<void> {
    if (!this.pc) return;
    const queued = this.remoteCandidates.splice(0, this.remoteCandidates.length);
    for (const init of queued) {
      try {
        await this.pc.addIceCandidate(init);
      } catch {
        logConsultationEvent("signalling_invalid_payload", { reason: "ice_rejected" });
      }
    }
  }

  // ── Reconnection (bounded) ──────────────────────────────────────────────

  private startDisconnectedTimer(): void {
    if (this.disconnectedTimer || this.closed) return;
    this.disconnectedTimer = setTimeout(() => {
      this.disconnectedTimer = null;
      if (this.pc?.connectionState === "disconnected") this.attemptIceRestart();
    }, this.deps.disconnectedGraceMs ?? DISCONNECTED_GRACE_DEFAULT_MS);
  }

  private clearDisconnectedTimer(): void {
    if (this.disconnectedTimer) {
      clearTimeout(this.disconnectedTimer);
      this.disconnectedTimer = null;
    }
  }

  private attemptIceRestart(): void {
    if (this.closed || !this.pc) return;
    const max = this.deps.maxRestartAttempts ?? MAX_RESTARTS_DEFAULT;
    if (this.restartAttempts >= max) {
      this.deps.callbacks.onRestartExhausted();
      return;
    }
    this.restartAttempts += 1;
    logConsultationEvent("reconnection_started", { attempt: this.restartAttempts });
    this.deps.callbacks.onRestartIceNeeded(this.restartAttempts);
    try {
      if (typeof this.pc.restartIce === "function") {
        this.pc.restartIce(); // negotiationneeded re-fires → new offer
      } else {
        // Older browsers: force a renegotiation by re-adding a track hint.
        void this.pc
          .createOffer({ iceRestart: true })
          .then((offer) => this.pc?.setLocalDescription(offer))
          .then(() => {
            const local = this.pc?.localDescription;
            if (local) {
              this.deps.callbacks.sendSignal({
                type: "offer",
                sessionId: this.deps.sessionId,
                participantId: this.deps.participantId,
                sdp: local.sdp ?? "",
              });
            }
          })
          .catch(() => undefined);
      }
    } catch {
      logConsultationEvent("reconnection_failed", { attempt: this.restartAttempts, reason: "restart" });
    }
  }

  // ── Adaptation ─────────────────────────────────────────────────────────

  /** Apply capture + bitrate constraints for a video quality level. */
  async applyVideoLevel(level: VideoProfileLevel): Promise<void> {
    const profile = VIDEO_PROFILE_CONSTRAINTS[level];
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: profile.frameRate },
        });
      } catch {
        // Best effort: keep the current constraints on unsupported devices.
      }
    }
    if (this.pc) {
      for (const sender of this.pc.getSenders()) {
        if (sender.track?.kind !== "video") continue;
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          for (const encoding of params.encodings) {
            encoding.maxBitrate = profile.maxBitrateBps;
          }
          await sender.setParameters(params);
        } catch {
          // Not supported everywhere; degradation still works via constraints.
        }
      }
    }
    logConsultationEvent("video_enabled", { level });
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  private startStatsLoop(): void {
    if (this.statsTimer) return;
    const interval = this.deps.statsIntervalMs ?? STATS_INTERVAL_DEFAULT_MS;
    this.statsTimer = setInterval(() => {
      void this.sampleStats();
    }, interval);
  }

  async sampleStats(): Promise<PeerStatsSample | null> {
    if (!this.pc) return null;
    try {
      const report = await this.pc.getStats();
      let rttMs: number | null = null;
      let outgoingBitrateBps: number | null = null;
      let packetsLost = 0;
      let packetsReceived = 0;
      let hasRtp = false;

      report.forEach((entry) => {
        const stat = entry as unknown as Record<string, unknown>;
        if (stat.type === "candidate-pair" && stat.state === "succeeded") {
          if (typeof stat.currentRoundTripTime === "number") {
            rttMs = Math.round(stat.currentRoundTripTime * 1000);
          }
          if (typeof stat.availableOutgoingBitrate === "number") {
            outgoingBitrateBps = Math.round(stat.availableOutgoingBitrate);
          }
        }
        if (stat.type === "inbound-rtp" && typeof stat.packetsReceived === "number") {
          hasRtp = true;
          packetsReceived += stat.packetsReceived;
          if (typeof stat.packetsLost === "number") packetsLost += stat.packetsLost;
        }
      });

      let packetLossRatio: number | null = null;
      const now = Date.now();
      if (hasRtp && this.prevStats) {
        const dLost = Math.max(0, packetsLost - this.prevStats.packetsLost);
        const dRecv = Math.max(0, packetsReceived - this.prevStats.packetsReceived);
        const total = dLost + dRecv;
        if (total > 0 && now > this.prevStats.at) packetLossRatio = dLost / total;
      }
      this.prevStats = { packetsLost, packetsReceived, at: now };

      const sample: PeerStatsSample = { rttMs, packetLossRatio, outgoingBitrateBps };
      this.deps.callbacks.onStats(sample);
      return sample;
    } catch {
      return null;
    }
  }

  // ── Teardown ────────────────────────────────────────────────────────────

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearDisconnectedTimer();
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    if (this.pc) {
      try {
        this.pc.onnegotiationneeded = null;
        this.pc.onicecandidate = null;
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch {
        // already closed
      }
      this.pc = null;
    }
    this.remoteStream = null;
    this.localStream = null;
    this.remoteCandidates = [];
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.opQueue = this.opQueue.then(task).catch(() => undefined);
    return this.opQueue;
  }
}
