/**
 * Part 2 i18n tests: full en/hi/or parity, English fallback, interpolation,
 * and no diagnosis-like wording anywhere in patient-facing strings.
 */

import { describe, it, expect } from "vitest";
import { t2, hasPart2, type Part2Dict } from "@/lib/i18n/part2";

const KEYS = Object.keys({} as Part2Dict) // placeholder replaced below
  ;

// Rebuild the key list from the en dictionary via a tiny trick:
import { t2 as _t2 } from "@/lib/i18n/part2";

const ALL_KEYS: Array<keyof Part2Dict> = (() => {
  // The en dictionary is exported only through t2; enumerate via probe keys.
  // Instead, rely on the Part2Dict type: build a full skeleton object.
  const skeleton: Record<string, string> = {};
  const probe = new Proxy(skeleton, {
    get: () => "",
    has: () => true,
  });
  void probe;
  // Fall back to a compile-time-driven list:
  return [
    "careWizardTitle", "back", "continueLabel", "saveForLaterWizard", "stepOf", "progressLabel",
    "careStartHeading", "careStartIntro", "careStartPrivacy",
    "categoryHeading", "catBreathingOrChest", "catFeverOrInfection", "catPainOrInjury",
    "catStomach", "catPregnancy", "catChildHealth", "catOther",
    "bodyAreaHeading", "bodyHeadFace", "bodyChest", "bodyStomach", "bodyArmLeg", "bodyWhole", "bodyNotSure",
    "describeHeading", "describePlaceholder", "voiceStart", "voiceStop", "voiceUnavailable",
    "voiceListenHint", "transcriptionReviewLabel", "transcriptionReviewHint", "charLimit",
    "interpretationHeading", "interpretationWeUnderstood", "interpretationUncertain",
    "interpretationClarifyPrompt", "interpretationConfirm", "interpretationEdit",
    "followUpsHeading", "fuBreathingWorseAtRest", "fuChestPressureSpreading", "fuBleedingWontStop",
    "fuVomitingCannotKeepFluids", "fuFeverThreeDaysOrMore", "fuHeadacheSuddenWorstEver",
    "fuInjuryFromMajorTrauma", "fuSymptomsSuddenlyWorse", "yes", "no", "notSureAnswer",
    "urgencyHeading", "urgencyEmergency", "urgencyEmergencyHint", "urgencyUrgent", "urgencyUrgentHint",
    "urgencyRoutine", "urgencyRoutineHint", "notADiagnosis", "emergencyGuidanceBlock",
    "ackEmergencyGuidance", "ackedAt",
    "reviewHeading", "reviewWhatYouTold", "reviewSuggestedUrgency", "reviewAttachedRecords",
    "reviewNoRecords", "reviewSaveRequest", "reviewEdit",
    "historyHeading", "histSavedOnDevice", "histWaitingForConnection", "histSyncing", "histSent",
    "histNeedsAttention", "packetSummaryLabel", "packetRulesNote",
    "attachRecordsHeading", "attachOwnedOnly", "attachFileNameDate",
    "wizardErrorGeneric", "wizardOfflineSaved",
  ] as Array<keyof Part2Dict>;
})();

const LANGS = ["en", "hi", "or"] as const;

describe("Part 2 i18n completeness", () => {
  it("every key exists in en, hi, and or (no silent English fallback for hi/or)", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        expect(hasPart2(lang, key), `${lang}.${key} missing`).toBe(true);
      }
    }
  });

  it("all values are non-empty plain strings", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        const v = t2(lang, key);
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it("falls back to English for a missing translation (simulated)", () => {
    // hasPart2 proves parity, but the fallback contract is still enforced:
    // an unknown-language code must not crash and must return usable text.
    const v = t2("xx" as never, "back");
    expect(v).toBe("Back");
  });

  it("interpolates {count} / {current} / {total} / {ids} variables in all languages", () => {
    for (const lang of LANGS) {
      expect(t2(lang, "stepOf", { current: 2, total: 8 })).toMatch(/2/);
      expect(t2(lang, "stepOf", { current: 2, total: 8 })).toMatch(/8/);
      expect(t2(lang, "charLimit", { count: 123 })).toMatch(/123/);
      expect(t2(lang, "packetRulesNote", { ids: "EM-01" })).toContain("EM-01");
    }
  });

  it("emergency guidance is identical in intent across languages (no softening)", () => {
    for (const lang of LANGS) {
      const s = t2(lang, "emergencyGuidanceBlock").toLowerCase();
      // Every language must include both "call/contact emergency number" and
      // "go to emergency facility" semantics. We check script-stable markers:
      const hasCallNow = /emergency|आपातकालीन|ଆପାତକାଳୀନ/.test(s);
      const hasGoNow = /now|अभी|ଏବେ/.test(s) || /nearest|नज़दीकी|ନିକଟତମ/.test(s);
      expect(hasCallNow, `${lang} emergency guidance missing call/facility`).toBe(true);
      expect(hasGoNow, `${lang} emergency guidance missing immediacy`).toBe(true);
    }
  });

  it("no diagnosis-like wording in any patient-facing Part 2 string", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        const v = t2(lang, key).toLowerCase();
        // `notADiagnosis` is the mandatory disclaimer that says the tool does
        // NOT diagnose — so the /diagnos/ pattern is exempt for that key only.
        const diagnosePattern = key === "notADiagnosis" ? /\bdisease\b|dosage|prescrib/ : /\bdiagnos|\bdisease\b|dosage|prescrib/;
        expect(v, `${lang}.${key}`).not.toMatch(diagnosePattern);
        // Hard rules for every string, no exemptions:
        expect(v, `${lang}.${key}`).not.toMatch(/\byou have\b|\byou are safe\b|\bnot serious\b/);
      }
    }
  });

  it("'not sure' options exist for low-literacy safety", () => {
    for (const lang of LANGS) {
      expect(t2(lang, "bodyNotSure").length).toBeGreaterThan(0);
      expect(t2(lang, "notSureAnswer").length).toBeGreaterThan(0);
    }
  });
});
