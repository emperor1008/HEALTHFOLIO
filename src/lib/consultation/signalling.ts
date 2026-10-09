/**
 * Consultation signalling over Supabase Realtime (broadcast + presence).
 *
 * Division of responsibility (Phase 1 target architecture):
 *   - WebRTC carries all media.
 *   - Supabase Realtime carries ONLY session coordination: ready/offer/
 *     answer/ICE/mode/leave. No medical data, no records, no SDP anywhere
 *     except between the two authorized participants of one room.
 *
 * Authorization model:
 *   - The server (GET /api/consultations/[id]) authorizes the caller against
 *     care-request ownership / clinician assignment, mints a room capability
 *     (`care_appointments.room_id`, a random UUID), and only then discloses
 *     the channel name. Possession of the channel name IS the capability:
 *     it is 128-bit random, never logged, never in URLs, and only handed to
 *     the two participants. The participant id is also server-minted.
 *   - Every inbound payload is validated with Zod before it touches the peer
 *     connection; malformed or oversized payloads are dropped and counted.
 *   - Signals from anyone other than the expected single peer are dropped by
 *     the caller (see useConsultation) — a third presence entry can never
 *     inject SDP into an established two-party session.
 *
 * When Supabase Realtime env is missing/placeholder, `getSignallingConfig`
 * returns null and the UI shows an honest fallback (text/store-and-forward)
 * instead of pretending a call is possible.
 */

import { z } from "zod";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import {
  logConsultationEvent,
  type ConsultationDiagnosticEvent,
} from "./diagnostics";
import type { ConnectionMode, ConsultationRole } from "./types";

/** Wire version, bumped if the signal schema ever changes shape. */
export const SIGNAL_PROTOCOL_VERSION = 1;

const SIGNAL_EVENT = "consultation-signal";

// ── Signal schema ──────────────────────────────────────────────────────────

const SessionRef = {
  sessionId: z.string().min(8).max(64),
  participantId: z.string().min(8).max(64),
};

/** SDP is bounded: full session descriptions are well under 100 KB. */
const MAX_SDP_CHARS = 200_000;
const MAX_CANDIDATE_CHARS = 4_096;

const IceCandidateInitSchema = z.object({
  candidate: z.string().max(MAX_CANDIDATE_CHARS),
  sdpMid: z.string().max(64).nullish(),
  sdpMLineIndex: z.number().int().min(0).max(65535).nullish(),
});

export const ConsultationSignalSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    ...SessionRef,
    role: z.enum(["patient", "clinician"]),
    mode: z.enum(["video", "audio"]),
  }),
  z.object({
    type: z.literal("offer"),
    ...SessionRef,
    sdp: z.string().min(1).max(MAX_SDP_CHARS),
  }),
  z.object({
    type: z.literal("answer"),
    ...SessionRef,
    sdp: z.string().min(1).max(MAX_SDP_CHARS),
  }),
  z.object({
    type: z.literal("ice-candidate"),
    ...SessionRef,
    candidate: IceCandidateInitSchema.nullable(),
  }),
  z.object({
    type: z.literal("mode"),
    ...SessionRef,
    mode: z.enum(["video", "audio", "text"]),
    /** "user" = the participant switched themselves; "recommend" = suggestion. */
    source: z.enum(["user", "recommend"]),
  }),
  z.object({
    type: z.literal("leave"),
    ...SessionRef,
  }),
]);

export type ConsultationSignal = z.infer<typeof ConsultationSignalSchema>;

/** Validate an inbound signalling payload. Returns null when invalid. */
export function parseConsultationSignal(input: unknown): ConsultationSignal | null {
  if (typeof input !== "object" || input === null) return null;
  const wrapper = input as { v?: unknown; signal?: unknown };
  // Accept both the wrapped form ({v, signal}) and the bare signal object.
  const candidate = wrapper.v !== undefined ? wrapper.signal : input;
  const parsed = ConsultationSignalSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Wrap a signal for the wire (version-tagged). */
export function wrapSignal(signal: ConsultationSignal): { v: number; signal: ConsultationSignal } {
  return { v: SIGNAL_PROTOCOL_VERSION, signal };
}

// ── Transport abstraction (mockable in tests) ──────────────────────────────

export type SignallingState = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";

export interface SignallingPeer {
  participantId: string;
  role: ConsultationRole;
  mode: "video" | "audio";
}

export interface SignallingTransportEvents {
  onSignal?: (signal: ConsultationSignal) => void;
  /** Presence changed; contains only OTHER participants (never self). */
  onPeersChanged?: (peers: readonly SignallingPeer[]) => void;
  onStateChanged?: (state: SignallingState) => void;
}

export interface SignallingTransport {
  /** Join the room. Resolves when subscribed; rejects on timeout/failure. */
  join(): Promise<void>;
  /** Queue-or-send a signal. Returns false only when the payload is invalid. */
  send(signal: ConsultationSignal): boolean;
  close(): void;
  readonly state: SignallingState;
}

export interface SignallingConfig {
  url: string;
  anonKey: string;
}

function looksPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v === "" ||
    v.startsWith("paste_") ||
    v.includes("paste_your") ||
    v.includes("your-project") ||
    v.includes("your_supabase") ||
    v === "changeme"
  );
}

/**
 * Resolve public Supabase Realtime configuration from the environment.
 * Returns null when unconfigured or placeholder — callers must degrade
 * honestly (no call attempt, text fallback) instead of failing silently.
 */
export function getSignallingConfig(
  env: Record<string, string | undefined> =
    typeof process !== "undefined" ? process.env : {}
): SignallingConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  if (looksPlaceholder(url) || looksPlaceholder(anonKey)) return null;
  if (!/^https?:\/\//.test(url)) return null;
  return { url, anonKey };
}

// ── Supabase Realtime transport ────────────────────────────────────────────

export interface SupabaseTransportDeps {
  config: SignallingConfig;
  channelName: string;
  /** The consultation session id — every inbound signal must match it. */
  sessionId: string;
  self: { participantId: string; role: ConsultationRole; mode: "video" | "audio" };
  events: SignallingTransportEvents;
  /** Injected for tests. Defaults to supabase-js. */
  clientFactory?: (url: string, anonKey: string) => SupabaseClient;
  /** Join timeout in ms (slow 2G friendly). Default 15s. */
  joinTimeoutMs?: number;
}

const OUTBOX_LIMIT = 64;

export function createSupabaseSignallingTransport(
  deps: SupabaseTransportDeps
): SignallingTransport {
  const { config, channelName, self, events } = deps;
  const client: SupabaseClient =
    deps.clientFactory?.(config.url, config.anonKey) ??
    createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 25 } },
    });

  const channel: RealtimeChannel = client.channel(channelName, {
    config: {
      broadcast: { self: false },
      presence: { key: self.participantId },
    },
  });

  let state: SignallingState = "connecting";
  const outbox: ConsultationSignal[] = [];
  let closed = false;

  const setState = (next: SignallingState) => {
    if (state === next) return;
    state = next;
    const diag: ConsultationDiagnosticEvent = "signalling_transport_state";
    logConsultationEvent(diag, { state: next });
    events.onStateChanged?.(next);
  };

  const dispatch = (rawPayload: unknown) => {
    const parsed = parseConsultationSignal(rawPayload);
    if (!parsed) {
      logConsultationEvent("signalling_invalid_payload", { reason: "schema" });
      return;
    }
    if (parsed.sessionId !== deps.sessionId) {
      // Signals must belong to this session.
      logConsultationEvent("signalling_invalid_payload", { reason: "session_mismatch" });
      return;
    }
    if (parsed.participantId === self.participantId) return; // broadcast:self=false, belt & braces
    events.onSignal?.(parsed);
  };

  channel.on("broadcast", { event: SIGNAL_EVENT }, (msg) => {
    dispatch(msg.payload);
  });

  channel.on("presence", { event: "sync" }, () => {
    const stateMap = channel.presenceState<{ participantId: string; role: ConsultationRole; mode: "video" | "audio" }>();
    const peers: SignallingPeer[] = [];
    for (const key of Object.keys(stateMap)) {
      for (const entry of stateMap[key]) {
        const value = entry as unknown as { participantId?: unknown; role?: unknown; mode?: unknown };
        if (
          typeof value.participantId === "string" &&
          (value.role === "patient" || value.role === "clinician") &&
          value.participantId !== self.participantId
        ) {
          peers.push({
            participantId: value.participantId,
            role: value.role,
            mode: value.mode === "audio" ? "audio" : "video",
          });
        }
      }
    }
    events.onPeersChanged?.(peers);
  });

  const flushOutbox = () => {
    const queued = outbox.splice(0, outbox.length);
    for (const signal of queued) void doSend(signal);
  };

  const doSend = async (signal: ConsultationSignal): Promise<void> => {
    try {
      const result = await channel.send({
        type: "broadcast",
        event: SIGNAL_EVENT,
        payload: wrapSignal(signal),
      });
      if (result !== "ok" && result !== "timed out") {
        logConsultationEvent("signalling_transport_state", { state: "reconnecting" });
      }
    } catch {
      logConsultationEvent("signalling_transport_state", { state: "reconnecting" });
    }
  };

  return {
    get state() {
      return state;
    },

    join(): Promise<void> {
      const timeoutMs = deps.joinTimeoutMs ?? 15_000;
      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          setState("failed");
          reject(new Error("signalling_join_timeout"));
        }, timeoutMs);

        channel.subscribe((status, err) => {
          if (settled && status !== "SUBSCRIBED") return;
          if (status === "SUBSCRIBED") {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            setState("connected");
            void channel.track({
              participantId: self.participantId,
              role: self.role,
              mode: self.mode,
              joinedAt: Date.now(),
            });
            flushOutbox();
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              setState("failed");
              reject(err ?? new Error("signalling_channel_error"));
            } else {
              setState("reconnecting");
            }
          } else if (status === "CLOSED") {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              setState("failed");
              reject(new Error("signalling_channel_closed"));
            } else {
              setState("disconnected");
            }
          }
        });
      });
    },

    send(signal: ConsultationSignal): boolean {
      if (closed) return false;
      const valid = parseConsultationSignal(wrapSignal(signal)) !== null;
      if (!valid) {
        logConsultationEvent("signalling_invalid_payload", { reason: "outbound" });
        return false;
      }
      if (state !== "connected") {
        if (outbox.length >= OUTBOX_LIMIT) outbox.shift(); // drop oldest ICE first
        outbox.push(signal);
        return true;
      }
      void doSend(signal);
      return true;
    },

    close() {
      if (closed) return;
      closed = true;
      setState("disconnected");
      try {
        channel.unsubscribe();
        void client.removeChannel(channel);
      } catch {
        // closing must never throw
      }
    },
  };
}
