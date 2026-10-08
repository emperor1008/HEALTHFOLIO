/**
 * Consultation domain types (Phase 1).
 *
 * Single source of truth for the shapes shared by the state machine, the
 * WebRTC peer session, the signalling layer, and the UI. No `any`, no
 * untyped signalling objects.
 */

/** Which participant the server resolved for the current session. */
export type ConsultationRole = "patient" | "clinician";

/** Effective media mode of a consultation. `text` = store-and-forward. */
export type ConnectionMode = "video" | "audio" | "text";

/** Coarse, honest network quality. Exactly five values — no fake precision. */
export type NetworkQuality = "excellent" | "good" | "degraded" | "poor" | "offline";

/** Browser Network Information API effective type, when the browser has it. */
export type EffectiveConnectionType = "slow-2g" | "2g" | "3g" | "4g";

/**
 * A snapshot of connectivity. Fields are `null` when the browser cannot
 * measure them — unavailable is reported as unavailable, never invented.
 */
export interface NetworkProfile {
  online: boolean;
  effectiveType: EffectiveConnectionType | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
  quality: NetworkQuality;
  /** When the profile was sampled (epoch ms). */
  sampledAt: number;
}

/** WebRTC transport-level measurements derived from RTCPeerConnection.getStats(). */
export interface PeerStatsSample {
  /** Round-trip time in ms from the selected candidate pair, when reported. */
  rttMs: number | null;
  /** Fractional packet loss 0..1 over the sampling window, when computable. */
  packetLossRatio: number | null;
  /** Available outgoing bitrate in bps when the browser reports it. */
  outgoingBitrateBps: number | null;
}

/** Server-visible consultation session (see /api/consultations). */
export interface ConsultationSession {
  id: string;
  role: ConsultationRole;
  state: string;
  mode: "text" | "audio" | "video";
  careRequestId: string | null;
  proposedStartsAt: string | null;
  confirmedStartsAt: string | null;
  /** Realtime channel capability. Only present once authorized + joinable. */
  roomChannel: string | null;
  /** Server-minted participant id for THIS session fetch (never client-chosen). */
  participantId: string | null;
  /** Short reason snippet (authorized participants only). */
  reason: string | null;
  triageCategory: string | null;
}
