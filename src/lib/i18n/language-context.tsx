/**
 * Language context. Persists the choice locally (always available offline)
 * and best-effort syncs it to the profile API when online.
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  resolveLanguage,
  translate,
  type Dict,
  type Language,
} from "./index";
import { tryEnqueueLanguagePreference } from "@/lib/offline/sync-provider";

const STORAGE_KEY = "healthfolio.language";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // localStorage can throw in private modes; fall through to navigator hint
  }
  if (typeof navigator !== "undefined") {
    const nav = (navigator as Navigator & { language?: string; languages?: readonly string[] });
    if (nav.language) return resolveLanguage(nav.language);
    if (nav.languages?.length) return resolveLanguage(nav.languages[0]);
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLanguageState(readStoredLanguage());
    setHydrated(true);
  }, []);

  const setLanguage = useCallback(
    (lang: Language) => {
      setLanguageState(lang);
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // ignore storage failures — preference still applies for the session
      }
      // Sync to the server when possible; when offline (or the PATCH fails)
      // queue it so the preference still reaches the profile after reconnect.
      // Note: SyncProvider is mounted alongside LanguageProvider, so the
      // bridge is usually available; if not, the local choice still applies.
      try {
        void fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferred_language: lang }),
        })
          .then((res) => {
            if (!res.ok) tryEnqueueLanguagePreference(lang);
          })
          .catch(() => {
            tryEnqueueLanguagePreference(lang);
          });
      } catch {
        tryEnqueueLanguagePreference(lang);
      }
    },
    []
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language]
  );

  // Prevent language flash before hydration completes on first paint.
  const hidden = !hydrated;
  return <LanguageContext.Provider value={value}>{hidden ? null : children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
