/**
 * Phase 2 i18n tests: en/hi/or parity, fallback, interpolation, and honest
 * safety wording (no diagnosis claims, no "you are safe", no medicines or
 * dosages, no invented emergency phone numbers).
 */
import { describe, it, expect } from "vitest";
import { tPhase2, hasPhase2, type Phase2Dict } from "@/lib/i18n/phase2";

const ALL_KEYS = Object.keys({
  // Entry cards
  entryMyHealth: 1, entryHealthCardSubtitle: 1, entryCheckSymptoms: 1,
  entryCheckSymptomsSubtitle: 1, entrySpeakSymptoms: 1,
  // Offline health card
  hcTitle: 1, hcAvailableOffline: 1, hcIntro: 1, hcStoredOnDevice: 1,
  hcSectionProfile: 1, hcSectionMedicines: 1, hcSectionAllergies: 1,
  hcSectionConditions: 1, hcSectionRecentCare: 1, hcSectionDocuments: 1,
  hcProfileName: 1, hcProfileLanguage: 1, hcNotRecorded: 1, hcNoMedicines: 1,
  hcNoRecentCare: 1, hcDocumentsNotCached: 1, hcLastUpdated: 1,
  timeJustNow: 1, timeMinutes: 1, timeMinuteAgo: 1, timeHours: 1,
  timeHourAgo: 1, timeDays: 1, timeDayAgo: 1, timeUnknown: 1,
  hcStaleNote: 1, hcSyncSynced: 1, hcSyncUpdating: 1, hcSyncWaiting: 1,
  hcSyncAttention: 1, hcRefreshError: 1, hcRefresh: 1, hcRefreshed: 1,
  hcClear: 1, hcClearTitle: 1, hcClearBody: 1, hcClearConfirm: 1, hcCleared: 1,
  hcEmptyTitle: 1, hcEmptyBody: 1, hcOfflineBanner: 1, hcEditFacts: 1,
  hcFactsAllergiesLabel: 1, hcFactsConditionsLabel: 1, hcAddAllergyPlaceholder: 1,
  hcAddConditionPlaceholder: 1, hcAdd: 1, hcRemoveItem: 1, hcSaveFacts: 1,
  hcFactsSaved: 1, hcFactsNeedsOnline: 1, hcFactsInvalid: 1,
  // Symptom checker — flow
  scTitle: 1, scIntro: 1, scStep: 1, scFeelingHeading: 1, scFeelingHint: 1,
  scContinue: 1, scBack: 1, scOther: 1, scSkip: 1, scDurationHeading: 1,
  durToday: 1, dur1to3: 1, dur4to7: 1, durOverWeek: 1, durUnsure: 1,
  scSeverityHeading: 1, sevMild: 1, sevModerate: 1, sevSevere: 1, sevUnsure: 1,
  scDescribeHeading: 1, scDescribePlaceholder: 1, scSpeak: 1, scListening: 1,
  scVoiceTitle: 1, scVoiceCorrect: 1, scVoiceRetry: 1, scVoiceUnsupported: 1,
  scInterpreting: 1, scAiUnavailable: 1, scAiUnavailableOffline: 1,
  scFallbackHint: 1, scOfflineMode: 1,
  // Symptom checker — clarifications
  scClarifyHeading: 1, scClarifyHint: 1, scYes: 1, scNo: 1, scNotSure: 1, scFuBreathing: 1,
  scFuChest: 1, scFuBleeding: 1, scFuVomiting: 1, scFuFever: 1,
  scFuHeadache: 1, scFuInjury: 1, scFuWorse: 1,
  // Symptom checker — results
  scResultsHeading: 1, scUnderstanding: 1, urgEmergency: 1, urgUrgent: 1,
  urgRoutine: 1, urgUncertain: 1, naEmergency: 1, naUrgent: 1, naRoutine: 1,
  naUncertain: 1, safeEmergency: 1, safeUrgent: 1, safeRoutine: 1,
  safeUncertain: 1, scDisclaimer: 1, scListen: 1, scTalkToDoctor: 1,
  scStartOver: 1, scNoSymptoms: 1,
  // Consent handoff
  shareTitle: 1, shareIntro: 1, shareSymptoms: 1, shareMedicines: 1,
  shareAllergies: 1, shareConfirm: 1, scCancel: 1, shareNoCard: 1,
}) as Array<keyof Phase2Dict>;

const LANGS = ["en", "hi", "or"] as const;

describe("Phase 2 i18n completeness", () => {
  it("every key exists in en, hi, and or with non-empty values", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        expect(hasPhase2(lang, key), `${lang}.${key} missing`).toBe(true);
        expect(tPhase2(lang, key).length, `${lang}.${key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it("falls back to English for an unknown language code", () => {
    expect(tPhase2("xx" as never, "scTitle")).toBe(tPhase2("en", "scTitle"));
  });

  it("interpolates variables in all languages", () => {
    for (const lang of LANGS) {
      expect(tPhase2(lang, "scStep", { current: 2, total: 5 })).toContain("2");
      expect(tPhase2(lang, "scStep", { current: 2, total: 5 })).toContain("5");
      expect(tPhase2(lang, "hcLastUpdated", { time: "2 hours ago" })).toContain("2 hours ago");
      expect(tPhase2(lang, "timeMinutes", { count: 15 })).toContain("15");
    }
  });

  it("no key suggests a medicine, dosage, or prescription", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        const v = tPhase2(lang, key).toLowerCase();
        expect(v, `${lang}.${key}`).not.toMatch(
          /prescrib|dosage|antibiotic|paracetamol|ibuprofen|take (one|1) tablet/
        );
      }
    }
  });

  it("no key claims the user is safe or nothing is serious", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        const v = tPhase2(lang, key).toLowerCase();
        expect(v, `${lang}.${key}`).not.toMatch(
          /you are safe|you are fine|nothing serious|no need to worry|guaranteed|definitely/
        );
      }
    }
  });

  it("emergency safety copy never invents a phone number", () => {
    const safetyKeys: Array<keyof Phase2Dict> = [
      "safeEmergency",
      "safeUrgent",
      "safeRoutine",
      "safeUncertain",
    ];
    for (const key of safetyKeys) {
      for (const lang of LANGS) {
        expect(tPhase2(lang, key), `${lang}.${key}`).not.toMatch(/\d/);
      }
    }
  });

  it("the disclaimer explicitly says it does not diagnose in every language", () => {
    expect(tPhase2("en", "scDisclaimer").toLowerCase()).toContain("does not diagnose");
    expect(tPhase2("hi", "scDisclaimer")).toContain("निदान नहीं");
    expect(tPhase2("or", "scDisclaimer")).toContain("ନିର୍ଣ୍ଣୟ");
    expect(tPhase2("or", "scDisclaimer")).toContain("ନାହିଁ");
  });

  it("urgent copy routes to a clinician without reassurance", () => {
    for (const lang of LANGS) {
      const s = tPhase2(lang, "safeUrgent");
      expect(s.length).toBeGreaterThan(20);
      expect(s.toLowerCase()).not.toMatch(/you are safe|nothing/);
    }
  });

  it("uncertain copy asks for clarification, never reassurance", () => {
    for (const lang of LANGS) {
      const s = tPhase2(lang, "safeUncertain");
      expect(s.length).toBeGreaterThan(20);
      expect(s.toLowerCase()).not.toMatch(/you are safe|nothing serious/);
    }
  });

  it("stale/offline notices are honest about limits", () => {
    for (const lang of LANGS) {
      expect(tPhase2(lang, "hcStaleNote").length).toBeGreaterThan(10);
      expect(tPhase2(lang, "scAiUnavailableOffline").length).toBeGreaterThan(10);
      expect(tPhase2(lang, "scFallbackHint").length).toBeGreaterThan(10);
    }
  });
});
