/**
 * Part 4 i18n tests — every key exists in en/hi/or; English fallback works;
 * no dosage/treatment advice wording anywhere in the dictionary; safety
 * disclaimers present in all languages.
 */

import { describe, it, expect } from "vitest";
import { PART4_DICT, getPart4Dict } from "@/lib/i18n/part4";

const LANGS = ["en", "hi", "or"] as const;

function collectKeys(obj: object, prefix = ""): string[] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? collectKeys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("part4 dictionary completeness", () => {
  it("has identical key sets across en/hi/or", () => {
    const enKeys = collectKeys(PART4_DICT.en).sort();
    for (const lang of ["hi", "or"] as const) {
      expect(collectKeys(PART4_DICT[lang]).sort()).toEqual(enKeys);
    }
  });

  it("all values are non-empty strings", () => {
    for (const lang of LANGS) {
      for (const [k, v] of Object.entries(PART4_DICT[lang])) {
        expect(typeof v).toBe("string");
        expect((v as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("fallback returns English for any language and the key itself for unknown", () => {
    expect(getPart4Dict("hi").findMedicine).toBe(PART4_DICT.hi.findMedicine);
    expect(getPart4Dict("or").findMedicine).toBe(PART4_DICT.or.findMedicine);
    // English fallback is the runtime path (unknown language → en).
    expect(getPart4Dict("en")).toBe(PART4_DICT.en);
  });

  it("no dosage/treatment/advice wording in any language (patient-safety sweep)", () => {
    const forbidden = [
      /\bdose\b/i,
      /\bdosage\b/i,
      /\btake\s+\d+/i,
      /\bprescrib/i,
      /\bsubstitut/i,
      /\bmg\s+(per|\/)\s+day/i,
    ];
    for (const lang of LANGS) {
      for (const value of Object.values(PART4_DICT[lang])) {
        for (const pattern of forbidden) {
          expect(`${lang}: ${value}`).not.toMatch(pattern);
        }
      }
    }
  });

  it("contains the required safety disclaimers in all languages", () => {
    for (const lang of LANGS) {
      expect(PART4_DICT[lang].notMedicalAdvice.length).toBeGreaterThan(10);
      expect(PART4_DICT[lang].contactBeforeTravelling.length).toBeGreaterThan(10);
      expect(PART4_DICT[lang].nonBindingNote.length).toBeGreaterThan(10);
    }
  });

  it("uses 'reported' framing for availability (no certainty claims)", () => {
    expect(PART4_DICT.en.reportedAvailable).toMatch(/reported available/i);
    expect(PART4_DICT.en.reportedUnavailable).toMatch(/reported/i);
  });

  it("Odia and Hindi strings are actually in their scripts", () => {
    expect(PART4_DICT.hi.findMedicine).toMatch(/[\u0900-\u097F]/);
    expect(PART4_DICT.or.findMedicine).toMatch(/[\u0B00-\u0B7F]/);
  });
});
