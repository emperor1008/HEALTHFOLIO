"use client";

/**
 * Live consultation room (Phase 1).
 *
 * MEDIA (real WebRTC):
 * - Permission is requested ONLY when the user presses Join.
 * - Every connection state comes from the consultation state machine fed by
 *   real signalling/peer events — never a timer, never a fake success.
 * - Network-aware degradation (video → lower quality → audio → text) is
 *   driven by the adaptation loop; reconnection is bounded.
 *
 * TEXT (store-and-forward, always available):
 * - Messages compose offline and ride the Part 1 queue (appointment.message).
 * - Delivery states are truthful: saved locally / sending / delivered /
 *   failed — "delivered" only after the server acknowledges. No "seen".
 *
 * HONEST DEGRADATION:
 * - When Supabase Realtime is not configured, live media is reported as
 *   unavailable and secure text remains the dependable path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import { t3 } from "@/lib/i18n/part3";
import { useSync } from "@/lib/offline/sync-provider";
import { PageTransition } from "@/components/ui/PageTransition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConsultation } from "@/lib/consultation/use-consultation";
import { statusMessageKey } from "@/lib/consultation/state-machine";
import type { ConsultationErrorCode } from "@/lib/consultation/state-machine";
import type { ConnectionMode, NetworkQuality } from "@/lib/consultation/types";

type DeliveryState = "saved_locally" | "sending" | "delivered" | "failed";

interface Msg {
  id: string;
  body: string;
  sender_role: string;
  client_created_at: string;
  delivered_at: string | null;
  localState?: DeliveryState;
}

const ERROR_MESSAGE_KEYS: Record<ConsultationErrorCode, Parameters<typeof t3>[1]> = {
  permission_denied: "errPermissionDenied",
  camera_unavailable: "errCameraUnavailable",
  microphone_unavailable: "errMicUnavailable",
  unsupported_browser: "errUnsupportedBrowser",
  signalling_unavailable: "errSignallingUnavailable",
  room_not_available: "errRoomNotAvailable",
  unauthorized: "errNotAuthorized",
  peer_connection_failed: "errLoadFailed",
  unknown: "consultError",
};

export default function ConsultationPage() {
  const params = useParams<{ id: string }>();
  const appointmentId = params?.id ?? "";
  const { t, language } = useLanguage();
  const sync = useSync();
  const consult = useConsultation(appointmentId);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const tt = useCallback(
    (key: Parameters<typeof t3>[1], vars?: Record<string, string | number>) => t3(language, key, vars),
    [language]
  );

  // ── Load server messages (participants only; 403/404 stays truthful) ────
  useEffect(() => {
    if (!appointmentId) return;
    let alive = true;
    fetch(`/api/appointments/${appointmentId}/messages`)
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
  }, [appointmentId]);

  // ── Merge locally queued messages for truthful offline display ──────────
  const queuedMessages = useMemo(() => {
    return sync.items
      .filter((i) => {
        if (i.actionType !== "appointment.message") return false;
        return (i.payload as { appointmentId?: string }).appointmentId === appointmentId;
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
  }, [sync.items, appointmentId]);

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
      await sync.enqueueAppointmentMessage({ appointmentId, body });
    } catch {
      /* queue failure: nothing was lost — draft stays in memory */
      setDraft(body);
    }
  }, [draft, appointmentId, sync]);

  // ── Media elements: assign streams in effects (never during render) ─────
  const { localStream, remoteStream } = consult;
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const session = consult.session;
  const status = consult.state.status;
  const role = session?.role ?? "patient";

  const statusMessage = useMemo(() => {
    if (status === "waiting_for_peer" && role === "clinician") {
      return tt("consultWaitingForPatient");
    }
    return tt(statusMessageKey(status));
  }, [status, role, tt]);

  const qualityLabel = useCallback(
    (q: NetworkQuality) =>
      q === "offline" ? tt("qualityOffline") : q === "poor" ? tt("qualityPoor") : q === "degraded" ? tt("qualityFair") : tt("qualityGood"),
    [tt]
  );
  const qualityIcon = (q: NetworkQuality) =>
    q === "offline" ? "⛔" : q === "poor" ? "🔴" : q === "degraded" ? "🟡" : "🟢";

  const modeLabel = (mode: ConnectionMode) =>
    mode === "video" ? tt("modeVideo") : mode === "audio" ? tt("modeAudio") : tt("modeText");

  const [showDetails, setShowDetails] = useState(false);

  // ── Load / access states (honest, no fake lobby) ────────────────────────
  if (consult.sessionLoad === "loading") {
    return (
      <PageTransition>
        <main className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-24 pt-6 sm:px-6">
          <p role="status" className="text-text-secondary">
            {tt("connecting")}
          </p>
        </main>
      </PageTransition>
    );
  }

  if (consult.sessionLoad === "unauthorized") {
    return (
      <PageTransition>
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-24 pt-6 sm:px-6">
          <h1 className="text-2xl font-semibold text-text-primary">{tt("lobbyHeading")}</h1>
          <p role="alert" className="rounded-card bg-canvas p-4 text-text-primary">
            {tt("errNotAuthorized")}
          </p>
          <Link
            href="/care-requests"
            className="inline-flex min-h-[44px] items-center text-sm text-primary hover:underline"
          >
            ← {tt("statusHeading")}
          </Link>
        </main>
      </PageTransition>
    );
  }

  if (consult.sessionLoad === "not_found" || consult.sessionLoad === "error") {
    return (
      <PageTransition>
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-24 pt-6 sm:px-6">
          <h1 className="text-2xl font-semibold text-text-primary">{tt("lobbyHeading")}</h1>
          <p role="alert" className="rounded-card bg-canvas p-4 text-text-primary">
            {tt("errLoadFailed")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={consult.reloadSession}>{tt("actionTryAgain")}</Button>
            <Link
              href="/care-requests"
              className="inline-flex min-h-[44px] items-center text-sm text-text-secondary hover:text-text-primary"
            >
              ← {tt("statusHeading")}
            </Link>
          </div>
        </main>
      </PageTransition>
    );
  }

  const joinable = Boolean(session?.roomChannel);
  const liveReady = consult.liveCallAvailable && joinable;
  const inLiveState =
    status === "joining" ||
    status === "waiting_for_peer" ||
    status === "connecting" ||
    status === "connected_video" ||
    status === "degraded_video" ||
    status === "connected_audio" ||
    status === "reconnecting";

  return (
    <PageTransition>
      <main className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-24 pt-6 sm:px-6">
        <Link
          href="/care-requests"
          className="inline-flex min-h-[44px] items-center text-sm text-text-secondary hover:text-text-primary"
        >
          ← {tt("statusHeading")}
        </Link>

        <h1 className="mt-2 text-2xl font-semibold text-text-primary">{tt("lobbyHeading")}</h1>
        {session?.reason && <p className="mt-1 text-sm text-text-secondary">{session.reason}</p>}
        <p className="mt-1 text-sm text-text-secondary">{tt("bandwidthHint")}</p>

        {/* ── Status card ──────────────────────────────────────────────── */}
        <Card padding="sm" className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              aria-live="polite"
              className="font-medium text-text-primary"
              data-testid="consult-status"
            >
              {statusMessage}
            </p>
            <p className="text-sm text-text-secondary">
              <span aria-hidden="true">{qualityIcon(consult.profile.quality)}</span>{" "}
              {tt("connectionQuality", { quality: qualityLabel(consult.profile.quality) })}
            </p>
          </div>

          {/* Peer presence — plain text, never color-only */}
          {(inLiveState || status === "store_and_forward") && (
            <p className="mt-1 text-sm text-text-secondary" data-testid="peer-status">
              <span aria-hidden="true">{consult.peerPresent ? "✅" : "⏳"}</span>{" "}
              {consult.peerPresent ? tt("peerJoined") : tt("peerDisconnected")}
            </p>
          )}

          {/* Not-yet-joinable session (appointment not confirmed) */}
          {!joinable && <p className="mt-2 text-sm text-text-secondary">{tt("sessionNotReady")}</p>}

          {/* Realtime not configured in this deployment — honest note */}
          {!consult.liveCallAvailable && joinable && (
            <p className="mt-2 rounded-card bg-canvas p-3 text-sm text-text-secondary">
              {tt("realtimeUnavailable")}
            </p>
          )}

          {/* Incoming clinician mode suggestion */}
          {consult.recommendation && (
            <div
              role="status"
              className="mt-3 rounded-card border border-border bg-surface p-3"
              data-testid="recommendation"
            >
              <p className="text-sm text-text-primary">
                {tt("recommendBanner", { mode: modeLabel(consult.recommendation.mode) })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void consult.acceptRecommendation()}>
                  {tt("acceptSuggestion")}
                </Button>
                <Button size="sm" variant="secondary" onClick={consult.dismissRecommendation}>
                  {tt("dismissSuggestion")}
                </Button>
              </div>
            </div>
          )}

          {/* ── Join lobby (permission only on Join) ───────────────────── */}
          {status === "idle" && liveReady && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void consult.join("video")}>{tt("btnJoinVideo")}</Button>
              <Button variant="secondary" onClick={() => void consult.join("audio")}>
                {tt("btnJoinAudio")}
              </Button>
            </div>
          )}
          {status === "idle" && !liveReady && (
            <p className="mt-3 text-sm text-text-secondary" data-testid="text-fallback-hint">
              {tt("bandwidthHint")}
            </p>
          )}

          {/* ── Waiting / connecting ───────────────────────────────────── */}
          {(status === "joining" || status === "waiting_for_peer" || status === "connecting") && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => consult.end()}>
                {tt("endConsultation")}
              </Button>
            </div>
          )}

          {/* ── Live media ─────────────────────────────────────────────── */}
          {inLiveState && (status === "connected_video" || status === "degraded_video" || status === "connected_audio") && (
            <div className="mt-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="relative">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    data-testid="remote-video"
                    className="h-40 w-56 rounded-card bg-black"
                  />
                  {!remoteStream && (
                    <p className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-center text-xs text-white">
                      {consult.peerPresent ? tt("consultConnectingPeer") : tt("peerDisconnected")}
                    </p>
                  )}
                </div>
                {localStream && status !== "connected_audio" && (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    data-testid="local-video"
                    className="h-24 w-32 rounded-card bg-black"
                  />
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={consult.toggleMic}
                  aria-pressed={consult.micMuted}
                >
                  {consult.micMuted ? tt("unmute") : tt("mute")}
                </Button>
                {localStream && status !== "connected_audio" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={consult.toggleCamera}
                    aria-pressed={consult.cameraOff}
                  >
                    {consult.cameraOff ? tt("cameraOn") : tt("cameraOff")}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => void consult.switchMode("text")}>
                  {tt("continueByText")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => consult.end()}>
                  {tt("endConsultation")}
                </Button>
              </div>

              {status === "connected_audio" && consult.audioFallbackCount > 0 && (
                <p role="status" className="mt-2 rounded-card bg-canvas p-3 text-sm text-text-secondary">
                  {tt("networkAudioOnly")}
                </p>
              )}
            </div>
          )}

          {/* ── Manual mode switch ─────────────────────────────────────── */}
          {inLiveState && (
            <div className="mt-4">
              <p className="text-sm font-medium text-text-primary">{tt("switchModeHeading")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {status !== "connected_video" && status !== "degraded_video" && (
                  <Button size="sm" variant="secondary" onClick={() => void consult.switchMode("video")}>
                    {tt("modeVideo")}
                  </Button>
                )}
                {status !== "connected_audio" && (
                  <Button size="sm" variant="secondary" onClick={() => void consult.switchMode("audio")}>
                    {tt("modeAudio")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void consult.switchMode("text")}>
                  {tt("modeText")}
                </Button>
              </div>
            </div>
          )}

          {/* ── Reconnecting (bounded, automatic) ──────────────────────── */}
          {status === "reconnecting" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void consult.switchMode("text")}>
                {tt("continueByText")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => consult.end()}>
                {tt("endConsultation")}
              </Button>
            </div>
          )}

          {/* ── Store-and-forward (network exhausted / offline) ────────── */}
          {status === "store_and_forward" && (
            <div className="mt-3 rounded-card bg-canvas p-4" data-testid="store-forward">
              <p className="font-medium text-text-primary">              {tt("storeForwardTitle")}</p>
              <p className="mt-1 text-sm text-text-secondary">{tt("storeForwardBody")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void consult.retry()}>
                  {tt("rejoinLive")}
                </Button>
              </div>
            </div>
          )}

          {/* ── Ended ──────────────────────────────────────────────────── */}
          {status === "ended" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void consult.retry()}>
                {tt("rejoinLive")}
              </Button>
            </div>
          )}

          {/* ── Error with recovery (never a dead end) ─────────────────── */}
          {status === "error" && consult.state.error && (
            <div className="mt-3 rounded-card border border-border bg-surface p-4" role="alert">
              <p className="text-text-primary">{tt(ERROR_MESSAGE_KEYS[consult.state.error])}</p>
              {consult.mediaError && (
                <p className="mt-1 text-sm text-text-secondary">
                  {consult.mediaError.media === "audio" ? tt("errMicUnavailable") : tt("errCameraUnavailable")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void consult.retry()}>
                  {tt("actionTryAgain")}
                </Button>
                {(consult.state.error === "camera_unavailable" ||
                  consult.state.error === "microphone_unavailable" ||
                  consult.state.error === "permission_denied") && (
                  <Button size="sm" variant="secondary" onClick={() => void consult.retry("audio")}>
                    {tt("actionContinueAudio")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={consult.dismissMediaError}>
                  {tt("continueByText")}
                </Button>
              </div>
            </div>
          )}

          {/* ── Clinician status line ──────────────────────────────────── */}
          {role === "clinician" && inLiveState && (
            <div className="mt-4 rounded-card bg-canvas p-3 text-sm text-text-secondary" data-testid="clinician-status">
              <p>
                <span aria-hidden="true">{qualityIcon(consult.profile.quality)}</span>{" "}
                {tt("clinicianPatientConnection", { quality: qualityLabel(consult.profile.quality) })}
              </p>
              <p>{tt("clinicianModeStatus", { mode: modeLabel(consult.state.mode) })}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => consult.recommendMode("audio")}>
                  {tt("sendSuggestionAudio")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => consult.recommendMode("video")}>
                  {tt("sendSuggestionVideo")}
                </Button>
              </div>
            </div>
          )}

          {/* ── Technical details (disclosure, safe diagnostics only) ──── */}
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="min-h-[44px] text-sm text-text-secondary underline hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {tt("technicalDetails")}
            </button>
            {showDetails && (
              <dl className="mt-2 space-y-1 text-xs text-text-secondary" data-testid="technical-details">
                <div>
                  <dt className="inline font-medium">status:</dt>{" "}
                  <dd className="inline" data-testid="detail-status">
                    {status}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">mode:</dt>{" "}
                  <dd className="inline">{consult.state.mode}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">video:</dt>{" "}
                  <dd className="inline">{consult.videoLevel}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">transport:</dt>{" "}
                  <dd className="inline">{consult.transportState}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">quality:</dt>{" "}
                  <dd className="inline">{consult.profile.quality}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">retries:</dt>{" "}
                  <dd className="inline">
                    {consult.state.retryAttempt} / degradation {consult.degradationCount} / audio
                    fallback {consult.audioFallbackCount} / reconnect {consult.reconnectionCount}
                  </dd>
                </div>
                <ul className="mt-1 space-y-0.5" aria-label={tt("technicalDetails")}>
                  {consult.diagnostics.slice(-8).map((d, idx) => (
                    <li key={`${d.at}-${idx}`}>
                      {new Date(d.at).toISOString().slice(11, 19)} {d.event}
                    </li>
                  ))}
                </ul>
              </dl>
            )}
          </div>
        </Card>

        {/* ── Messages (store-and-forward text) ──────────────────────────── */}
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
                className={`rounded-card p-3 ${m.sender_role === "patient" ? "bg-primary/5" : "bg-canvas"}`}
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
          <p className="mt-2 text-xs text-text-secondary">{tt("noSeenClaims")}</p>
        </section>
      </main>
    </PageTransition>
  );
}
