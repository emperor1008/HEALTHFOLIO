"use client";

/**
 * VoiceAssistant — the voice assistant panel (spec §65, §126, §127).
 *
 * The seven layers stay separate:
 *   1. speech recognition   — VoiceInput + lib/voice/speech.ts
 *   2. language understanding — lib/voice/understanding.ts
 *   3. intent routing       — lib/voice/router.ts
 *   4. safety validation    — deterministic triage engine (the ONLY
 *                             medical authority) inside the controller
 *   5. application action   — THIS adapter → existing app routes/APIs
 *   6. response generation  — lib/voice/responses.ts builders
 *   7. speech synthesis     — lib/voice/speech.ts (explicit tap only)
 *
 * Hard rules kept here:
 *  - Everything works without a microphone (buttons + typed input).
 *  - TTS only after an explicit tap (never auto-play).
 *  - Speech results are always shown for confirmation before acting.
 *  - Authorization comes from the real session, never asserted here.
 *  - Session context is in-memory only; nothing is logged or stored.
 *  - The AI never diagnoses, prescribes, or triages — only the
 *    deterministic engine decides medical urgency.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useSync } from "@/lib/offline/sync-provider";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Language } from "@/lib/i18n";
import { tVoice, type VoiceDict } from "@/lib/i18n/voice";
import { getPart4Dict } from "@/lib/i18n/part4";
import {
  isSpeechRecognitionSupported,
  speakText,
  stopSpeaking,
} from "@/lib/voice/speech";
import {
  VoiceConversationController,
  type VoiceAssistantState,
  type VoiceControllerAdapter,
  type VoiceTaskContext,
} from "@/lib/voice/conversation";
import { classifyFreshness } from "@/lib/pharmacy/freshness";
import type { VoiceActionPlan, VoiceSessionContext } from "@/lib/voice/router";
import type { VoiceCommand } from "@/lib/voice/intents";
import type { VoiceResponse } from "@/lib/voice/responses";
import {
  doctorNone,
  doctorStatus,
  healthCardEmpty,
  healthCardStale,
  healthCardUpdated,
  medicineFound,
  medicineNone,
  medicineStale,
  networkWeak,
} from "@/lib/voice/responses";
import { VoiceInput, type VoiceInputHandle } from "./VoiceInput";
import { VoiceListen } from "./VoiceListen";
import { recordVoiceMetric } from "@/lib/voice/telemetry";

interface CareRequestSummary {
  id: string;
  status: string;
}

interface HealthCardPayload {
  schemaVersion: number;
  version: string;
  updatedAt: string;
  profile?: { displayName?: string | null; preferredLanguage?: string };
  allergies: string[];
  conditions: string[];
  medications: string[];
  recentCare?: unknown[];
}

interface PharmacyStockResult {
  pharmacyId: string;
  pharmacyName: string;
  displayStatus:
    | "available"
    | "low_stock"
    | "unavailable"
    | "not_stocked"
    | "not_recently_confirmed"
    | "no_update";
  lastConfirmedAt: string | null;
  freshness?: string;
}

const STATE_LABELS: Record<VoiceAssistantState, keyof VoiceDict> = {
  idle: "voiceStateIdle",
  listening: "listening",
  processing: "understanding",
  confirmation_required: "confirm",
  speaking: "speaking",
  waiting_for_response: "waiting",
  executing_action: "voiceStateExecuting",
  clarification: "voiceStateClarify",
  error: "voiceStateError",
  fallback: "voiceStateFallback",
  ending: "voiceStateEnding",
};

/** One-tap commands — no microphone required (spec §126). */
const QUICK_COMMANDS: Array<{ labelKey: keyof VoiceDict; text: string }> = [
  { labelKey: "quickSymptoms", text: "check my symptoms" },
  { labelKey: "quickDoctor", text: "I need a doctor" },
  { labelKey: "quickMedicine", text: "check paracetamol" },
  { labelKey: "quickHealthCard", text: "show my health card" },
];

const TIME_LOCALES: Record<Language, string> = {
  en: "en-IN",
  hi: "hi-IN",
  or: "or-IN",
};

function formatTimeAgo(iso: string | null | undefined, language: Language): string {
  if (!iso) return "";
  try {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffMs = Date.now() - then;
    const mins = Math.max(0, Math.round(diffMs / 60000));
    if (mins < 1) {
      return tVoice(language, "voiceTimeJustNow");
    }
    if (mins < 60) {
      return tVoice(language, "voiceTimeMinutes", { count: String(mins) });
    }
    const hours = Math.round(mins / 60);
    if (hours < 24) {
      return tVoice(language, "voiceTimeHours", { count: String(hours) });
    }
    const days = Math.round(hours / 24);
    return tVoice(language, "voiceTimeDays", { count: String(days) });
  } catch {
    return iso;
  }
}

function formatFullTime(iso: string, language: Language): string {
  try {
    return new Intl.DateTimeFormat(TIME_LOCALES[language], {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function careStatusLabel(status: string, language: Language): string {
  const key =
    status === "draft"
      ? "voiceCareStatusDraft"
      : status === "submitted"
        ? "voiceCareStatusSubmitted"
        : status === "processing"
          ? "voiceCareStatusProcessing"
          : status === "completed"
            ? "voiceCareStatusCompleted"
            : null;
  return key ? tVoice(language, key) : status;
}

function jsonFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  return fetch(path, init)
    .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
    .catch(() => null);
}

export function VoiceAssistant() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, language, setLanguage } = useLanguage();
  const { online } = useSync();
  const { data: sessionData, isPending: sessionPending } = useSession();

  const [assistantState, setAssistantState] = useState<VoiceAssistantState>("idle");
  const [taskContext, setTaskContext] = useState<VoiceTaskContext | null>(null);
  const [response, setResponse] = useState<VoiceResponse | null>(null);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [asrSupported] = useState(() => isSpeechRecognitionSupported());

  const controllerRef = useRef<VoiceConversationController | null>(null);
  const inputRef = useRef<VoiceInputHandle>(null);
  const voiceOutputRef = useRef(false);
  const onlineRef = useRef(online);
  const languageRef = useRef(language);
  const pathnameRef = useRef(pathname);
  const activeConsultationRef = useRef<string | null>(null);

  // Latest-value refs, synced after every render commit. Event
  // handlers and controller callbacks read these between commits,
  // never during render (spec §127: no render-time side effects).
  useEffect(() => {
    voiceOutputRef.current = voiceOutput;
    onlineRef.current = online;
    languageRef.current = language;
    pathnameRef.current = pathname;
  });
  const lastCareRequestIdRef = useRef<string | null>(null);
  /** True once the user has engaged the assistant this
   *  mount — the session metric counts real sessions only. */
  const engagedRef = useRef(false);

  /**
   * The REAL session identity. Roles are derived from the server-issued
   * session — never asserted by voice (spec §35, §77).
   */
  const role: VoiceSessionContext["role"] = useMemo(() => {
    const roles = (sessionData?.user as
      | { activeRoles?: string[] }
      | undefined)?.activeRoles;
    if (!roles || roles.length === 0) return null;
    if (roles.includes("patient")) return "patient";
    if (roles.some((r) => r.startsWith("doctor"))) return "clinician";
    if (roles.some((r) => r.startsWith("pharmacy"))) return "pharmacy";
    if (roles.includes("facility_admin")) return "coordinator";
    if (roles.includes("platform_admin")) return "admin";
    return null;
  }, [sessionData]);

  const isAuthenticated = !!sessionData && !sessionPending;

  const sessionContext = useCallback((): VoiceSessionContext => {
    return {
      role,
      isAuthenticated,
      isOnline: onlineRef.current,
      currentPath: pathnameRef.current,
      activeConsultationId: activeConsultationRef.current,
      activeCareRequestId: lastCareRequestIdRef.current,
    };
  }, [role, isAuthenticated]);

  /** Count one voice session on first real engagement
   *  (spec §116) — mounting the panel alone is not a
   *  voice session. */
  const markEngaged = useCallback(() => {
    if (!engagedRef.current) {
      engagedRef.current = true;
      recordVoiceMetric("voice_session_started", {});
    }
  }, []);

  // Track the open consultation from the route (spec §39).
  useEffect(() => {
    const match = /^\/consultations\/([^/]+)/.exec(pathname);
    activeConsultationRef.current = match
      ? decodeURIComponent(match[1])
      : null;
  }, [pathname]);

  // ── Layer 5a: data fetches through EXISTING routes ──

  const fetchHealthCard = useCallback(async (): Promise<VoiceResponse | null> => {
    const lang = languageRef.current;
    const payload = await jsonFetch<{ data?: { card?: HealthCardPayload } }>(
      "/api/health-card"
    );
    const card = payload?.data?.card;
    if (!card) return null;
    const hasFacts =
      card.allergies.length > 0 ||
      card.conditions.length > 0 ||
      card.medications.length > 0;
    if (!hasFacts && !card.profile?.displayName) {
      return healthCardEmpty(lang);
    }
    const time = formatFullTime(card.updatedAt, lang);
    const freshness = classifyFreshness(card.updatedAt);
    if (freshness === "stale" || freshness === "expired") {
      return healthCardStale(lang, time);
    }
    return healthCardUpdated(lang, time);
  }, []);

  const stockStatusLabel = useCallback(
    (status: PharmacyStockResult["displayStatus"]): string => {
      const labels = getPart4Dict(languageRef.current);
      switch (status) {
        case "available":
          return labels.reportedAvailable;
        case "low_stock":
          return labels.limitedStock;
        case "unavailable":
          return labels.reportedUnavailable;
        case "not_stocked":
          return labels.notStocked;
        case "not_recently_confirmed":
          return labels.notRecentlyConfirmed;
        default:
          return labels.noUpdateAvailable;
      }
    },
    []
  );

  const fetchMedicine = useCallback(
    async (medicineName: string): Promise<VoiceResponse | null> => {
      const lang = languageRef.current;
      const search = await jsonFetch<{
        data?: { results?: Array<{ medicineId: string; displayName: string }> };
      }>(`/api/medicines/search?q=${encodeURIComponent(medicineName)}`);
      const results = search?.data?.results ?? [];
      if (results.length === 0) return medicineNone(lang, medicineName);
      const top = results[0];
      const lookup = await jsonFetch<{ results?: PharmacyStockResult[] }>(
        `/api/pharmacy/stock/patient-lookup?medicineId=${encodeURIComponent(top.medicineId)}`
      );
      const stocks = lookup?.results ?? [];
      if (stocks.length === 0) return medicineNone(lang, top.displayName);
      const best = stocks.find((s) => s.displayStatus === "available") ?? stocks[0];
      const confirmedAgo = formatTimeAgo(best.lastConfirmedAt, lang);
      const freshness = best.lastConfirmedAt
        ? classifyFreshness(best.lastConfirmedAt)
        : "expired";
      if (freshness === "stale" || freshness === "expired") {
        return medicineStale(lang, confirmedAgo);
      }
      return medicineFound(
        lang,
        best.pharmacyName,
        top.displayName,
        stockStatusLabel(best.displayStatus),
        confirmedAgo
      );
    },
    [stockStatusLabel]
  );

  const fetchDoctorStatus = useCallback(async (): Promise<VoiceResponse | null> => {
    const lang = languageRef.current;
    const data = await jsonFetch<{ careRequests?: CareRequestSummary[] }>(
      "/api/care-requests"
    );
    const requests = data?.careRequests ?? [];
    if (requests.length === 0) return doctorNone(lang);
    const last = requests[requests.length - 1];
    if (last.id) lastCareRequestIdRef.current = last.id;
    return doctorStatus(lang, requests.length, careStatusLabel(last.status, lang));
  }, []);

  const fetchPlanResponse = useCallback(
    async (
      plan: Extract<
        VoiceActionPlan,
        { kind: "readHealthCard" | "medicineLookup" | "doctorAvailability" }
      >
    ): Promise<VoiceResponse | null> => {
      if (!onlineRef.current) return networkWeak(languageRef.current);
      switch (plan.kind) {
        case "readHealthCard":
          return fetchHealthCard();
        case "medicineLookup":
          return fetchMedicine(plan.medicineName);
        case "doctorAvailability":
          return fetchDoctorStatus();
      }
    },
    [fetchHealthCard, fetchMedicine, fetchDoctorStatus]
  );

  // ── Layer 5b: confirmed mutations through EXISTING routes (§74) ──

  const postCareRequest = useCallback(
    async (
      language: Language,
      reason: string
    ): Promise<VoiceResponse | null> => {
      const res = await fetch("/api/care-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          language,
          reason,
          contact_method: "in_app",
          linked_document_ids: [],
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data?: { careRequest?: { id?: string } };
      };
      const id = json?.data?.careRequest?.id;
      if (id) lastCareRequestIdRef.current = id;
      const text = tVoice(language, "respDoctorRequested");
      return { text, speak: text };
    },
    []
  );

  const executeMutation = useCallback(
    async (
      plan: Extract<
        VoiceActionPlan,
        {
          kind:
            | "requestDoctor"
            | "shareWithDoctor"
            | "startConsultation"
            | "switchAudio"
            | "endConsultation"
        }
      >
    ): Promise<VoiceResponse | null> => {
      const lang = languageRef.current;
      try {
        switch (plan.kind) {
          case "requestDoctor": {
            if (!onlineRef.current) return null;
            return postCareRequest(
              plan.language,
              "Care request created with the voice assistant"
            );
          }
          case "shareWithDoctor": {
            // Confirmed data sharing: the patient's own card facts ride
            // the existing care-request route (no new endpoint, no
            // backdoor). Nothing is shared without the explicit yes.
            if (!onlineRef.current) return null;
            const card = await jsonFetch<{
              data?: { card?: HealthCardPayload };
            }>("/api/health-card");
            const c = card?.data?.card;
            const parts: string[] = [];
            if (c) {
              if (c.allergies.length > 0) {
                parts.push(`Allergies: ${c.allergies.join(", ")}.`);
              }
              if (c.medications.length > 0) {
                parts.push(`Medicines: ${c.medications.join(", ")}.`);
              }
            }
            const reason = `Share my health data with the doctor. ${parts.join(" ")}`.slice(
              0,
              1000
            );
            return postCareRequest(lang, reason);
          }
          case "startConsultation": {
            const id =
              activeConsultationRef.current ?? lastCareRequestIdRef.current;
            if (!id) return null;
            router.push(`/consultations/${encodeURIComponent(id)}`);
            const text = tVoice(lang, "respConsultationStarted");
            return { text, speak: text };
          }
          case "switchAudio": {
            const id = activeConsultationRef.current;
            if (!id) return null;
            router.push(
              `/consultations/${encodeURIComponent(id)}?mode=audio`
            );
            const text = tVoice(lang, "respConsultationAudio");
            return { text, speak: text };
          }
          case "endConsultation": {
            const id =
              activeConsultationRef.current ?? lastCareRequestIdRef.current;
            if (id) {
              router.push(`/consultations/${encodeURIComponent(id)}`);
            }
            const text = tVoice(lang, "respConsultationEnding");
            return { text, speak: text };
          }
        }
      } catch {
        return null;
      }
    },
    [router, postCareRequest]
  );

  // ── AI interpretation fallback (POST /api/voice/interpret) ──

  const aiInterpret = useCallback(
    async (transcript: string, lang: Language): Promise<VoiceCommand | null> => {
      const res = await fetch("/api/voice/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, language: lang }),
      });
      if (!res.ok) {
        recordVoiceMetric("ai_fallback", {});
        return null;
      }
      const json = (await res.json()) as { command?: VoiceCommand | null };
      if (json.command) {
        recordVoiceMetric("ai_interpretation_success", {});
      } else {
        recordVoiceMetric("ai_fallback", {});
      }
      return json.command ?? null;
    },
    []
  );

  // ── Layers 6/7: response presentation + synthesis ──

  /** Speak on explicit turns only; turn ownership returns to idle
   *  when playback ends (§17). TTS outcome is reported as a
   *  closed metric — no text is ever logged (§117). */
  const speak = useCallback((text: string, lang: Language): boolean => {
    const outcome: { started: boolean | null } = { started: null };
    const started = speakText(text, lang, () => {
      controllerRef.current?.notifySpeakingDone();
      if (outcome.started === true) {
        recordVoiceMetric("tts_success", { language: lang });
      }
    });
    outcome.started = started;
    if (!started) {
      recordVoiceMetric("tts_failure", {});
    }
    return started;
  }, []);

  const adapter = useMemo<VoiceControllerAdapter>(
    () => ({
      onStateChange: (state) => {
        setAssistantState(state);
        if (state === "clarification") {
          recordVoiceMetric("intent_clarification", {});
        }
      },
      onContextChange: setTaskContext,
      // The controller calls adapter.speak itself when the turn
      // should be spoken — presenting here must NOT speak again.
      onResponse: (resp) => {
        setResponse(resp);
      },
      onNavigate: (path) => {
        router.push(path);
        recordVoiceMetric("voice_action_completed", {
          action: "navigate",
        });
      },
      fetchPlanResponse: async (plan) => {
        const result = await fetchPlanResponse(plan);
        recordVoiceMetric(
          result ? "voice_action_completed" : "voice_action_failed",
          { action: plan.kind }
        );
        return result;
      },
      onConfirm: () => {
        /* The controller owns confirmation state internally; the
         * Yes/No buttons below call controller.confirmYes/No. */
      },
      aiInterpret,
      sessionContext,
      executeMutation: async (plan) => {
        const result = await executeMutation(plan);
        recordVoiceMetric(
          result ? "voice_action_completed" : "voice_action_failed",
          { action: plan.kind }
        );
        return result;
      },
      startListening: () => inputRef.current?.start() ?? false,
      stopListening: () => {
        inputRef.current?.stop();
      },
      speak,
      stopSpeaking: () => {
        stopSpeaking();
      },
      isOnline: () => onlineRef.current,
    }),
    [fetchPlanResponse, aiInterpret, sessionContext, executeMutation, router, speak]
  );

  // ── Controller lifecycle (spec §41, §86, §119) ──

  useEffect(() => {
    const controller = new VoiceConversationController(language, adapter, {
      sessionId: `voice-${Date.now()}`,
    });
    controllerRef.current = controller;
    controller.start();
    return () => {
      controller.destroy();
      controllerRef.current = null;
      if (engagedRef.current) {
        recordVoiceMetric("voice_session_completed", {});
        engagedRef.current = false;
      }
    };
    // The adapter is stable: every callback is useCallback-bound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // App language changed through the normal UI — sync silently (§8).
  useEffect(() => {
    controllerRef.current?.setLanguage(language);
  }, [language]);

  /** First explicit tap: enable spoken output, then a listening turn. */
  const beginVoiceTurn = useCallback((): boolean => {
    markEngaged();
    const controller = controllerRef.current;
    if (!controller) return false;
    if (!voiceOutputRef.current) {
      setVoiceOutput(true);
      controller.enableVoiceOutput();
    }
    return controller.beginListening();
  }, [markEngaged]);

  const handleTranscriptConfirmed = useCallback(
    (text: string) => {
      markEngaged();
      recordVoiceMetric("speech_recognition_success", {
        language,
      });
      controllerRef.current?.handleTranscript(text);
    },
    [markEngaged, language]
  );

  const handleTypedSubmit = useCallback(() => {
    const text = typedText.trim();
    if (!text) return;
    markEngaged();
    setTypedText("");
    controllerRef.current?.handleTranscript(text);
  }, [typedText, markEngaged]);

  const endSession = useCallback(() => {
    controllerRef.current?.endSession();
    if (engagedRef.current) {
      recordVoiceMetric("voice_session_completed", {});
      engagedRef.current = false;
    }
  }, []);

  const stopAll = useCallback(() => {
    controllerRef.current?.interrupt();
  }, []);

  const repeat = useCallback(() => {
    controllerRef.current?.repeat();
  }, []);

  /** Voice-initiated language change: announce it (§7, §8). */
  const changeLanguage = useCallback(
    (lang: Language) => {
      setLanguage(lang);
      controllerRef.current?.changeLanguage(lang);
    },
    [setLanguage]
  );

  const stateLabel = tVoice(language, STATE_LABELS[assistantState]);
  const activeQuestion = taskContext?.activeQuestion;
  const awaitingConfirmation =
    assistantState === "confirmation_required" || activeQuestion === "confirmation";
  const awaitingFollowUp = activeQuestion === "follow-up";

  return (
    <section
      aria-label={tVoice(language, "assistantTitle")}
      className="rounded-card border border-border bg-surface p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-text-primary">
          <span aria-hidden="true">🎤 </span>
          {tVoice(language, "assistantTitle")}
        </h2>
        <p role="status" aria-live="polite" className="text-sm text-text-secondary">
          {stateLabel}
        </p>
      </header>

      {!online && (
        <p
          role="status"
          className="mt-2 rounded-card border border-terracotta-border bg-terracotta-soft px-3 py-2 text-sm text-terracotta"
        >
          {tVoice(language, "offlineBanner")}
        </p>
      )}
      {!asrSupported && (
        <p role="status" className="mt-2 text-sm text-text-secondary">
          {tVoice(language, "voiceNoMic")}
        </p>
      )}

      {/* Last response — always visible text, never voice-only (§14) */}
      <div className="mt-3 min-h-[3.5rem] rounded-card border border-border bg-canvas p-3">
        {response ? (
          <p className="whitespace-pre-wrap text-base text-text-primary">
            {response.text}
          </p>
        ) : (
          <p className="text-base text-text-secondary">
            {tVoice(language, "assistantGreeting")}
          </p>
        )}
      </div>

      {/* Voice input — the mic button is wired through the controller
          via onStart so turn ownership (dead-air + session timeout)
          applies to every listening turn. */}
      <div className="mt-3">
        <VoiceInput
          ref={inputRef}
          language={language}
          onConfirm={handleTranscriptConfirmed}
          onRecognitionEnd={(partial) => {
            controllerRef.current?.handleRecognitionStopped(partial);
          }}
          onRecognitionError={() => {
            recordVoiceMetric("speech_recognition_failure", {});
            controllerRef.current?.handleRecognitionError();
          }}
          onStart={beginVoiceTurn}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {voiceOutput && (
          <button
            type="button"
            onClick={repeat}
            className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {tVoice(language, "voiceRepeat")}
          </button>
        )}
        <button
          type="button"
          onClick={stopAll}
          className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {tVoice(language, "stop")}
        </button>
        <button
          type="button"
          onClick={endSession}
          className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {tVoice(language, "voiceEndSession")}
        </button>
      </div>

      {/* Confirmation — mutations, data sharing, session end (§24, §25, §61).
          The prompt is the last response; the controller owns the pending
          plan and executes only on an explicit yes. */}
      {awaitingConfirmation && (
        <div className="mt-3 rounded-card border border-primary/40 bg-primary/5 p-3">
          <p className="text-base text-text-primary">
            {response?.text ?? tVoice(language, "voiceConfirmPrompt")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => controllerRef.current?.confirmYes()}
              className="flex min-h-[44px] items-center rounded-card bg-primary px-4 text-base font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {tVoice(language, "yes")}
            </button>
            <button
              type="button"
              onClick={() => controllerRef.current?.confirmNo()}
              className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {tVoice(language, "no")}
            </button>
          </div>
        </div>
      )}

      {/* Answer a pending symptom follow-up without a microphone (§105) */}
      {awaitingFollowUp && !awaitingConfirmation && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              controllerRef.current?.handleTranscript(tVoice(language, "yes"))
            }
            className="flex min-h-[44px] items-center rounded-card bg-primary px-4 text-base font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {tVoice(language, "yes")}
          </button>
          <button
            type="button"
            onClick={() =>
              controllerRef.current?.handleTranscript(tVoice(language, "no"))
            }
            className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {tVoice(language, "no")}
          </button>
        </div>
      )}

      {/* Typed input — voice optional, always available */}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleTypedSubmit();
        }}
      >
        <label htmlFor="voice-typed" className="sr-only">
          {tVoice(language, "voiceTypeHint")}
        </label>
        <input
          id="voice-typed"
          type="text"
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          placeholder={tVoice(language, "voiceTypeHint")}
          maxLength={500}
          className="min-h-[44px] w-full min-w-0 flex-1 rounded-card border border-border bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
        />
        <button
          type="submit"
          className="flex min-h-[44px] items-center rounded-card bg-primary px-4 text-base font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {tVoice(language, "voiceSend")}
        </button>
      </form>

      {/* Quick actions — one tap, no mic needed */}
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_COMMANDS.map((q) => (
          <button
            key={q.labelKey}
            type="button"
            onClick={() => {
            markEngaged();
            controllerRef.current?.handleTranscript(q.text);
          }}
            className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {tVoice(language, q.labelKey)}
          </button>
        ))}
      </div>

      {/* Language switch */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-secondary">
          {tVoice(language, "voiceLanguage")}:
        </span>
        {(["en", "hi", "or"] as Language[]).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => changeLanguage(lang)}
            aria-pressed={language === lang}
            className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-3 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {tVoice(language, lang === "en" ? "langEn" : lang === "hi" ? "langHi" : "langOr")}
          </button>
        ))}
      </div>

      {/* Listen to the last response on demand — never auto-play (§11) */}
      {response?.speak && (
        <div className="mt-3">
          <VoiceListen text={response.speak} language={language} />
        </div>
      )}

      <p className="mt-3 text-xs text-text-secondary">
        {tVoice(language, "voicePrivacyNote")}
      </p>
    </section>
  );
}
