/**
 * Voice assistant — conversation controller (spec §15–§24, §39–§42,
 * §72–§74, §88–§92, §105).
 *
 * This is the conversation LOOP, not a chatbot. It is a typed state
 * machine that coordinates the seven voice layers:
 *
 *   recognition → understanding → routing → safety gate →
 *   application action → response generation → synthesis
 *
 * INVARIANTS
 * - Explicit turn ownership (§105): the controller only listens when
 *   it expects an answer (follow-up question, confirmation) or when
 *   the user explicitly taps the microphone. After a general response
 *   it returns to `idle` — there is no automatic listen→speak loop.
 * - Bounded follow-ups (§72): the symptom loop asks at most
 *   MAX_FOLLOW_UP_QUESTIONS deterministic follow-ups, never repeats an
 *   answered question, and always terminates in a triage response.
 * - Deterministic safety gate (§26–§29): every symptom flow passes
 *   through evaluateTriage. An emergency/urgent category immediately
 *   interrupts the conversation with escalation wording and ends the
 *   symptom flow — no further questions are asked.
 * - Session-level dedup (§73, §74): a repeated command fingerprint
 *   (e.g. a duplicate ASR emission) never re-executes an action.
 * - All timers are bounded, tracked, and cancellable (§20, §42, §120).
 * - Temporary context is in-memory only and dies with the session
 *   (§40, §91, §92) — nothing is persisted to localStorage.
 *
 * The controller is framework-agnostic: every side effect (rendering,
 * navigation, fetching, recognition, synthesis) flows through the
 * VoiceControllerAdapter so it can be unit-tested without a browser.
 */

import {
  commandFingerprint,
  type VoiceCommand,
  type VoiceIntent,
} from "./intents";
import {
  routeVoiceCommand,
  type VoiceActionPlan,
  type VoiceSessionContext,
} from "./router";
import {
  interpretVoiceCommand,
  type InterpretationResult,
} from "./understanding";
import {
  actionFailed,
  aiUnavailable,
  clarifySymptom,
  confirmConsultation,
  confirmDoctor,
  confirmEnd,
  duplicate,
  ended,
  greeting,
  heardNothing,
  helpResponse,
  languageChanged,
  offlineQueuePrompt,
  recognitionFailed,
  repeatUnavailable,
  sessionEnded,
  syncExplain,
  triageExplain,
  triageResult,
  followUpQuestion,
  offlineExplain,
  unknownResponse,
  unauthorized,
  type VoiceResponse,
} from "./responses";
import type { Language } from "@/lib/i18n";
import {
  evaluateTriage,
  suggestedFollowUps,
  type FollowUpId,
  type TriageCategory,
} from "@/lib/triage/red-flags";
import type { SymptomConcept } from "@/lib/triage/concepts";

// ─── State machine (spec §16) ──────────────────────────

export type VoiceAssistantState =
  | "idle"
  | "listening"
  | "processing"
  | "confirmation_required"
  | "speaking"
  | "waiting_for_response"
  | "executing_action"
  | "clarification"
  | "error"
  | "fallback"
  | "ending";

/**
 * Conversation context (spec §91). Deliberately small: only what the
 * ACTIVE task needs. It is dropped entirely on session end (§41, §92).
 */
export interface VoiceTaskContext {
  sessionId: string;
  language: Language;
  intent: VoiceIntent | null;
  activeQuestion: "follow-up" | "confirmation" | "clarify" | null;
  collected: {
    symptoms: SymptomConcept[];
    symptomText: string | null;
    followUps: Partial<Record<FollowUpId, boolean>>;
    medicineName: string | null;
  };
  lastResponse: string;
  state: VoiceAssistantState;
}

/** Everything the controller needs from the outside world. */
export interface VoiceControllerAdapter {
  onStateChange(state: VoiceAssistantState): void;
  onContextChange(ctx: VoiceTaskContext): void;
  /** Present a response. `speak` is only true after an explicit user
   *  gesture enabled voice output (never auto-play, spec §11). */
  onResponse(response: VoiceResponse, opts: { speak: boolean }): void;
  onNavigate(path: string): void;
  /**
   * Execute a data-fetching plan through EXISTING app routes/APIs and
   * return the response to present (built with responses.ts builders).
   * Return null on failure. Navigation/mutation plans are executed by
   * the adapter directly via onNavigate / onConfirm — see executePlan.
   */
  fetchPlanResponse(plan: Extract<
    VoiceActionPlan,
    { kind: "readHealthCard" | "medicineLookup" | "doctorAvailability" }
  >): Promise<VoiceResponse | null>;
  /** Ask the user a yes/no question on screen. */
  onConfirm(opts: {
    prompt: VoiceResponse;
    onYes(): void;
    onNo(): void;
  }): void;
  /** Server-side AI interpretation fallback (POST /api/voice/interpret).
   *  Optional: when absent or offline, deterministic-only mode is used. */
  aiInterpret?(
    transcript: string,
    language: Language
  ): Promise<VoiceCommand | null>;
  /**
   * The REAL session identity: role, authentication, online state,
   * current route, active consultation / care request. The controller
   * never invents these — authorization always comes from the app's
   * own session (spec §35, §77: no voice backdoor, no voice biometrics).
   */
  sessionContext(): VoiceSessionContext;
  /**
   * Execute a confirmed mutation through the EXISTING API route with
   * its existing idempotency (spec §74). Returns the response to show,
   * or null on failure. The controller never fetches or mutates itself.
   */
  executeMutation(
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
  ): Promise<VoiceResponse | null>;
  startListening(): boolean;
  stopListening(): void;
  speak(text: string, language: Language): boolean;
  stopSpeaking(): void;
  isOnline(): boolean;
  now?(): number;
}

// ─── Bounded resources (spec §20, §42, §72, §105) ─────

/** Silence after which listening stops on its own. */
export const DEAD_AIR_MS = 15_000;
/** Inactivity after which the voice session closes itself. */
export const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
/** Hard cap on symptom follow-up questions. */
export const MAX_FOLLOW_UP_QUESTIONS = 4;

type Timer = ReturnType<typeof setTimeout>;

export interface VoiceControllerOptions {
  sessionId: string;
  /** Voice output is only enabled after an explicit user gesture. */
  voiceOutput?: boolean;
  deadAirMs?: number;
  sessionTimeoutMs?: number;
}

/**
 * The conversation controller. One instance = one voice session.
 * Call destroy() on unmount (spec §86, §119).
 */
export class VoiceConversationController {
  private state: VoiceAssistantState = "idle";
  private language: Language;
  private voiceOutput: boolean;
  private readonly deadAirMs: number;
  private readonly sessionTimeoutMs: number;
  private readonly adapter: VoiceControllerAdapter;
  private readonly sessionId: string;

  private timers = new Set<Timer>();
  private seenFingerprints = new Set<string>();
  private lastResponse: VoiceResponse | null = null;
  private lastResponseLanguage: Language;
  /** Pending confirmation (mutation / data-sharing / session end). */
  private pendingPlan: VoiceActionPlan | null = null;
  /** Pending symptom follow-up question. */
  private pendingFollowUp: FollowUpId | null = null;
  private followUpsAsked = 0;
  private symptomFlowActive = false;
  private destroyed = false;

  private context: VoiceTaskContext;

  constructor(
    language: Language,
    adapter: VoiceControllerAdapter,
    options: VoiceControllerOptions
  ) {
    this.language = language;
    this.lastResponseLanguage = language;
    this.adapter = adapter;
    this.sessionId = options.sessionId;
    this.voiceOutput = options.voiceOutput ?? false;
    this.deadAirMs = options.deadAirMs ?? DEAD_AIR_MS;
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? SESSION_TIMEOUT_MS;
    this.context = this.emptyContext();
    this.emitContext();
  }

  // ─── Session lifecycle (spec §41, §42, §62) ────────

  /** Open the session with the greeting. Text-first: voice output
   *  stays off until the user taps the microphone / listen control. */
  start(): void {
    if (this.destroyed) return;
    this.setState("idle");
    this.respond(greeting(this.language), { speak: false });
    this.armSessionTimeout();
  }

  /** Enable spoken responses — call this from an explicit user
   *  gesture (microphone tap). Nothing speaks before this. */
  enableVoiceOutput(): void {
    this.voiceOutput = true;
  }

  disableVoiceOutput(): void {
    this.voiceOutput = false;
    this.adapter.stopSpeaking();
  }

  /** End the session: stop recognition, cancel speech, drop context. */
  endSession(): void {
    if (this.destroyed) return;
    this.clearTimers();
    this.adapter.stopListening();
    this.adapter.stopSpeaking();
    this.symptomFlowActive = false;
    this.pendingFollowUp = null;
    this.pendingPlan = null;
    this.setState("ending");
    this.respond(sessionEnded(this.language), { speak: this.voiceOutput });
    this.context = this.emptyContext();
    this.seenFingerprints = new Set();
    this.setState("idle");
  }

  /** Full teardown — call on unmount. */
  destroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.adapter.stopListening();
    this.adapter.stopSpeaking();
  }

  /**
   * TTS completion callback (spec §17). The adapter passes this
   * as speakText's onEnded so a "speaking" turn returns to idle
   * when playback finishes or fails — the loop never sticks in
   * the speaking state.
   */
  notifySpeakingDone(): void {
    if (this.destroyed) return;
    if (this.state === "speaking") {
      this.setState("idle");
      this.armSessionTimeout();
    }
  }

  /** Barge-in / user interrupt (spec §18, §88): stop speech and
   *  timers immediately; the caller may then begin listening. */
  interrupt(): void {
    this.adapter.stopSpeaking();
    this.clearTimers();
    if (this.state === "speaking") this.setState("idle");
  }

  // ─── Listening (spec §9, §20, §85, §89) ────────────

  /** Begin a controlled listening turn. Returns false when the
   *  browser has no speech recognition — the caller shows the
   *  guided/text fallback instead. */
  beginListening(): boolean {
    if (this.destroyed) return false;
    this.clearTimers();
    const ok = this.adapter.startListening();
    if (!ok) {
      this.setState("fallback");
      return false;
    }
    this.setState("listening");
    this.armDeadAir();
    this.armSessionTimeout();
    return true;
  }

  /** Recognition stopped without a final transcript. Preserve any
   *  partial transcript by handing it back for review (spec §89, §90). */
  handleRecognitionStopped(partial: string): void {
    this.clearTimers();
    if (this.state !== "listening") return;
    if (partial.trim()) {
      // Partial transcript survives: show it for confirmation/retry.
      this.setState("clarification");
      this.respond(
        {
          text: partial,
          speak: partial,
        },
        { speak: false }
      );
      return;
    }
    this.respond(heardNothing(this.language), { speak: this.voiceOutput });
    this.setState("idle");
    this.armSessionTimeout();
  }

  /** Recognition error — user-friendly message, never a raw error code
   *  (spec §64). */
  handleRecognitionError(): void {
    this.clearTimers();
    if (this.state === "listening") {
      this.setState("error");
      this.respond(recognitionFailed(this.language), {
        speak: this.voiceOutput,
      });
      this.setState("idle");
      this.armSessionTimeout();
    }
  }

  /**
   * A transcript arrived. THE central entry point of the loop:
   * listen → understand → validate → act → respond (spec §15).
   */
  async handleTranscript(text: string): Promise<void> {
    if (this.destroyed) return;
    const transcript = text.trim();
    this.clearTimers();
    if (!transcript) {
      this.respond(heardNothing(this.language), { speak: this.voiceOutput });
      this.setState("idle");
      return;
    }

    this.setState("processing");

    // 1) Answer a pending yes/no question first (follow-up, confirm).
    const interpretation = interpretVoiceCommand(transcript, this.language);
    if (interpretation.answer !== null) {
      this.handleYesNo(interpretation.answer, interpretation.language);
      return;
    }

    // 2) Language stays stable unless the user explicitly asked to
    //    change it — a single uncertain utterance never flips the
    //    session language (spec §8, §111).

    // 3) Deterministic interpretation, then AI fallback (§46, §49).
    let command = interpretation.command;
    let source: "deterministic" | "ai" = "deterministic";
    if (!command && interpretation.needsAiFallback && this.adapter.isOnline()) {
      command = await this.interpretWithAI(transcript);
      source = "ai";
    }

    // 4) Still nothing: guided fallback (spec §30, §47).
    if (!command) {
      this.setState("fallback");
      if (interpretation.needsAiFallback) {
        this.respond(aiUnavailable(this.language), { speak: this.voiceOutput });
      } else {
        this.respond(clarifySymptom(this.language), { speak: this.voiceOutput });
        this.context.activeQuestion = "clarify";
        this.emitContext();
      }
      this.setState("idle");
      this.armSessionTimeout();
      return;
    }

    if (source === "ai") {
      command = { ...command, source: "ai" as const };
    }

    // 5) Session-level dedup (§73, §74).
    if (this.seenFingerprints.has(command.fingerprint)) {
      this.respond(duplicate(this.language), { speak: this.voiceOutput });
      this.setState("idle");
      this.armSessionTimeout();
      return;
    }
    this.seenFingerprints.add(command.fingerprint);

    // 6) Route through the action router (authorization lives server-side).
    this.context.intent = command.intent;
    await this.executeCommand(command);
    this.armSessionTimeout();
  }

  // ─── Symptom follow-up answers (§15, §26) ──────────

  /**
   * Answer the pending symptom follow-up question, or — when no
   * follow-up is pending — treat the transcript as a new symptom
   * description and continue the symptom flow.
   */
  continueSymptomFlow(answer: boolean, newConcepts: SymptomConcept[], symptomText: string): void {
    if (this.destroyed) return;
    this.clearTimers();
    this.setState("processing");

    if (this.pendingFollowUp) {
      this.context.collected.followUps[this.pendingFollowUp] = answer;
      this.pendingFollowUp = null;
    }
    if (newConcepts.length > 0) {
      const merged = new Set<SymptomConcept>(this.context.collected.symptoms);
      for (const c of newConcepts) merged.add(c);
      this.context.collected.symptoms = [...merged];
    }
    if (symptomText) {
      this.context.collected.symptomText = symptomText;
    }
    this.emitContext();
    this.advanceSymptomFlow();
  }

  /** Reject the current symptom flow and return to idle. */
  cancelSymptomFlow(): void {
    this.symptomFlowActive = false;
    this.pendingFollowUp = null;
    this.followUpsAsked = 0;
    this.context.intent = null;
    this.context.activeQuestion = null;
    this.context.collected = {
      symptoms: [],
      symptomText: null,
      followUps: {},
      medicineName: null,
    };
    this.setState("idle");
    this.emitContext();
  }

  // ─── Confirmations (§24, §25, §61) ─────────────────

  confirmYes(): void {
    const plan = this.pendingPlan;
    this.pendingPlan = null;
    if (!plan) return;
    void this.executePlan(plan);
  }

  confirmNo(): void {
    this.pendingPlan = null;
    this.cancelSymptomFlow();
    this.respond(ended(this.language), { speak: this.voiceOutput });
    this.setState("idle");
    this.armSessionTimeout();
  }

  /** Repeat the last response aloud + on screen (§21). */
  repeat(): void {
    if (this.lastResponse && this.lastResponse.text) {
      this.respond(this.lastResponse, { speak: this.voiceOutput });
    } else {
      this.respond(repeatUnavailable(this.language), { speak: this.voiceOutput });
    }
    this.setState("idle");
  }

  /** Change the session language (§7, §8). */
  changeLanguage(language: Language): void {
    const previous = this.language;
    this.language = language;
    this.lastResponseLanguage = language;
    this.context.language = language;
    this.emitContext();
    this.respond(languageChanged(previous, language), {
      speak: this.voiceOutput,
    });
  }

  /**
   * Silent language sync — the app language changed through the
   * normal UI. The assistant follows without announcing it (the
   * voice-initiated CHANGE_LANGUAGE intent uses changeLanguage).
   */
  setLanguage(language: Language): void {
    this.language = language;
    this.lastResponseLanguage = language;
    this.context.language = language;
    this.emitContext();
  }

  // ─── Internals ─────────────────────────────────────

  private emptyContext(): VoiceTaskContext {
    return {
      sessionId: this.sessionId,
      language: this.language,
      intent: null,
      activeQuestion: null,
      collected: {
        symptoms: [],
        symptomText: null,
        followUps: {},
        medicineName: null,
      },
      lastResponse: "",
      state: this.state,
    };
  }

  private setState(state: VoiceAssistantState): void {
    this.state = state;
    this.context.state = state;
    this.adapter.onStateChange(state);
    this.adapter.onContextChange(this.context);
  }

  private emitContext(): void {
    this.adapter.onContextChange(this.context);
  }

  private respond(response: VoiceResponse, opts: { speak: boolean }): void {
    this.lastResponse = response;
    this.lastResponseLanguage = this.language;
    this.context.lastResponse = response.text;
    this.adapter.onResponse(response, opts);
    this.emitContext();
    if (opts.speak && response.speak) {
      // Turn ownership: mark speaking, then return to idle when done.
      this.setState("speaking");
      const spoke = this.adapter.speak(response.speak, this.language);
      if (!spoke) {
        // TTS unavailable — text stays on screen (§14, §63).
        this.setState("idle");
      }
    }
  }

  private async interpretWithAI(
    transcript: string
  ): Promise<VoiceCommand | null> {
    if (!this.adapter.aiInterpret) return null;
    try {
      return await this.adapter.aiInterpret(transcript, this.language);
    } catch {
      // AI failure is a normal fallback path, not an error state (§49).
      return null;
    }
  }

  private async executeCommand(command: VoiceCommand): Promise<void> {
    // Session identity comes from the app's own auth state — the
    // controller never assumes it (spec §35, §77).
    const ctx = this.adapter.sessionContext();
    const routed = routeVoiceCommand(command, ctx);

    // Authorization denial (§35, §76): voice has no backdoor.
    if (routed.plan.kind === "unauthorized") {
      this.setState("error");
      this.respond(unauthorized(this.language), {
        speak: this.voiceOutput,
      });
      this.setState("idle");
      return;
    }

    // Symptom flows enter the deterministic safety loop (§26).
    if (routed.plan.kind === "symptomCheck") {
      this.symptomFlowActive = true;
      this.advanceSymptomFlow();
      return;
    }

    // Confirmation-required intents (§24, §25, §61).
    if (routed.requiresConfirmation) {
      this.pendingPlan = routed.plan;
      this.setState("confirmation_required");
      this.context.activeQuestion = "confirmation";
      this.emitContext();
      const prompt =
        routed.plan.kind === "endVoiceSession"
          ? confirmEnd(this.language)
          : routed.plan.kind === "startConsultation" ||
              routed.plan.kind === "switchAudio"
            ? confirmConsultation(this.language)
            : routed.plan.kind === "offlineQueue"
              ? offlineQueuePrompt(this.language)
              : confirmDoctor(this.language);
      this.respond(prompt, { speak: this.voiceOutput });
      return;
    }

    await this.executePlan(routed.plan);
  }

  private async executePlan(plan: VoiceActionPlan): Promise<void> {
    this.setState("executing_action");
    this.context.activeQuestion = null;
    this.emitContext();

    switch (plan.kind) {
      case "navigate":
        this.adapter.onNavigate(plan.path);
        this.setState("idle");
        return;

      case "readHealthCard":
      case "medicineLookup":
      case "doctorAvailability": {
        const response = await this.adapter.fetchPlanResponse(plan);
        if (response) {
          this.respond(response, { speak: this.voiceOutput });
        } else {
          this.respond(actionFailed(this.language), { speak: this.voiceOutput });
        }
        this.setState("idle");
        return;
      }

      case "requestDoctor":
      case "shareWithDoctor":
      case "startConsultation":
      case "switchAudio":
      case "endConsultation": {
        // Confirmed mutation: the adapter executes it through the
        // existing API route with its existing idempotency (§74).
        const response = await this.adapter.executeMutation(plan);
        this.respond(
          response ?? actionFailed(this.language),
          { speak: this.voiceOutput }
        );
        this.setState("idle");
        return;
      }

      case "explain":
        this.respond(this.explainResponse(plan.topic), { speak: this.voiceOutput });
        this.setState("idle");
        return;

      case "repeat":
        this.repeat();
        return;

      case "help":
        this.respond(helpResponse(this.language), { speak: this.voiceOutput });
        this.setState("idle");
        return;

      case "cancel":
        this.cancelSymptomFlow();
        this.respond(ended(this.language), { speak: this.voiceOutput });
        this.setState("idle");
        return;

      case "endVoiceSession":
        this.endSession();
        return;

      case "changeLanguage":
        this.changeLanguage(plan.language);
        this.setState("idle");
        return;

      case "offlineQueue":
        // Offline mutation: ask, then queue through the existing
        // offline queue when the user confirms (§93).
        this.pendingPlan = plan.plan;
        this.setState("confirmation_required");
        this.context.activeQuestion = "confirmation";
        this.emitContext();
        this.respond(offlineQueuePrompt(this.language), {
          speak: this.voiceOutput,
        });
        return;

      case "unauthorized":
      case "unsupported":
      default:
        this.respond(actionFailed(this.language), { speak: this.voiceOutput });
        this.setState("idle");
        return;
    }
  }

  private explainResponse(
    topic: "triage" | "offline" | "sync"
  ): VoiceResponse {
    switch (topic) {
      case "triage":
        return triageExplain(this.language);
      case "offline":
        return offlineExplain(this.language);
      case "sync":
        return syncExplain(this.language);
    }
  }

  // ─── Symptom safety loop (§26–§29, §72, §96) ───────

  /**
   * Run the deterministic engine over everything collected so far and
   * either escalate (emergency/urgent), ask the next follow-up, or
   * produce the final triage response. This is the ONLY place medical
   * safety decisions are made — the AI never participates (§29).
   */
  private advanceSymptomFlow(): void {
    const input = {
      concepts: this.context.collected.symptoms,
      followUps: this.context.collected.followUps,
    };
    const result = evaluateTriage(input);
    this.emitContext();

    // RED-FLAG INTERRUPTION (§28, §96, §97): stop everything, give
    // the engine's escalation wording verbatim, end the flow.
    if (result.category !== "routine") {
      this.symptomFlowActive = false;
      this.pendingFollowUp = null;
      this.context.activeQuestion = null;
      this.respond(triageResult(this.language, result.category), {
        speak: this.voiceOutput,
      });
      this.setState("idle");
      this.emitContext();
      return;
    }

    // Ask the next unanswered deterministic follow-up (bounded).
    const suggestions = suggestedFollowUps(input).filter(
      (id) => this.context.collected.followUps[id] === undefined
    );
    if (
      suggestions.length > 0 &&
      this.followUpsAsked < MAX_FOLLOW_UP_QUESTIONS
    ) {
      const next = suggestions[0];
      this.pendingFollowUp = next;
      this.followUpsAsked += 1;
      this.symptomFlowActive = true;
      this.context.activeQuestion = "follow-up";
      this.setState("waiting_for_response");
      this.respond(followUpQuestion(this.language, next), {
        speak: this.voiceOutput,
      });
      // Turn ownership: a follow-up question EXPECTS an answer, so
      // listening resumes automatically (§105).
      if (!this.beginListening()) {
        // No ASR: stay in waiting_for_response with on-screen buttons.
        this.setState("waiting_for_response");
      }
      return;
    }

    // Bounded flow complete: final triage wording + doctor offer.
    this.symptomFlowActive = false;
    this.pendingFollowUp = null;
    this.context.activeQuestion = null;
    this.respond(triageResult(this.language, result.category), {
      speak: this.voiceOutput,
    });
    // Offer the doctor workflow — a real plan behind a confirmation.
    this.pendingPlan = { kind: "navigate", path: "/care-requests" };
    this.setState("confirmation_required");
    this.context.activeQuestion = "confirmation";
    this.emitContext();
    this.respond(confirmDoctor(this.language), { speak: this.voiceOutput });
  }

  private handleYesNo(answer: boolean, language: Language): void {
    // A yes/no answer belongs to a pending question; if none is
    // pending it is not a command — ask what the user needs.
    if (this.pendingFollowUp && this.symptomFlowActive) {
      this.continueSymptomFlow(answer, [], "");
      return;
    }
    if (this.pendingPlan) {
      if (answer) {
        this.confirmYes();
      } else {
        this.confirmNo();
      }
      return;
    }
    // Stray yes/no with nothing pending.
    this.language = language;
    this.respond(unknownResponse(this.language), {
      speak: this.voiceOutput,
    });
  }

  // ─── Timers (§20, §42, §120) ───────────────────────

  private armTimer(fn: () => void, ms: number): void {
    const handle = setTimeout(() => {
      this.timers.delete(handle);
      fn();
    }, ms);
    this.timers.add(handle);
  }

  private armDeadAir(): void {
    this.armTimer(() => {
      // Bounded silence: stop listening, tell the user, return to idle.
      this.adapter.stopListening();
      this.respond(heardNothing(this.language), { speak: this.voiceOutput });
      this.setState("idle");
      this.armSessionTimeout();
    }, this.deadAirMs);
  }

  private armSessionTimeout(): void {
    this.armTimer(() => {
      // Inactivity: close the session, release the microphone (§42).
      this.endSession();
    }, this.sessionTimeoutMs);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
