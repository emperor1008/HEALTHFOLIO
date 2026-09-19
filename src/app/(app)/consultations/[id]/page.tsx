"use client";

/**
 * Secure consultation (Part 3): text-first communication + honest lobby.
 *
 * TEXT (primary, store-and-forward):
 * - Messages compose offline and ride the Part 1 queue (appointment.message).
 * - Delivery states are truthful: saved locally / sending / delivered /
 *   failed — "delivered" only after the server acknowledges. No "seen".
 *
 * AUDIO/VIDEO (secondary):
 * - Permission is requested ONLY when the user presses Join (audio first).
 * - Connection states are honest; no "connected" claim without a real
 *   connection event. Realtime media is documented as unavailable in this
 *   deployment; text remains the dependable path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/language-context";
import { t3 } from "@/lib/i18n/part3";
import { useSync } from "@/lib/offline/sync-provider";
import { PageTransition } from "@/components/ui/PageTransition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type DeliveryState = "saved_locally" | "sending" | "delivered" | "failed";

interface Msg {
  id: string;
  body: string;
  sender_role: string;
  client_created_at: string;
  delivered_at: string | null;
  /** Local-only delivery state for optimistic rendering. */
  localState?: DeliveryState;
}

interface LobbyState {
  phase: "idle" | "connecting" | "connected" | "reconnecting" | "failed";
  media: "none" | "audio" | "video";
}

type Props = { params: { id: string } };

export default function ConsultationPage({ params }: Props) {
  const { t, language } = useLanguage();
  const sync = useSync();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState("");
  const [lobby, setLobby] = useState<LobbyState>({ phase: "idle", media: "none" });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const tt = useCallback(
    (key: Parameters<typeof t3>[1], vars?: Record<string, string | number>) => t3(language, key, vars),
    [language]
  );

  // ── Load server messages (participants only; 403/404 stays truthful) ────
  useEffect(() => {
    let alive = true;
    fetch(`/api/appointments/${params.id}/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { messages?: Msg[] } | null) => {
        if (!alive) return;
        setMessages((data?.messages ?? []).map((m) => ({ ...m, localState: "delivered" as const })));
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [params.id]);

  // ── Merge locally queued messages for truthful offline display ──────────
  const queuedMessages = useMemo(() => {
    return sync.items
      .filter((i) => {
        if (i.actionType !== "appointment.message") return false;
        return (i.payload as { appointmentId?: string }).appointmentId === params.id;
      })
      .map((i) => ({
        id: i.id,
        body: (i.payload as { body: string }).body,
        sender_role: "patient",
        client_created_at: (i.payload as { clientCreatedAt: string }).clientCreatedAt,
        delivered_at: null,
        localState:
          i.state === "synced"
            ? ("delivered" as const)
            : i.state === "failed" || i.state === "requires_attention"
              ? ("failed" as const)
              : i.state === "syncing"
                ? ("sending" as const)
                : ("saved_locally" as const),
      }));
  }, [sync.items, params.id]);

  const allMessages = useMemo(
    () => [...messages, ...queuedMessages].sort((a, b) => a.client_created_at.localeCompare(b.client_created_at)),
    [messages, queuedMessages]
  );

  // ── Send: enqueue immediately (works offline), engine syncs when online ──
  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || body.length > 2000) return;
    setDraft("");
    try {
      await sync.enqueueAppointmentMessage({ appointmentId: params.id, body });
    } catch {
      /* queue failure: nothing was lost — draft stays in memory */
      setDraft(body);
    }
  }, [draft, params.id, sync]);

  // ── Connection hints: advisory only, never proof of quality ────────────
  const [slowHint, setSlowHint] = useState(false);
  useEffect(() => {
    const conn = (navigator as unknown as {
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
        addEventListener?: (t: string, cb: () => void) => void;
        removeEventListener?: (t: string, cb: () => void) => void;
      };
    }).connection;
    if (!conn) return;
    const read = () => {
      const t = conn.effectiveType ?? "";
      setSlowHint(conn.saveData === true || t === "2g" || t === "slow-2g" || t === "3g");
    };
    read();
    conn.addEventListener?.("change", read);
    return () => conn.removeEventListener?.("change", read);
  }, []);

  // ── Lobby: permission only on Join; audio first ─────────────────────────
  const joinAudio = useCallback(async () => {
    setLobby({ phase: "connecting", media: "audio" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      // Realtime signalling is not configured in this deployment — be honest:
      // setup cannot complete, so report failure and stop local tracks.
      setTimeout(() => {
        stream?.getTracks?.().forEach((tr) => tr.stop());
        setLocalStream(null);
        setLobby({ phase: "failed", media: "none" });
      }, 1200);
    } catch {
      setDenied(true);
      setLobby({ phase: "idle", media: "none" });
    }
  }, []);

  const joinVideo = useCallback(async () => {
    setLobby({ phase: "connecting", media: "video" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setTimeout(() => {
        stream?.getTracks?.().forEach((tr) => tr.stop());
        setLocalStream(null);
        setLobby({ phase: "failed", media: "none" });
      }, 1200);
    } catch {
      setDenied(true);
      setLobby({ phase: "idle", media: "none" });
    }
  }, []);

  const leave = useCallback(() => {
    localStream?.getTracks().forEach((tr) => tr.stop());
    setLocalStream(null);
    setLobby({ phase: "idle", media: "none" });
  }, [localStream]);

  // ── In-call controls: mute / camera / end / switch to text ──────────────
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const toggleMic = useCallback(() => {
    const track = localStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = micMuted; // toggle back on when currently muted
    setMicMuted(!micMuted);
  }, [localStream, micMuted]);

  const toggleCamera = useCallback(() => {
    const track = localStream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = cameraOff;
    setCameraOff(!cameraOff);
  }, [localStream, cameraOff]);

  // Stop tracks on unmount; capture the stream ref value, not the variable,
  // so the cleanup can never dereference a stale/undefined binding.
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    streamRef.current = localStream;
  }, [localStream]);
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <PageTransition>
      <main className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-24 pt-6 sm:px-6">
        <Link
          href="/care-requests"
          className="inline-flex min-h-[44px] items-center text-sm text-text-secondary hover:text-text-primary"
        >
          ← {tt("statusHeading")}
        </Link>

        <h1 className="mt-2 text-2xl font-semibold text-text-primary">{tt("messagesHeading")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{tt("noSeenClaims")}</p>
        <p className="mt-1 text-sm text-text-secondary">{tt("bandwidthHint")}</p>

        {/* ── Lobby ─────────────────────────────────────────────────────── */}
        <Card padding="sm" className="mt-4">
          <p className="font-medium text-text-primary">{tt("lobbyHeading")}</p>
          {slowHint && (
            <p role="status" className="mt-2 rounded-card bg-[#FBF3E8] p-3 text-sm text-[#7A5A2E]">
              {tt("bandwidthHint")} {tt("realtimeUnavailable")}
            </p>
          )}
          <div aria-live="polite" className="mt-1 text-sm text-text-secondary">
            {lobby.phase === "idle" && tt("bandwidthHint")}
            {lobby.phase === "connecting" && tt("connecting")}
            {lobby.phase === "reconnecting" && tt("reconnecting")}
            {lobby.phase === "failed" && tt("connectionFailed")}
          </div>
          {lobby.phase === "idle" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void joinAudio()}>
                {tt("tryAudioOnly")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void joinVideo()}>
                {tt("modeVideo")}
              </Button>
            </div>
          )}
          {(lobby.phase === "connecting" || localStream) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {localStream && (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-28 w-40 rounded-card bg-black"
                />
              )}
              {localStream && (
                <Button size="sm" variant="secondary" onClick={toggleMic} aria-pressed={micMuted}>
                  {micMuted ? tt("unmute") : tt("mute")}
                </Button>
              )}
              {localStream && lobby.media === "video" && (
                <Button size="sm" variant="secondary" onClick={toggleCamera} aria-pressed={cameraOff}>
                  {cameraOff ? tt("cameraOn") : tt("cameraOff")}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={leave}>
                {tt("endConsultation")}
              </Button>
              <Button size="sm" variant="ghost" onClick={leave}>
                {tt("continueByText")}
              </Button>
            </div>
          )}
          {denied && (
            <p role="alert" className="mt-2 text-sm text-[#8A4B32]">
              {tt("permissionDenied")}
            </p>
          )}
          {lobby.phase === "failed" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={leave}>
                {tt("continueByText")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void joinAudio()}>
                {tt("tryAudioOnly")}
              </Button>
            </div>
          )}
          <p className="mt-3 rounded-card bg-canvas p-3 text-sm text-text-secondary">
            {tt("realtimeUnavailable")}
          </p>
        </Card>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <section aria-labelledby="msg-h" className="mt-6">
          <h2 id="msg-h" className="sr-only">
            {tt("messagesHeading")}
          </h2>
          {!loaded && <p className="text-sm text-text-secondary">…</p>}
          {loaded && allMessages.length === 0 && (
            <p className="text-sm text-text-secondary">{tt("messagesEmpty")}</p>
          )}
          <ul className="space-y-2">
            {allMessages.map((m) => (
              <li
                key={m.id}
                className={`rounded-card p-3 ${
                  m.sender_role === "patient" ? "bg-primary/5" : "bg-canvas"
                }`}
              >
                <p className="text-text-primary">{m.body}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  {m.localState === "delivered" && tt("messageDelivered")}
                  {m.localState === "sending" && tt("messageSending")}
                  {m.localState === "saved_locally" && tt("messageSavedLocally")}
                  {m.localState === "failed" && tt("messageFailed")}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-2">
            <label htmlFor="msg-input" className="sr-only">
              {tt("messagePlaceholder")}
            </label>
            <textarea
              id="msg-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
              rows={2}
              placeholder={tt("messagePlaceholder")}
              className="flex-1 rounded-card border border-border bg-surface p-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <Button onClick={() => void send()} disabled={draft.trim().length === 0}>
              {tt("messageSend")}
            </Button>
          </div>
        </section>
      </main>
    </PageTransition>
  );
}
