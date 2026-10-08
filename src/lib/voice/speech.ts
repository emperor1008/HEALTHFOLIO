/**
 * Browser Web Speech API helpers — zero dependencies.
 *
 * Both APIs are feature-detected at runtime. Nothing here ever submits,
 * navigates, or plays automatically: callers decide what to do with a
 * transcript (it must always be shown for confirmation first) and speech
 * only happens on an explicit user action.
 */

import type { Language } from "@/lib/i18n";

/** Minimal structural type for the SpeechRecognition implementations
 *  exposed by Chromium (SpeechRecognition) and older WebKit prefixes. */
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: ((event?: unknown) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  speechSynthesis?: SpeechSynthesis;
}

/** Map the app language to a BCP-47 locale the speech engines understand. */
export function speechLocaleFor(language: Language): string {
  if (language === "hi") return "hi-IN";
  if (language === "or") return "or-IN";
  return "en-IN";
}

/**
 * Return the SpeechRecognition constructor when the browser exposes one,
 * or null when unsupported (Firefox, some older Android WebViews).
 */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as SpeechWindow).speechSynthesis?.speak === "function";
}

/**
 * Speak `text` aloud in the given language. Always cancels any in-flight
 * utterance first so overlapping playback can't pile up. Returns true when
 * playback actually started; callers keep the text on screen regardless —
 * speech is an enhancement, never the only channel.
 *
 * `onEnded` fires when playback completes (or fails), so hosts can return
 * from a "speaking" state — turn ownership depends on it (§17).
 */
export function speakText(
  text: string,
  language: Language,
  onEnded?: () => void
): boolean {
  if (!text.trim()) return false;
  try {
    if (!isSpeechSynthesisSupported()) return false;
    const synthesis = (window as unknown as SpeechWindow).speechSynthesis!;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLocaleFor(language);
    // Some engines never fire onend for cancelled/empty utterances;
    // fire onerror too so hosts never stick in "speaking".
    utterance.onend = () => onEnded?.();
    utterance.onerror = () => onEnded?.();
    synthesis.speak(utterance);
    return true;
  } catch {
    // Speech synthesis can throw when no voice is installed — the text
    // remains visible on screen, which is the fallback by design.
    onEnded?.();
    return false;
  }
}

/** Stop any in-flight speech (used on unmount and on user cancel). */
export function stopSpeaking(): void {
  try {
    if (typeof window !== "undefined") {
      (window as unknown as SpeechWindow).speechSynthesis?.cancel();
    }
  } catch {
    /* already stopped or unavailable */
  }
}
