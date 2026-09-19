"use client";

/**
 * Care-request wizard (Part 2) — one question per screen, low-literacy
 * friendly, works fully offline.
 *
 * SAFETY
 * - Triage result comes from the deterministic engine (red-flags.ts) only.
 * - Interpretation is shown as "We understood this as: [broad concept]" and
 *   can be rejected/corrected; uncertain text never guesses.
 * - Emergency outcome always shows the emergency guidance block and requires
 *   explicit acknowledgement before review/submit. Continuing after the
 *   notice never hides or delays the emergency instruction.
 * - Packet contains ONLY user-confirmed data (see packet.ts).
 * - Save works offline via the Part 1 queue; "sent" only after server ack.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import { t2 } from "@/lib/i18n/part2";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSync } from "@/lib/offline/sync-provider";
import {
  SYMPTOM_CATEGORIES,
  BODY_AREAS,
  SYMPTOM_CONCEPTS,
  type SymptomCategory,
  type BodyArea,
  type AgeGroup,
  type SymptomConcept,
} from "@/lib/triage/concepts";
import { normalizeSymptomText } from "@/lib/triage/normalizer";
import {
  evaluateTriage,
  suggestedFollowUps,
  type TriageCategory,
  type FollowUpId,
} from "@/lib/triage/red-flags";
import { PacketSchema, newPacketSkeleton, type CareRequestPacket } from "@/lib/triage/packet";

const MAX_CHARS = 500;

type StepId =
  | "start"
  | "category"
  | "body"
  | "describe"
  | "interpretation"
  | "followups"
  | "urgency"
  | "records"
  | "review";

const STEPS: StepId[] = [
  "start",
  "category",
  "body",
  "describe",
  "interpretation",
  "followups",
  "urgency",
  "records",
  "review",
];

interface WizardAnswers {
  category: SymptomCategory | null;
  bodyArea: BodyArea | null;
  text: string;
  ageGroup: AgeGroup | null;
  /** Concepts confirmed by the user (normalizer suggestions + manual picks). */
  confirmedConcepts: SymptomConcept[];
  followUps: Partial<Record<FollowUpId, boolean>>;
  linkedDocumentIds: string[];
  ack: boolean;
}

const EMPTY_ANSWERS: WizardAnswers = {
  category: null,
  bodyArea: null,
  text: "",
  ageGroup: null,
  confirmedConcepts: [],
  followUps: {},
  linkedDocumentIds: [],
  ack: false,
};

/** Plain-language labels for each broad concept per language. */
const CONCEPT_LABELS: Record<SymptomConcept, Record<"en" | "hi" | "or", string>> = {
  chest_discomfort: { en: "chest discomfort", hi: "सीने में दबाव/दर्द", or: "ଛାତିରେ ଅସ୍ୱାଭାବିକତା" },
  difficulty_breathing: { en: "difficulty breathing", hi: "सांस लेने में दिक्कत", or: "ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ" },
  fever: { en: "fever", hi: "बुखार", or: "ଜ୍ୱର" },
  fainting: { en: "fainting or collapse", hi: "बेहोशी या गिर जाना", or: "ଅଜ୍ଞାନ ହେବା" },
  severe_bleeding: { en: "severe bleeding", hi: "बहुत खून बहना", or: "ପ୍ରଚଣ୍ଡ ରକ୍ତସ୍ରାବ" },
  weakness_one_side: { en: "weakness on one side of the body", hi: "शरीर के एक तरफ कमज़ोरी", or: "ଶରୀରର ଗୋଟିଏ ପାଖରେ ଦୁର୍ବଳତା" },
  severe_headache: { en: "severe headache", hi: "तेज़ सिरदर्द", or: "ପ୍ରଚଣ୍ଡ ମୁଣ୍ଡ ବୁରୁଡ଼" },
  vomiting: { en: "vomiting", hi: "उल्टी", or: "ବାନ୍ତି" },
  pregnancy_concern: { en: "pregnancy-related concern", hi: "गर्भावस्था से जुड़ी समस्या", or: "ଗର୍ଭାବସ୍ଥା ସମ୍ବନ୍ଧୀୟ ସମସ୍ୟା" },
  injury: { en: "injury", hi: "चोट", or: "ଆଘାତ" },
  abdominal_pain: { en: "stomach pain", hi: "पेट दर्द", or: "ପେଟ ଯନ୍ତ୍ରଣା" },
};

const CATEGORY_ICON: Record<SymptomCategory, string> = {
  breathing_or_chest: "🫁",
  fever_or_infection: "🌡️",
  pain_or_injury: "🩹",
  stomach_concern: "🫂",
  pregnancy_related: "🤰",
  child_health: "🧒",
  other: "📝",
};

interface CareRequestWizardProps {
  onClose?: () => void;
  onSaved?: (result: { queued: boolean; packetId: string }) => void;
}

export function CareRequestWizard({ onClose, onSaved }: CareRequestWizardProps) {
  const { language, t } = useLanguage();
  const { online, enqueueCareRequestPacket } = useSync();
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(EMPTY_ANSWERS);
  const [triage, setTriage] = useState<{
    category: TriageCategory;
    ruleIds: string[];
    rulesVersion: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Synchronous double-submit guard: two rapid taps must not enqueue twice. */
  const submittingRef = useRef(false);

  const step = STEPS[stepIndex];
  const total = STEPS.length;

  const tt = useCallback(
    (key: Parameters<typeof t2>[1], vars?: Record<string, string | number>) => t2(language, key, vars),
    [language]
  );

  // ── Voice capture (browser speech-to-text only; typed fallback always) ──
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "reviewing" | "unsupported">("idle");
  const [draftTranscript, setDraftTranscript] = useState("");

  const startVoice = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceState("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.lang = language === "hi" ? "hi-IN" : language === "or" ? "or-IN" : "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i += 1) {
        text += e.results[i][0].transcript;
      }
      setDraftTranscript(text.slice(0, MAX_CHARS));
    };
    rec.onerror = () => setVoiceState("unsupported");
    rec.onend = () => {
      setVoiceState((s) => (s === "listening" ? "reviewing" : s));
    };
    recognitionRef.current = rec;
    setDraftTranscript("");
    setVoiceState("listening");
    try {
      rec.start();
    } catch {
      setVoiceState("unsupported");
    }
  }, [language]);

  const stopVoice = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setVoiceState("reviewing");
  }, []);

  const confirmTranscript = useCallback(() => {
    setAnswers((a) => ({ ...a, text: draftTranscript }));
    setVoiceState("idle");
  }, [draftTranscript]);

  const discardTranscript = useCallback(() => {
    setDraftTranscript("");
    setVoiceState("idle");
  }, []);

  // ── Normalization preview for the interpretation step ───────────────────
  const normalization = useMemo(
    () => normalizeSymptomText(answers.text),
    [answers.text]
  );

  // Advance to follow-ups/urgency uses confirmed concepts.
  const triageInput = useMemo(
    () => ({
      concepts: answers.confirmedConcepts,
      category: answers.category,
      bodyArea: answers.bodyArea,
      followUps: answers.followUps,
      ageGroup: answers.ageGroup,
    }),
    [answers]
  );

  const followUpIds = useMemo(() => suggestedFollowUps(triageInput), [triageInput]);

  const runTriage = useCallback(() => {
    const result = evaluateTriage(triageInput);
    setTriage({
      category: result.category,
      ruleIds: result.triggered.map((r) => r.id),
      rulesVersion: result.rulesVersion,
    });
  }, [triageInput]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (step === "describe" && normalization.concepts.length > 0 && !normalization.uncertain) {
      // Pre-select suggested concepts; the user confirms them on the next screen.
      setAnswers((a) => ({ ...a, confirmedConcepts: normalization.concepts }));
    }
    if (step === "followups") {
      // Triage runs deterministically before the urgency screen is shown.
      runTriage();
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [step, normalization, runTriage]);

  const goBack = useCallback(() => {
    setSaveError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const canContinue = useCallback((): boolean => {
    switch (step) {
      case "start":
        return true;
      case "category":
        return answers.category !== null;
      case "body":
        return answers.bodyArea !== null;
      case "describe":
        return true; // free text is optional
      case "interpretation":
        return answers.confirmedConcepts.length > 0;
      case "followups":
        return true;
      case "urgency":
        // Emergency/urgent guidance must be acknowledged before continuing.
        if (!triage) return false;
        return triage.category === "routine" || answers.ack;
      case "records":
        return true;
      case "review":
        return triage !== null;
    }
  }, [step, answers, triage]);

  // ── Save (online submit or offline queue) ───────────────────────────────
  const save = useCallback(async () => {
    if (!triage) return;
    if (submittingRef.current) return; // duplicate tap protection
    submittingRef.current = true;
    setSaving(true);
    setSaveError(null);
    const packet: CareRequestPacket = {
      ...newPacketSkeleton({ language }),
      symptom_text_original: answers.text.trim() ? answers.text : null,
      symptom_concepts: answers.confirmedConcepts,
      body_area: answers.bodyArea,
      symptom_category: answers.category,
      follow_up_answers: Object.fromEntries(
        Object.entries(answers.followUps).filter(([, v]) => typeof v === "boolean")
      ) as Partial<Record<FollowUpId, boolean>>,
      age_group: answers.ageGroup,
      triage_category: triage.category,
      triage_rules_version: triage.rulesVersion,
      triage_rule_ids: triage.ruleIds,
      linked_document_ids: answers.linkedDocumentIds,
      acknowledged_emergency_guidance: answers.ack,
      summary: buildSummary(language, answers, triage.category),
    };
    // Defense in depth: never enqueue a packet that fails the shared schema.
    const check = PacketSchema.safeParse(packet);
    if (!check.success) {
      setSaving(false);
      setSaveError(tt("wizardErrorGeneric"));
      return;
    }
    try {
      await enqueueCareRequestPacket({ language, packet });
      onSaved?.({ queued: true, packetId: packet.packet_id });
      router.push("/care-requests?saved=offline");
    } catch {
      setSaveError(tt("wizardErrorGeneric"));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }, [answers, triage, language, enqueueCareRequestPacket, onSaved, router, tt]);

  // ── Step renderers ──────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {/* Progress header */}
      <div>
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span aria-hidden="true">{tt("careWizardTitle")}</span>
          <span>{tt("stepOf", { current: stepIndex + 1, total })}</span>
        </div>
        <div
          role="progressbar"
          aria-label={tt("progressLabel")}
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <Card padding="lg" className="min-h-[320px]">
        {step === "start" && (
          <section aria-labelledby="care-start-h">
            <h2 id="care-start-h" className="text-xl font-semibold text-text-primary">
              {tt("careStartHeading")}
            </h2>
            <p className="mt-3 text-text-secondary">{tt("careStartIntro")}</p>
            <p className="mt-2 text-sm text-text-secondary">{tt("careStartPrivacy")}</p>
            <p className="mt-4 rounded-card bg-canvas p-3 text-sm text-text-secondary">
              {t("notMedicalAdvice")}
            </p>
          </section>
        )}

        {step === "category" && (
          <section aria-labelledby="cat-h">
            <h2 id="cat-h" className="text-xl font-semibold text-text-primary">
              {tt("categoryHeading")}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SYMPTOM_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setAnswers((a) => ({
                      ...a,
                      category: c,
                      // The user's own category choice declares the age group
                      // (user-confirmed, only where a safety rule may need it).
                      ageGroup: c === "child_health" ? ("child" as AgeGroup) : null,
                    }))
                  }
                  aria-pressed={answers.category === c}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-card border border-border bg-surface p-4 text-left font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span aria-hidden="true" className="text-2xl">{CATEGORY_ICON[c]}</span>
                  <span>{categoryLabel(c, language)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "body" && (
          <section aria-labelledby="body-h">
            <h2 id="body-h" className="text-xl font-semibold text-text-primary">
              {tt("bodyAreaHeading")}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BODY_AREAS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, bodyArea: b }))}
                  aria-pressed={answers.bodyArea === b}
                  className="flex min-h-[56px] w-full items-center justify-center rounded-card border border-border bg-surface p-3 font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {bodyLabel(b, language)}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "describe" && (
          <section aria-labelledby="desc-h">
            <h2 id="desc-h" className="text-xl font-semibold text-text-primary">
              {tt("describeHeading")}
            </h2>
            <textarea
              value={answers.text}
              onChange={(e) => setAnswers((a) => ({ ...a, text: e.target.value.slice(0, MAX_CHARS) }))}
              placeholder={tt("describePlaceholder")}
              maxLength={MAX_CHARS}
              rows={4}
              aria-describedby="desc-limit"
              className="mt-4 w-full rounded-card border border-border bg-surface p-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <p id="desc-limit" className="mt-1 text-sm text-text-secondary">
              {tt("charLimit", { count: MAX_CHARS - answers.text.length })}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {voiceState === "idle" && (
                <Button type="button" variant="secondary" onClick={startVoice}>
                  {tt("voiceStart")}
                </Button>
              )}
              {voiceState === "listening" && (
                <Button type="button" variant="secondary" onClick={stopVoice}>
                  {tt("voiceStop")}
                </Button>
              )}
            </div>
            {voiceState === "listening" && (
              <p className="mt-2 text-sm text-text-secondary">{tt("voiceListenHint")}</p>
            )}
            {voiceState === "unsupported" && (
              <p role="status" className="mt-2 text-sm text-text-secondary">
                {tt("voiceUnavailable")}
              </p>
            )}
            {(voiceState === "reviewing" || draftTranscript.length > 0) && (
              <fieldset className="mt-4 rounded-card border border-border p-3">
                <legend className="px-1 text-sm font-semibold text-text-primary">
                  {tt("transcriptionReviewLabel")}
                </legend>
                <textarea
                  value={draftTranscript}
                  onChange={(e) => setDraftTranscript(e.target.value.slice(0, MAX_CHARS))}
                  rows={3}
                  aria-label={tt("transcriptionReviewLabel")}
                  className="w-full rounded-card border border-border bg-surface p-2 text-base"
                />
                <p className="mt-1 text-sm text-text-secondary">{tt("transcriptionReviewHint")}</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={confirmTranscript}>
                    {tt("interpretationConfirm")}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={discardTranscript}>
                    {t("cancel")}
                  </Button>
                </div>
              </fieldset>
            )}
          </section>
        )}

        {step === "interpretation" && (
          <section aria-labelledby="interp-h" aria-live="polite">
            <h2 id="interp-h" className="text-xl font-semibold text-text-primary">
              {tt("interpretationHeading")}
            </h2>
            {normalization.concepts.length === 0 || normalization.uncertain ? (
              <div className="mt-4">
                <p className="text-text-secondary">{tt("interpretationUncertain")}</p>
                <p className="mt-2 text-sm text-text-secondary">{tt("interpretationClarifyPrompt")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SYMPTOM_CONCEPTS.map((c) => {
                    const active = answers.confirmedConcepts.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setAnswers((a) => ({
                            ...a,
                            confirmedConcepts: active
                              ? a.confirmedConcepts.filter((x) => x !== c)
                              : [...a.confirmedConcepts, c],
                          }))
                        }
                        className="min-h-[44px] rounded-full border border-border px-4 text-sm font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {CONCEPT_LABELS[c][language]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-text-secondary">
                  {tt("interpretationWeUnderstood", {
                    concept: answers.confirmedConcepts
                      .map((c) => CONCEPT_LABELS[c][language])
                      .join(", "),
                  })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SYMPTOM_CONCEPTS.map((c) => {
                    const active = answers.confirmedConcepts.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setAnswers((a) => ({
                            ...a,
                            confirmedConcepts: active
                              ? a.confirmedConcepts.filter((x) => x !== c)
                              : [...a.confirmedConcepts, c],
                          }))
                        }
                        className="min-h-[44px] rounded-full border border-border px-4 text-sm font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {CONCEPT_LABELS[c][language]}
                      </button>
                      );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {step === "followups" && (
          <section aria-labelledby="fu-h">
            <h2 id="fu-h" className="text-xl font-semibold text-text-primary">
              {tt("followUpsHeading")}
            </h2>
            <div className="mt-4 space-y-4">
              {followUpIds.map((id) => (
                <fieldset key={id} className="rounded-card border border-border p-3">
                  <legend className="px-1 text-sm font-medium text-text-primary">
                    {followUpLabel(id, language)}
                  </legend>
                  <div className="mt-1 flex gap-2">
                    {([true, false] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        aria-pressed={answers.followUps[id] === v}
                        onClick={() => setAnswers((a) => ({ ...a, followUps: { ...a.followUps, [id]: v } }))}
                        className="min-h-[44px] min-w-[64px] rounded-card border border-border px-4 text-sm font-semibold text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {v ? tt("yes") : tt("no")}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              {followUpIds.length === 0 && (
                <p className="text-text-secondary">{tt("interpretationClarifyPrompt")}</p>
              )}
            </div>
          </section>
        )}

        {step === "urgency" && (
          <section aria-labelledby="urg-h" aria-live="assertive">
            {!triage && <p className="text-text-secondary">…</p>}
            {triage && (
              <>
                <h2 id="urg-h" className="text-xl font-semibold text-text-primary">
                  {tt("urgencyHeading")}
                </h2>
                <div
                  className={`mt-3 rounded-card border p-4 ${
                    triage.category === "emergency"
                      ? "border-error bg-error/10"
                      : triage.category === "urgent"
                        ? "border-warning bg-warning/10"
                        : "border-primary bg-primary/5"
                  }`}
                >
                  <p className="text-lg font-semibold text-text-primary">
                    {triage.category === "emergency"
                      ? tt("urgencyEmergency")
                      : triage.category === "urgent"
                        ? tt("urgencyUrgent")
                        : tt("urgencyRoutine")}
                  </p>
                  <p className="mt-2 text-text-secondary">
                    {triage.category === "emergency"
                      ? tt("urgencyEmergencyHint")
                      : triage.category === "urgent"
                        ? tt("urgencyUrgentHint")
                        : tt("urgencyRoutineHint")}
                  </p>
                  {(triage.category === "emergency" || triage.category === "urgent") && (
                    <p className="mt-3 rounded-card border border-error bg-error/10 p-3 font-medium text-text-primary">
                      {tt("emergencyGuidanceBlock")}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-text-secondary">{tt("notADiagnosis")}</p>
                  {triage.category !== "routine" && (
                    <label className="mt-3 flex min-h-[44px] items-start gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={answers.ack}
                        onChange={(e) => setAnswers((a) => ({ ...a, ack: e.target.checked }))}
                        className="mt-0.5 h-5 w-5 rounded border-border"
                      />
                      <span>{tt("ackEmergencyGuidance")}</span>
                    </label>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {step === "records" && (
          <section aria-labelledby="rec-h">
            <h2 id="rec-h" className="text-xl font-semibold text-text-primary">
              {tt("attachRecordsHeading")}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{tt("attachOwnedOnly")}</p>
            <RecordPicker
              language={language}
              selected={answers.linkedDocumentIds}
              onChange={(ids) => setAnswers((a) => ({ ...a, linkedDocumentIds: ids }))}
            />
          </section>
        )}

        {step === "review" && triage && (
          <section aria-labelledby="rev-h">
            <h2 id="rev-h" className="text-xl font-semibold text-text-primary">
              {tt("reviewHeading")}
            </h2>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-sm font-medium text-text-secondary">{tt("reviewWhatYouTold")}</dt>
                <dd className="text-text-primary">
                  {answers.text.trim() ? answers.text : "—"}
                  {answers.confirmedConcepts.length > 0 && (
                    <span className="block text-sm text-text-secondary">
                      {answers.confirmedConcepts.map((c) => CONCEPT_LABELS[c][language]).join(", ")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-text-secondary">{tt("reviewSuggestedUrgency")}</dt>
                <dd>
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                      triage.category === "emergency"
                        ? "bg-error/10 text-error"
                        : triage.category === "urgent"
                          ? "bg-warning/10 text-warning"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {triage.category === "emergency"
                      ? tt("urgencyEmergency")
                      : triage.category === "urgent"
                        ? tt("urgencyUrgent")
                        : tt("urgencyRoutine")}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-text-secondary">{tt("reviewAttachedRecords")}</dt>
                <dd className="text-text-primary">
                  {answers.linkedDocumentIds.length === 0
                    ? tt("reviewNoRecords")
                    : `${answers.linkedDocumentIds.length}`}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-text-secondary">{tt("notADiagnosis")}</p>
            {saveError && (
              <p role="alert" className="mt-3 rounded-card bg-warning/10 p-3 text-text-primary">
                {saveError}
              </p>
            )}
          </section>
        )}
      </Card>

      {/* Footer controls: Back / Save-for-later / Continue or Save */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
        <Button
          type="button"
          variant="ghost"
          onClick={goBack}
          disabled={stepIndex === 0 || saving}
        >
          {tt("back")}
        </Button>
        <div className="flex gap-2">
          {step === "review" ? (
            <Button type="button" size="lg" onClick={save} loading={saving} disabled={!triage}>
              {tt("reviewSaveRequest")}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={goNext} disabled={!canContinue()}>
              {tt("continueLabel")}
            </Button>
          )}
          {onClose && step === "start" && (
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pick from records the user already owns (server list + queue-safe). */
function RecordPicker({
  language,
  selected,
  onChange,
}: {
  language: "en" | "hi" | "or";
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [docs, setDocs] = useState<Array<{ id: string; file_name: string; created_at: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const tt = (key: Parameters<typeof t2>[1], vars?: Record<string, string | number>) =>
    t2(language, key, vars);

  useEffect(() => {
    let alive = true;
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { documents?: Array<{ id: string; file_name: string; created_at: string }> } | null) => {
        if (alive && data?.documents) setDocs(data.documents);
        if (alive) setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true); // offline: honest empty list
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded) return <p className="mt-4 text-sm text-text-secondary">…</p>;

  if (docs.length === 0) {
    return <p className="mt-4 text-sm text-text-secondary">{tt("reviewNoRecords")}</p>;
  }

  return (
    <ul className="mt-4 space-y-2">
      {docs.map((d) => {
        const checked = selected.includes(d.id);
        return (
          <li key={d.id}>
            <label className="flex min-h-[56px] items-center gap-3 rounded-card border border-border bg-surface p-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(checked ? selected.filter((x) => x !== d.id) : [...selected, d.id])
                }
                className="h-5 w-5 rounded border-border"
              />
              <span className="text-text-primary">
                {tt("attachFileNameDate", {
                  name: d.file_name,
                  date: new Date(d.created_at).toLocaleDateString(),
                })}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Label helpers (plain language, per-language) ──────────────────────────
function categoryLabel(c: SymptomCategory, lang: "en" | "hi" | "or"): string {
  switch (c) {
    case "breathing_or_chest": return t2(lang, "catBreathingOrChest");
    case "fever_or_infection": return t2(lang, "catFeverOrInfection");
    case "pain_or_injury": return t2(lang, "catPainOrInjury");
    case "stomach_concern": return t2(lang, "catStomach");
    case "pregnancy_related": return t2(lang, "catPregnancy");
    case "child_health": return t2(lang, "catChildHealth");
    case "other": return t2(lang, "catOther");
  }
}
function bodyLabel(b: BodyArea, lang: "en" | "hi" | "or"): string {
  switch (b) {
    case "head_face": return t2(lang, "bodyHeadFace");
    case "chest": return t2(lang, "bodyChest");
    case "stomach": return t2(lang, "bodyStomach");
    case "arm_leg": return t2(lang, "bodyArmLeg");
    case "whole_body": return t2(lang, "bodyWhole");
    case "not_sure": return t2(lang, "bodyNotSure");
  }
}
function followUpLabel(id: FollowUpId, lang: "en" | "hi" | "or"): string {
  switch (id) {
    case "breathing_worse_at_rest": return t2(lang, "fuBreathingWorseAtRest");
    case "chest_pressure_spreading": return t2(lang, "fuChestPressureSpreading");
    case "bleeding_wont_stop": return t2(lang, "fuBleedingWontStop");
    case "vomiting_cannot_keep_fluids": return t2(lang, "fuVomitingCannotKeepFluids");
    case "fever_three_days_or_more": return t2(lang, "fuFeverThreeDaysOrMore");
    case "headache_sudden_worst_ever": return t2(lang, "fuHeadacheSuddenWorstEver");
    case "injury_from_major_trauma": return t2(lang, "fuInjuryFromMajorTrauma");
    case "symptoms_suddenly_worse": return t2(lang, "fuSymptomsSuddenlyWorse");
  }
}

function buildSummary(
  language: "en" | "hi" | "or",
  answers: WizardAnswers,
  category: TriageCategory
): string {
  const conceptText = answers.confirmedConcepts
    .slice(0, 4)
    .map((c) => CONCEPT_LABELS[c][language])
    .join(", ");
  const urgencyWord =
    category === "emergency" ? "EMERGENCY" : category === "urgent" ? "Urgent" : "Routine";
  if (language === "en") {
    const parts: string[] = [];
    if (conceptText) parts.push(`Concerns: ${conceptText}.`);
    if (answers.text.trim()) parts.push(`In their words: "${answers.text.trim().slice(0, 200)}"`);
    parts.push(`Suggested urgency: ${urgencyWord}.`);
    return parts.join(" ").slice(0, 480);
  }
  if (language === "hi") {
    const parts: string[] = [];
    if (conceptText) parts.push(`समस्या: ${conceptText}.`);
    if (answers.text.trim()) parts.push(`उनके शब्दों में: "${answers.text.trim().slice(0, 200)}"`);
    parts.push(`सुझाया स्तर: ${urgencyWord}.`);
    return parts.join(" ").slice(0, 480);
  }
  const parts: string[] = [];
  if (conceptText) parts.push(`ସମସ୍ୟା: ${conceptText}.`);
  if (answers.text.trim()) parts.push(`ନିଜ ଶବ୍ଦରେ: "${answers.text.trim().slice(0, 200)}"`);
  parts.push(`ପରାମର୍ଶିତ ସ୍ତର: ${urgencyWord}.`);
  return parts.join(" ").slice(0, 480);
}
