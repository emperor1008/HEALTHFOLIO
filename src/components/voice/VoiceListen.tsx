"use client";

/**
 * VoiceListen — reusable speech playback control (browser
 * SpeechSynthesis).
 *
 * Contract (spec §8):
 *  - Only plays on an explicit tap — never auto-plays.
 *  - Cancels any in-flight utterance first so playback can't overlap.
 *  - Renders nothing when speech is unsupported or there is no text:
 *    the information itself always stays visible on screen.
 *
 * Zero dependencies; feature-detected at runtime.
 */

import type { Language } from "@/lib/i18n";
import { tPhase2 } from "@/lib/i18n/phase2";
import { isSpeechSynthesisSupported, speakText } from "@/lib/voice/speech";

interface VoiceListenProps {
  text: string;
  language: Language;
  /** Button label override; defaults to the localized "Listen". */
  label?: string;
  className?: string;
}

export function VoiceListen({ text, language, label, className }: VoiceListenProps) {
  // No text or no engine → nothing to offer; the text remains on
  // screen, which is the fallback by design.
  if (!text.trim() || !isSpeechSynthesisSupported()) return null;

  return (
    <button
      type="button"
      onClick={() => {
        speakText(text, language);
      }}
      aria-label={label ?? tPhase2(language, "scListen")}
      className={
        className ??
        "flex min-h-[44px] items-center gap-2 rounded-card border border-border bg-surface px-4 text-base font-medium text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      }
    >
      <span aria-hidden="true">🔊</span>
      {label ?? tPhase2(language, "scListen")}
    </button>
  );
}
