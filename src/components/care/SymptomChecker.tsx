"use client";

/**
 * Guided symptom checker (Phase 2) — one question per screen, large tap
 * targets, voice input with mandatory confirmation, works offline.
 *
 * TWO-LAYER SAFETY ARCHITECTURE (see interpretation.ts):
 * - Layer 1 (AI, optional): POST /api/triage/interpret maps the patient's
 *   words to broad canonical concepts. Any failure (offline, timeout, bad
 *   payload) downgrades to the deterministic normalizer with a visible,
 *   honest notice — the flow NEVER stops and NEVER guesses.
 * - Layer 2 (deterministic engine): urgency comes exclusively from
 *   evaluateTriage via buildTriageDecision. An emergency engine result
 *   OVERRIDES everything: collection stops immediately and the escalation
 *   screen is shown (no appointment-first, no care-request CTA).
 *
 * Flow: intro → feeling → describe (voice confirm) → duration → severity →
 * interpreting → clarify (≤3 questions) → result → care-routing (consent).
 *
 * Handoff reuses the existing Part 1/2 queue: the consent sheet builds a
 * schema-validated CareRequestPacket and enqueues it through
 * `enqueueCareRequestPacket` (idempotent) — no new records, no new
 * appointment architecture.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import { tPhase2, type Phase2Dict } from "@/lib/i18n/phase2";
import { t2 } from "@/lib/i18n/part2";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { VoiceListen } from "@/components/voice/VoiceListen";
import { speakText, stopSpeaking } from "@/lib/voice/speech";
import { useSync } from "@/lib/offline/sync-provider";
import { useHealthCard } from "@/lib/health-card/use-health-card";
import { SYMPTOM_CONCEPTS, type SymptomConcept } from "@/lib/triage/concepts";
import { conceptLabels } from "@/lib/triage/concept-labels";
import { mergeSymptomConcepts, evaluateAndDecide } from "@/lib/triage/interpretation";
import type {
  SymptomDuration,
  SymptomSeverity,
  TriageDecision,
} from "@/lib/triage/interpretation";
import { suggestedFollowUps, isFollowUpId } from "@/lib/triage/red-flags";
import type { FollowUpId, TriageCategory } from "@/lib/triage/red-flags";
import { PacketSchema, newPacketSkeleton } from "@/lib/triage/packet";
import type { CareRequestPacket } from "@/lib/triage/packet";

/** Low-bandwidth cap — matches AI_INTERPRET_MAX_TEXT. */
const MAX_CHARS = 500;
/** Hard bound on clarification questions (spec: ≤3). */
const MAX_CLARIFY = 3;

type Phase =
  | "intro"
  | "feeling"
  | "describe"
  | "duration"
  | "severity"
  | "interpreting"
  | "clarify"
  | "result";

type AiNotice = null | "unavailable" | "offline";

interface Answers {
  selected: SymptomConcept[];
  /** User chose "Other / type it" (free text without button selection). */
  otherMode: boolean;
  text: string;
  /** null = skipped (AI duration may fill in); {value:null} = "not sure". */
  duration: { value: SymptomDuration | null } | null;
  severity: { value: SymptomSeverity | null } | null;
  /** Final merged concepts (set once interpretation completes). */
  concepts: SymptomConcept[];
  followUps: Partial<Record<FollowUpId, boolean>>;
  aiNotice: AiNotice;
  aiDuration: SymptomDuration | null;
  aiSeverity: SymptomSeverity | null;
}

const EMPTY_ANSWERS: Answers = {
  selected: [],
  otherMode: false,
  text: "",
  duration: null,
  severity: null,
  concepts: [],
  followUps: {},
  aiNotice: null,
  aiDuration: null,
  aiSeverity: null,
};

interface Outcome {
  decision: TriageDecision;
  /** Engine category for the care-request packet (urgent needs ack). */
  engineCategory: TriageCategory;
}

const DURATION_CHOICES: Array<{ key: keyof Phase2Dict; value: SymptomDuration | null }> = [
  { key: "durToday", value: { value: 0, unit: "days" } },
  { key: "dur1to3", value: { value: 2, unit: "days" } },
  { key: "dur4to7", value: { value: 5, unit: "days" } },
  { key: "durOverWeek", value: { value: 10, unit: "days" } },
  { key: "durUnsure", value: null },
];

const SEVERITY_CHOICES: Array<{ key: keyof Phase2Dict; value: SymptomSeverity | null }> = [
  { key: "sevMild", value: "mild" },
  { key: "sevModerate", value: "moderate" },
  { key: "sevSevere", value: "severe" },
  { key: "sevUnsure", value: null },
];

const FU_QUESTION_KEYS: Record<FollowUpId, keyof Phase2Dict> = {
  breathing_worse_at_rest: "scFuBreathing",
  chest_pressure_spreading: "scFuChest",
  bleeding_wont_stop: "scFuBleeding",
  vomiting_cannot_keep_fluids: "scFuVomiting",
  fever_three_days_or_more: "scFuFever",
  headache_sudden_worst_ever: "scFuHeadache",
  injury_from_major_trauma: "scFuInjury",
  symptoms_suddenly_worse: "scFuWorse",
};

const CONCEPT_ICONS: Record<SymptomConcept, string> = {
  fever: "🌡️",
  difficulty_breathing: "🫁",
  chest_discomfort: "❤️",
  severe_headache: "🤕",
  vomiting: "🤢",
  abdominal_pain: "🫀",
  injury: "🩹",
  fainting: "💫",
  severe_bleeding: "🩸",
  weakness_one_side: "🤚",
  pregnancy_concern: "🤰",
};

const URGENCY_LABEL_KEYS: Record<TriageDecision["urgency"], keyof Phase2Dict> = {
  emergency: "urgEmergency",
  urgent: "urgUrgent",
  routine: "urgRoutine",
  uncertain: "urgUncertain",
};

const NEXT_ACTION_KEYS: Record<TriageDecision["urgency"], keyof Phase2Dict> = {
  emergency: "naEmergency",
  urgent: "naUrgent",
  routine: "naRoutine",
  uncertain: "naUncertain",
};

interface InterpretData {
  concepts: SymptomConcept[];
  duration: SymptomDuration | null;
  severity: SymptomSeverity | null;
  suggestedFollowUpId: FollowUpId | null;
}

function toOutcome(decision: TriageDecision): Outcome {
  const engineCategory: TriageCategory =
    decision.urgency === "emergency"
      ? "emergency"
      : decision.urgency === "urgent"
        ? "urgent"
        : "routine";
  return { decision, engineCategory };
}

export function SymptomChecker() {
  const { language, t } = useLanguage();
  const { online, enqueueCareRequestPacket } = useSync();
  const { card } = useHealthCard();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("intro");
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [clarifyQueue, setClarifyQueue] = useState<FollowUpId[]>([]);
  const [clarifyIndex, setClarifyIndex] = useState(0);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [shareMedicines, setShareMedicines] = useState(true);
  const [shareAllergies, setShareAllergies] = useState(true);
  const [ack, setAck] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const tt = (key: keyof Phase2Dict, vars?: Record<string, string | number>) =>
    tPhase2(language, key, vars);

  // Guard against setState after unmount from async interpretation.
  // Speech-to-text state lives in <VoiceInput>; speech playback is
  // cancelled here so it never outlives the checker.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopSpeaking();
    };
  }, []);

  /** Spoken clarify answer, shown as context — the patient still taps
   *  Yes / No / Not sure themselves; speech is never auto-submitted. */
  const [clarifySpoken, setClarifySpoken] = useState<string | null>(null);

  // ── Deterministic evaluation helpers (Layer 2 only) ─────────────────────
  const effectiveDuration = (a: Answers): SymptomDuration | null =>
    a.duration ? a.duration.value : a.aiDuration;
  const effectiveSeverity = (a: Answers): SymptomSeverity | null =>
    a.severity ? a.severity.value : a.aiSeverity;

  const showResult = (concepts: SymptomConcept[], fu: Answers["followUps"], dur: SymptomDuration | null) => {
    const decision = evaluateAndDecide({ concepts, followUps: fu, duration: dur });
    setOutcome(toOutcome(decision));
    setPhase("result");
  };

  /**
   * Emergency stop-collection check (red-flag override): an engine
   * emergency jumps straight to the escalation screen. Returns true when
   * collection must stop NOW.
   */
  const emergencyStop = (
    concepts: SymptomConcept[],
    fu: Answers["followUps"],
    dur: SymptomDuration | null
  ): boolean => {
    const decision = evaluateAndDecide({ concepts, followUps: fu, duration: dur });
    if (decision.urgency === "emergency") {
      setOutcome(toOutcome(decision));
      setPhase("result");
      return true;
    }
    return false;
  };

  const buildClarifyQueue = (
    concepts: SymptomConcept[],
    fu: Answers["followUps"],
    aiSuggested: FollowUpId | null
  ): FollowUpId[] => {
    const queue: FollowUpId[] = [];
    for (const id of suggestedFollowUps({ concepts, followUps: fu })) {
      if (id in fu) continue; // already answered
      if (!queue.includes(id)) queue.push(id);
      if (queue.length >= MAX_CLARIFY) break;
    }
    if (
      aiSuggested &&
      isFollowUpId(aiSuggested) &&
      !(aiSuggested in fu) &&
      !queue.includes(aiSuggested) &&
      queue.length < MAX_CLARIFY
    ) {
      queue.push(aiSuggested);
    }
    return queue.slice(0, MAX_CLARIFY);
  };

  /** Finalize interpretation: merge → emergency check → clarify or result. */
  const finalize = (base: Answers, ai: InterpretData | null, notice: AiNotice) => {
    const merged = mergeSymptomConcepts({
      text: base.text,
      aiConcepts: ai?.concepts ?? null,
      userConfirmed: base.selected,
    });
    const next: Answers = {
      ...base,
      concepts: merged.concepts,
      aiNotice: notice,
      aiDuration: ai?.duration ?? base.aiDuration,
      aiSeverity: ai?.severity ?? base.aiSeverity,
    };
    if (!mountedRef.current) return;
    setAnswers(next);

    const dur = effectiveDuration(next);
    // Emergency wins over AI reassurance, over remaining questions, over everything.
    if (emergencyStop(next.concepts, next.followUps, dur)) return;

    const queue = buildClarifyQueue(
      next.concepts,
      next.followUps,
      ai?.suggestedFollowUpId ?? null
    );
    if (queue.length === 0) {
      showResult(next.concepts, next.followUps, dur);
      return;
    }
    setClarifyQueue(queue);
    setClarifyIndex(0);
    setPhase("clarify");
  };

  const beginInterpretation = (base: Answers) => {
    const hasText = base.text.trim().length > 0;
    if (!hasText) {
      finalize(base, null, null); // buttons-only flow needs no AI
      return;
    }
    if (!online) {
      finalize(base, null, "offline");
      return;
    }
    setPhase("interpreting");
    void (async () => {
      try {
        const res = await fetch("/api/triage/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            text: base.text.slice(0, MAX_CHARS),
            concepts: base.selected,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          data?: InterpretData | null;
          error?: { code?: string } | null;
        } | null;
        if (!res.ok || !json?.data) {
          throw new Error(String(json?.error?.code || "AI_UNAVAILABLE"));
        }
        finalize(base, json.data, null);
      } catch {
        if (!mountedRef.current) return;
        const stillOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
        // Safe failure: deterministic path only, with an honest notice.
        finalize(base, null, stillOnline ? "unavailable" : "offline");
      }
    })();
  };

  // ── Flow transitions ────────────────────────────────────────────────────
  const startOver = () => {
    setAnswers(EMPTY_ANSWERS);
    setOutcome(null);
    setClarifyQueue([]);
    setClarifyIndex(0);
    setHandoffOpen(false);
    setAck(false);
    setShareError(null);
    setClarifySpoken(null);
    setPhase("intro");
  };

  const chooseOther = () => {
    setAnswers((a) => ({ ...a, otherMode: true }));
    setPhase("describe");
  };

  const feelingContinue = () => {
    // Red-flag override as soon as enough is known — stop collection.
    if (emergencyStop(answers.selected, {}, null)) return;
    // Describe (optional free text + voice confirm) always follows feeling.
    setPhase("describe");
  };

  const describeContinue = () => {
    // Empty input is allowed and honest: the engine then yields "uncertain"
    // and the result screen offers clarification or review, never reassurance.
    setPhase("duration");
  };

  const chooseDuration = (value: SymptomDuration | null) => {
    const next: Answers = { ...answers, duration: { value } };
    setAnswers(next);
    setPhase("severity");
  };

  const chooseSeverity = (value: SymptomSeverity | null) => {
    const next: Answers = { ...answers, severity: { value } };
    setAnswers(next);
    beginInterpretation(next);
  };

  const answerClarify = (value: boolean | null) => {
    const id = clarifyQueue[clarifyIndex];
    if (!id) return;
    const nextFu: Answers["followUps"] =
      value === null ? answers.followUps : { ...answers.followUps, [id]: value };
    const next: Answers = { ...answers, followUps: nextFu };
    setAnswers(next);

    const dur = effectiveDuration(next);
    if (emergencyStop(next.concepts, nextFu, dur)) return;
    if (clarifyIndex + 1 < clarifyQueue.length) {
      setClarifyIndex(clarifyIndex + 1);
      setClarifySpoken(null);
      return;
    }
    showResult(next.concepts, nextFu, dur);
  };

  // ── Care routing (consent sheet → existing queue, idempotent) ───────────
  const buildSummary = (engineCategory: TriageCategory): string => {
    const conceptText = conceptLabels(answers.concepts.slice(0, 4), language);
    const urgencyWord =
      outcome?.decision.urgency === "uncertain"
        ? tt("urgUncertain")
        : engineCategory === "emergency"
          ? tt("urgEmergency")
          : engineCategory === "urgent"
            ? tt("urgUrgent")
            : tt("urgRoutine");
    const severityWord = effectiveSeverity(answers) ?? "";
    const lines: string[] = [];
    if (language === "hi") {
      if (conceptText) lines.push(`समस्या: ${conceptText}.`);
      if (answers.text.trim()) lines.push(`उनके शब्दों में: "${answers.text.trim().slice(0, 160)}"`);
      if (severityWord) lines.push(`तीव्रता: ${severityWord}.`);
      if (shareMedicines && card?.medications.length) lines.push(`दवाइयाँ: ${card.medications.slice(0, 6).join(", ")}`);
      if (shareAllergies && card?.allergies.length) lines.push(`एलर्जी: ${card.allergies.slice(0, 6).join(", ")}`);
      lines.push(`सुझाया स्तर: ${urgencyWord}.`);
    } else if (language === "or") {
      if (conceptText) lines.push(`ସମସ୍ୟା: ${conceptText}.`);
      if (answers.text.trim()) lines.push(`ନିଜ ଶବ୍ଦରେ: "${answers.text.trim().slice(0, 160)}"`);
      if (severityWord) lines.push(`ତୀବ୍ରତା: ${severityWord}.`);
      if (shareMedicines && card?.medications.length) lines.push(`ଔଷଧ: ${card.medications.slice(0, 6).join(", ")}`);
      if (shareAllergies && card?.allergies.length) lines.push(`ଏଲର୍ଜି: ${card.allergies.slice(0, 6).join(", ")}`);
      lines.push(`ପରାମର୍ଶିତ ସ୍ତର: ${urgencyWord}.`);
    } else {
      if (conceptText) lines.push(`Concerns: ${conceptText}.`);
      if (answers.text.trim()) lines.push(`In their words: "${answers.text.trim().slice(0, 160)}"`);
      if (severityWord) lines.push(`Severity: ${severityWord}.`);
      if (shareMedicines && card?.medications.length) lines.push(`Medicines: ${card.medications.slice(0, 6).join(", ")}`);
      if (shareAllergies && card?.allergies.length) lines.push(`Allergies: ${card.allergies.slice(0, 6).join(", ")}`);
      lines.push(`Suggested urgency: ${urgencyWord}.`);
    }
    const summary = lines.join(" ").slice(0, 480).trim();
    return summary || tt("scTitle");
  };

  const confirmShare = async () => {
    if (sharing || !outcome) return;
    if (outcome.engineCategory !== "routine" && !ack) return;
    setSharing(true);
    setShareError(null);

    const packet: CareRequestPacket = {
      ...newPacketSkeleton({ language }),
      symptom_text_original: answers.text.trim() ? answers.text : null,
      symptom_concepts: answers.concepts,
      body_area: null,
      symptom_category: null,
      follow_up_answers: Object.fromEntries(
        Object.entries(answers.followUps).filter(([, v]) => typeof v === "boolean")
      ) as Partial<Record<FollowUpId, boolean>>,
      age_group: null,
      triage_category: outcome.engineCategory,
      triage_rules_version: outcome.decision.rulesVersion,
      triage_rule_ids: outcome.decision.ruleIds,
      linked_document_ids: [],
      acknowledged_emergency_guidance:
        outcome.engineCategory === "routine" ? false : ack,
      summary: buildSummary(outcome.engineCategory),
    };

    const check = PacketSchema.safeParse(packet);
    if (!check.success) {
      setSharing(false);
      setShareError(t2(language, "wizardErrorGeneric"));
      return;
    }
    try {
      await enqueueCareRequestPacket({ language, packet });
      router.push("/care-requests?saved=offline");
    } catch {
      if (!mountedRef.current) return;
      setSharing(false);
      setShareError(t2(language, "wizardErrorGeneric"));
    }
  };

  // ── Progress bookkeeping ────────────────────────────────────────────────
  const collectionPhases: Phase[] = ["feeling", "describe", "duration", "severity"];
  const showProgress = collectionPhases.includes(phase) || phase === "clarify";
  const progressCurrent =
    phase === "clarify"
      ? 4 + clarifyIndex + 1
      : Math.max(1, collectionPhases.indexOf(phase) + 1);
  const progressTotal = 4 + clarifyQueue.length;

  const canContinueFeeling = answers.selected.length > 0 || answers.otherMode;

  const aiNoticeText =
    answers.aiNotice === "offline"
      ? tt("scAiUnavailableOffline")
      : answers.aiNotice === "unavailable"
        ? tt("scAiUnavailable")
        : null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {showProgress && (
        <div>
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span aria-hidden="true">{tt("scTitle")}</span>
            <span>{tt("scStep", { current: progressCurrent, total: progressTotal })}</span>
          </div>
          <div
            role="progressbar"
            aria-label={tt("scTitle")}
            aria-valuenow={progressCurrent}
            aria-valuemin={1}
            aria-valuemax={progressTotal}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.min(100, (progressCurrent / progressTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <Card padding="lg" className="min-h-[320px]">
        {phase === "intro" && (
          <section aria-labelledby="sc-intro-h">
            <h1 id="sc-intro-h" className="text-xl font-semibold text-text-primary">
              {tt("scTitle")}
            </h1>
            <p className="mt-3 text-text-secondary">{tt("scIntro")}</p>
            <p className="mt-3 rounded-card bg-canvas p-3 text-sm text-text-secondary">
              {tt("scDisclaimer")}
            </p>
            {!online && (
              <p role="status" className="mt-3 rounded-card bg-warning/10 p-3 text-sm text-text-primary">
                {tt("scOfflineMode")}
              </p>
            )}
            <div className="mt-5">
              <Button type="button" size="lg" onClick={() => setPhase("feeling")}>
                {tt("entryCheckSymptoms")}
              </Button>
            </div>
          </section>
        )}

        {phase === "feeling" && (
          <section aria-labelledby="sc-feel-h">
            <h1 id="sc-feel-h" className="text-xl font-semibold text-text-primary">
              {tt("scFeelingHeading")}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">{tt("scFeelingHint")}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SYMPTOM_CONCEPTS.map((c) => {
                const active = answers.selected.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setAnswers((a) => ({
                        ...a,
                        selected: active
                          ? a.selected.filter((x) => x !== c)
                          : [...a.selected, c],
                      }))
                    }
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-card border border-border bg-surface p-4 text-left font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span aria-hidden="true" className="text-2xl">
                      {CONCEPT_ICONS[c]}
                    </span>
                    <span>{conceptLabels([c], language)}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={chooseOther}
              className="mt-3 flex min-h-[56px] w-full items-center gap-3 rounded-card border border-dashed border-border bg-surface p-4 text-left font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span aria-hidden="true" className="text-2xl">
                📝
              </span>
              <span>{tt("scOther")}</span>
            </button>
            {!canContinueFeeling && (
              <p role="status" className="mt-3 text-sm text-text-secondary">
                {tt("scNoSymptoms")}
              </p>
            )}
          </section>
        )}

        {phase === "describe" && (
          <section aria-labelledby="sc-desc-h">
            <h1 id="sc-desc-h" className="text-xl font-semibold text-text-primary">
              {tt("scDescribeHeading")}
            </h1>
            <textarea
              value={answers.text}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, text: e.target.value.slice(0, MAX_CHARS) }))
              }
              placeholder={tt("scDescribePlaceholder")}
              maxLength={MAX_CHARS}
              rows={4}
              aria-label={tt("scDescribeHeading")}
              className="mt-4 w-full rounded-card border border-border bg-surface p-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="mt-3">
              <VoiceInput
                language={language}
                maxChars={MAX_CHARS}
                onConfirm={(text) =>
                  setAnswers((a) => ({ ...a, text: a.text ? `${a.text} ${text}`.slice(0, MAX_CHARS) : text }))
                }
              />
            </div>
          </section>
        )}

        {phase === "duration" && (
          <section aria-labelledby="sc-dur-h">
            <h1 id="sc-dur-h" className="text-xl font-semibold text-text-primary">
              {tt("scDurationHeading")}
            </h1>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DURATION_CHOICES.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => chooseDuration(choice.value)}
                  className="min-h-[64px] w-full rounded-card border border-border bg-surface p-4 text-left text-lg font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {tt(choice.key)}
                </button>
              ))}
            </div>
          </section>
        )}

        {phase === "severity" && (
          <section aria-labelledby="sc-sev-h">
            <h1 id="sc-sev-h" className="text-xl font-semibold text-text-primary">
              {tt("scSeverityHeading")}
            </h1>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SEVERITY_CHOICES.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => chooseSeverity(choice.value)}
                  className="min-h-[64px] w-full rounded-card border border-border bg-surface p-4 text-left text-lg font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {tt(choice.key)}
                </button>
              ))}
            </div>
          </section>
        )}

        {phase === "interpreting" && (
          <section aria-labelledby="sc-int-h">
            <h1 id="sc-int-h" className="text-xl font-semibold text-text-primary">
              {tt("scInterpreting")}
            </h1>
            <p role="status" aria-live="polite" className="mt-3 text-text-secondary">
              {tt("scInterpreting")}
            </p>
            <div className="mt-4 flex gap-2" aria-hidden="true">
              <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
              <span className="h-3 w-3 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
              <span className="h-3 w-3 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
            </div>
          </section>
        )}

        {phase === "clarify" && (
          <section aria-labelledby="sc-cl-h" aria-live="polite">
            <h1 id="sc-cl-h" className="text-xl font-semibold text-text-primary">
              {tt("scClarifyHeading")}
            </h1>
            {aiNoticeText && (
              <div className="mt-3 rounded-card bg-warning/10 p-3 text-sm text-text-primary">
                <p>{aiNoticeText}</p>
                <p className="mt-1 text-text-secondary">{tt("scFallbackHint")}</p>
              </div>
            )}
            {clarifyQueue[clarifyIndex] && (
              <fieldset className="mt-4 rounded-card border border-border p-4">
                <legend className="px-1 text-base font-medium text-text-primary">
                  {tt(FU_QUESTION_KEYS[clarifyQueue[clarifyIndex]])}
                </legend>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <VoiceListen
                    text={tt(FU_QUESTION_KEYS[clarifyQueue[clarifyIndex]])}
                    language={language}
                  />
                  <VoiceInput
                    language={language}
                    maxChars={MAX_CHARS}
                    onConfirm={(text) => setClarifySpoken(text || null)}
                  />
                </div>
                {clarifySpoken && (
                  <p className="mt-2 text-sm text-text-secondary">
                    {tt("scVoiceTitle")}{" "}
                    <span className="font-medium text-text-primary">{clarifySpoken}</span>
                  </p>
                )}
                <p className="mt-2 text-sm text-text-secondary">{tt("scClarifyHint")}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => answerClarify(true)}
                    className="min-h-[56px] rounded-card border border-border bg-surface px-4 text-lg font-semibold text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {tt("scYes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerClarify(false)}
                    className="min-h-[56px] rounded-card border border-border bg-surface px-4 text-lg font-semibold text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {tt("scNo")}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerClarify(null)}
                    className="min-h-[56px] rounded-card border border-border bg-surface px-4 text-lg font-semibold text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {tt("scNotSure")}
                  </button>
                </div>
              </fieldset>
            )}
          </section>
        )}

        {phase === "result" && outcome && (
          <section aria-labelledby="sc-res-h" aria-live="assertive">
            <h1 id="sc-res-h" className="text-xl font-semibold text-text-primary">
              {tt("scResultsHeading")}
            </h1>
            <div
              className={`mt-3 rounded-card border p-4 ${
                outcome.decision.urgency === "emergency"
                  ? "border-error bg-error/10"
                  : outcome.decision.urgency === "urgent"
                    ? "border-warning bg-warning/10"
                    : "border-primary bg-primary/5"
              }`}
            >
              <p className="text-lg font-semibold text-text-primary">
                {tt(URGENCY_LABEL_KEYS[outcome.decision.urgency])}
              </p>
              <p className="mt-1 font-medium text-text-primary">
                {tt(NEXT_ACTION_KEYS[outcome.decision.urgency])}
              </p>
              <p className="mt-3 text-text-primary">
                {tt(outcome.decision.safetyMessageKey)}
              </p>
              <div className="mt-3">
                <VoiceListen
                  text={`${tt(NEXT_ACTION_KEYS[outcome.decision.urgency])}. ${tt(
                    outcome.decision.safetyMessageKey
                  )}`}
                  language={language}
                  label={tt("scListen")}
                />
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-text-secondary">
                {tt("scUnderstanding")}
              </p>
              <p className="mt-1 text-text-primary">
                {answers.concepts.length > 0
                  ? conceptLabels(answers.concepts, language)
                  : tt("safeUncertain")}
              </p>
            </div>

            <p className="mt-4 text-sm text-text-secondary">{tt("scDisclaimer")}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              {outcome.decision.urgency !== "emergency" && (
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setAck(false);
                    setShareError(null);
                    setHandoffOpen(true);
                  }}
                >
                  {tt("scTalkToDoctor")}
                </Button>
              )}
              <Button type="button" size="lg" variant="secondary" onClick={startOver}>
                {tt("scStartOver")}
              </Button>
            </div>
          </section>
        )}
      </Card>

      {/* Navigation footer */}
      {phase !== "intro" && phase !== "result" && phase !== "interpreting" && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (phase === "duration") setPhase("describe");
              else if (phase === "describe") setPhase("feeling");
              else if (phase === "severity") setPhase("duration");
              else setPhase("severity");
            }}
          >
            {tt("scBack")}
          </Button>
          <div className="flex gap-2">
            {phase === "feeling" && (
              <Button type="button" size="lg" onClick={feelingContinue} disabled={!canContinueFeeling}>
                {tt("scContinue")}
              </Button>
            )}
            {phase === "describe" && (
              <>
                <Button type="button" size="lg" variant="secondary" onClick={() => setPhase("duration")}>
                  {tt("scSkip")}
                </Button>
                <Button type="button" size="lg" onClick={describeContinue}>
                  {tt("scContinue")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Consent sheet → existing care-request queue (no new architecture) */}
      {handoffOpen && outcome && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sc-share-h"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl">
            <h2 id="sc-share-h" className="text-lg font-semibold text-text-primary">
              {tt("shareTitle")}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{tt("shareIntro")}</p>

            {!card && (
              <p className="mt-3 rounded-card bg-canvas p-3 text-sm text-text-secondary">
                {tt("shareNoCard")}
              </p>
            )}

            <div className="mt-4 space-y-3">
              <label className="flex min-h-[44px] items-start gap-3 text-sm text-text-primary">
                <input type="checkbox" checked disabled className="mt-0.5 h-5 w-5 rounded border-border" />
                <span>{tt("shareSymptoms")}</span>
              </label>
              {card && card.medications.length > 0 && (
                <label className="flex min-h-[44px] items-start gap-3 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={shareMedicines}
                    onChange={(e) => setShareMedicines(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-border"
                  />
                  <span>
                    {tt("shareMedicines")}
                    <span className="block text-xs text-text-secondary">
                      {card.medications.slice(0, 3).join(", ")}
                      {card.medications.length > 3 ? "…" : ""}
                    </span>
                  </span>
                </label>
              )}
              {card && card.allergies.length > 0 && (
                <label className="flex min-h-[44px] items-start gap-3 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={shareAllergies}
                    onChange={(e) => setShareAllergies(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-border"
                  />
                  <span>
                    {tt("shareAllergies")}
                    <span className="block text-xs text-text-secondary">
                      {card.allergies.slice(0, 3).join(", ")}
                      {card.allergies.length > 3 ? "…" : ""}
                    </span>
                  </span>
                </label>
              )}
              {outcome.engineCategory !== "routine" && (
                <label className="flex min-h-[44px] items-start gap-3 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-border"
                  />
                  <span>{t2(language, "ackEmergencyGuidance")}</span>
                </label>
              )}
            </div>

            {shareError && (
              <p role="alert" className="mt-3 rounded-card bg-warning/10 p-3 text-sm text-text-primary">
                {shareError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                type="button"
                size="lg"
                onClick={() => void confirmShare()}
                loading={sharing}
                disabled={sharing || (outcome.engineCategory !== "routine" && !ack)}
              >
                {tt("shareConfirm")}
              </Button>
              <Button type="button" size="lg" variant="secondary" onClick={() => setHandoffOpen(false)}>
                {tt("scCancel")}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
