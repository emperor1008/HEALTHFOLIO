"use client";

/**
 * First-use language choice. Shown once per device (until a choice is
 * stored), large touch targets, no account requirement.
 */

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { LANGUAGES, LANGUAGE_LABELS } from "@/lib/i18n";
import type { Language } from "@/lib/i18n";

const STORAGE_KEY = "healthfolio.language";
const DISMISSED_KEY = "healthfolio.languagePromptDismissed";

export function FirstUseLanguageChooser() {
  const { setLanguage, t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const alreadyChosen = window.localStorage.getItem(STORAGE_KEY);
      const dismissed = window.localStorage.getItem(DISMISSED_KEY);
      if (!alreadyChosen && !dismissed) setVisible(true);
    } catch {
      // Storage unavailable (private mode): never block the app.
    }
  }, []);

  function choose(lang: Language) {
    setLanguage(lang);
    setVisible(false);
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t("languageSettings")}
      className="rounded-2xl border border-sage-border bg-sage-surface p-5"
    >
      <p className="text-base font-semibold text-text-primary">
        {t("languageSettings")}
      </p>
      <p className="mt-1 text-sm text-text-secondary">
        {t("languageSettingsHint")}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {LANGUAGES.map((lang: Language) => (
          <button
            key={lang}
            type="button"
            onClick={() => choose(lang)}
            className="flex min-h-[56px] items-center justify-center rounded-2xl border border-primary/25 bg-surface px-4 text-base font-semibold text-text-primary transition hover:border-primary/60 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {LANGUAGE_LABELS[lang]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3 min-h-[44px] rounded-full px-3 text-sm text-text-secondary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {t("removeDraftConfirmNo")}
      </button>
    </div>
  );
}
