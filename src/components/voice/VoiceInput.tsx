"use client";

/**
 * VoiceInput — reusable speech-to-text control (browser Web Speech API).
 *
 * Safety contract (spec §7):
 *  - Recognition results are ALWAYS shown as an editable transcript
 *    ("You said:") before anything is submitted.
 *  - Nothing is ever submitted silently — the patient taps "Correct"
 *    to accept, "Try again" to re-record, or "Cancel" to discard.
 *  - Unsupported browsers get an honest visible notice (and typing
 *    always remains available).
 *
 * Zero dependencies; feature-detected at runtime.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Language } from "@/lib/i18n";
import { tPhase2, type Phase2Dict } from "@/lib/i18n/phase2";
import {
  getSpeechRecognitionCtor,
  speechLocaleFor,
  type SpeechRecognitionLike,
} from "@/lib/voice/speech";

type VoiceState = "idle" | "listening" | "reviewing" | "unsupported";

/**
 * Imperative control for hosts that drive recognition from a
 * conversation controller (the voice assistant). Optional —
 * standalone use needs only the button.
 */
export interface VoiceInputHandle {
  /** Start a listening turn. False when unsupported. */
  start: () => boolean;
  /** Stop recognition; the transcript moves to review. */
  stop: () => void;
}

interface VoiceInputProps {
  language: Language;
  /**
   * Called only when the patient explicitly accepts the transcript.
   * The argument is the confirmed (possibly edited) text.
   */
  onConfirm: (text: string) => void;
  maxChars?: number;
  /** Recognition ended without a final result (partial preserved). */
  onRecognitionEnd?: (partial: string) => void;
  /** Recognition failed (not the same as unsupported browser). */
  onRecognitionError?: () => void;
  /**
   * Host-controlled start (turn ownership). When provided, the
   * mic button delegates here so the conversation controller
   * arms its dead-air/session timeouts and state machine;
   * when absent the local start is used directly.
   */
  onStart?: () => boolean;
}

export const VoiceInput = forwardRef<VoiceInputHandle, VoiceInputProps>(
  function VoiceInput({
    language,
    onConfirm,
    maxChars = 500,
    onRecognitionEnd,
    onRecognitionError,
    onStart,
  }, ref) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mountedRef = useRef(true);
  const transcriptRef = useRef("");

  const tt = (key: keyof Phase2Dict) => tPhase2(language, key);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    start: () => startInternal(),
    stop: () => {
      stopInternal();
    },
  }));

  const startInternal = (): boolean => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setState("unsupported");
      return false;
    }
    const rec = new Ctor();
    rec.lang = speechLocaleFor(language);
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i += 1) {
        text += e.results[i][0].transcript;
      }
      const sliced = text.slice(0, maxChars);
      transcriptRef.current = sliced;
      if (mountedRef.current) setTranscript(sliced);
    };
    rec.onerror = () => {
      // Distinguish a failed turn from an unsupported browser so
      // hosts can show the right recovery message (spec §63, §64).
      onRecognitionError?.();
      if (mountedRef.current) setState("idle");
    };
    rec.onend = () => {
      if (mountedRef.current) {
        setState((s) => (s === "listening" ? "reviewing" : s));
      }
      // Hand the partial/final transcript back: it is preserved
      // for review instead of being thrown away (spec §89, §90).
      onRecognitionEnd?.(transcriptRef.current);
    };
    recognitionRef.current = rec;
    transcriptRef.current = "";
    setTranscript("");
    setState("listening");
    try {
      rec.start();
    } catch {
      setState("unsupported");
      return false;
    }
    return true;
  };

  const stopInternal = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setState("reviewing");
  };

  /** Patient accepted the transcript — hand it to the parent. */
  const confirm = () => {
    const text = transcript.slice(0, maxChars);
    setState("idle");
    setTranscript("");
    onConfirm(text);
  };

  const retry = () => {
    setTranscript("");
    transcriptRef.current = "";
    startInternal();
  };

  const discard = () => {
    setTranscript("");
    setState("idle");
  };

  return (
    <div className="voice-input">
      {(state === "idle" || state === "unsupported") && (
        <button
          type="button"
          onClick={() => {
            if (onStart) {
              onStart();
            } else {
              startInternal();
            }
          }}
          className="flex min-h-[44px] items-center gap-2 rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden="true">🎤</span>
          {tt("scSpeak")}
        </button>
      )}

      {state === "listening" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => stopInternal()}
            aria-label={tt("scListening")}
            className="flex min-h-[44px] items-center gap-2 rounded-card border border-primary bg-primary/10 px-4 text-base font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary"
              aria-hidden="true"
            />
            {tt("scListening")}
          </button>
        </div>
      )}

      {/* role="status" has implicit aria-live="polite", so screen readers
          announce state changes without a duplicate sr-only copy (which would
          also make testing-library find the same string twice). */}
      {state === "listening" && (
        <p role="status" className="mt-2 text-sm text-text-secondary">
          {tt("scListening")}
        </p>
      )}
      {state === "unsupported" && (
        <p role="status" className="mt-2 text-sm text-text-secondary">
          {tt("scVoiceUnsupported")}
        </p>
      )}

      {state === "reviewing" && (
        <fieldset className="mt-3 rounded-card border border-border p-3">
          <legend className="px-1 text-sm font-semibold text-text-primary">
            {tt("scVoiceTitle")}
          </legend>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value.slice(0, maxChars))}
            rows={3}
            aria-label={tt("scVoiceTitle")}
            className="w-full rounded-card border border-border bg-surface p-2 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              className="flex min-h-[44px] items-center rounded-card bg-primary px-4 text-base font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {tt("scVoiceCorrect")}
            </button>
            <button
              type="button"
              onClick={retry}
              className="flex min-h-[44px] items-center rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {tt("scVoiceRetry")}
            </button>
            <button
              type="button"
              onClick={discard}
              className="flex min-h-[44px] items-center rounded-card px-4 text-base font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {tt("scCancel")}
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
});

