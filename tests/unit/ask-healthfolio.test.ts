import { describe, it, expect } from "vitest";
import { normalizeQuery } from "../../src/lib/assistant/normalizer";
import { matchMedicineName, getCorrectionLabel } from "../../src/lib/assistant/medicine-matcher";
import { matchTestName, getTestIdentity } from "../../src/lib/assistant/test-matcher";
import {
  classifyIntentDeterministic,
} from "../../src/lib/assistant/intent-router";

describe("normalizeQuery", () => {
  it("collapses repeated whitespace", () => {
    const result = normalizeQuery("  What   is   metformine?  ");
    expect(result.cleaned).toBe("What is metformine?");
    expect(result.original).toBe("What   is   metformine?");
  });

  it("corrects typos in medicine names", () => {
    const result = normalizeQuery("What is metformine?");
    expect(result.correctedText).toContain("metformin");
    expect(result.medicineNames).toContain("metformin");
  });

  it("corrects amoxicillin typo", () => {
    const result = normalizeQuery("Tell me about amoxilin");
    expect(result.correctedText).toContain("amoxicillin");
  });

  it("detects medical abbreviations", () => {
    const result = normalizeQuery("What is my HbA1c?");
    expect(result.abbreviations.length).toBeGreaterThan(0);
  });

  it("detects test names", () => {
    const result = normalizeQuery("What is my fasting blood sugar?");
    expect(result.testNames.length).toBeGreaterThan(0);
  });

  it("preserves medically meaningful characters", () => {
    const result = normalizeQuery("Result was 5.2 mg/dL (4.0-6.0)");
    expect(result.cleaned).toContain("5.2");
    expect(result.cleaned).toContain("mg/dL");
  });

  it("removes zero-width spaces", () => {
    const result = normalizeQuery("What\u200Bis\u200Bmetformine?");
    expect(result.cleaned).toBe("Whatismetformine?");
  });
});

describe("matchMedicineName", () => {
  it("matches exact canonical name", () => {
    const match = matchMedicineName("metformin");
    expect(match.canonicalName).toBe("metformin");
    expect(match.matchMethod).toBe("exact");
    expect(match.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("corrects metformine typo", () => {
    const match = matchMedicineName("metformine");
    expect(match.canonicalName).toBe("metformin");
    expect(match.matchMethod).toBe("typo_correction");
    expect(match.wasCorrected).toBe(true);
    expect(match.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("corrects amoxilin typo", () => {
    const match = matchMedicineName("amoxilin");
    expect(match.canonicalName).toBe("amoxicillin");
    expect(match.wasCorrected).toBe(true);
  });

  it("matches brand name to generic", () => {
    const match = matchMedicineName("glycomet");
    expect(match.canonicalName).toBe("metformin");
    expect(match.matchMethod).toBe("brand_generic");
    expect(match.wasCorrected).toBe(true);
  });

  it("matches azee to azithromycin", () => {
    const match = matchMedicineName("azee");
    expect(match.canonicalName).toBe("azithromycin");
  });

  it("returns no match for unknown medicine", () => {
    const match = matchMedicineName("xyzzyplugh");
    expect(match.matchMethod).toBe("none");
    expect(match.confidence).toBe(0);
  });

  it("matches amlodipine exactly", () => {
    const match = matchMedicineName("amlodipine");
    expect(match.canonicalName).toBe("amlodipine");
    expect(match.confidence).toBe(1.0);
  });

  it("corrects amlodipene typo", () => {
    const match = matchMedicineName("amlodipene");
    expect(match.canonicalName).toBe("amlodipine");
    expect(match.wasCorrected).toBe(true);
  });
});

describe("getCorrectionLabel", () => {
  it("returns auto-correct label for high confidence", () => {
    const label = getCorrectionLabel(0.95);
    expect(label.showAutoCorrect).toBe(true);
    expect(label.showAskUser).toBe(false);
  });

  it("returns ask-user label for medium confidence", () => {
    const label = getCorrectionLabel(0.80);
    expect(label.showAutoCorrect).toBe(false);
    expect(label.showAskUser).toBe(true);
  });
});

describe("matchTestName", () => {
  it("matches exact test name", () => {
    const match = matchTestName("hemoglobin_a1c");
    expect(match.canonicalName).toBe("hemoglobin_a1c");
    expect(match.matchMethod).toBe("exact");
  });

  it("matches HbA1c alias", () => {
    const match = matchTestName("hba1c");
    expect(match.canonicalName).toBe("hemoglobin_a1c");
    expect(match.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("matches hemoglobin a1c alias", () => {
    const match = matchTestName("hemoglobin a1c");
    expect(match.canonicalName).toBe("hemoglobin_a1c");
  });

  it("matches hemoglobin alc (typo/abbreviation)", () => {
    const match = matchTestName("hemoglobin alc");
    expect(match.canonicalName).toBe("hemoglobin_a1c");
  });

  it("distinguishes hemoglobin from hemoglobin_a1c", () => {
    const hgb = matchTestName("hemoglobin");
    const a1c = matchTestName("hba1c");
    expect(hgb.canonicalName).toBe("hemoglobin");
    expect(a1c.canonicalName).toBe("hemoglobin_a1c");
    expect(hgb.canonicalName).not.toBe(a1c.canonicalName);
  });

  it("distinguishes fasting glucose from random glucose", () => {
    const fasting = matchTestName("fasting blood sugar");
    const random = matchTestName("random blood sugar");
    expect(fasting.canonicalName).toBe("fasting_glucose");
    expect(random.canonicalName).toBe("random_glucose");
    expect(fasting.canonicalName).not.toBe(random.canonicalName);
  });

  it("distinguishes LDL from HDL", () => {
    const ldl = matchTestName("ldl");
    const hdl = matchTestName("hdl");
    expect(ldl.canonicalName).toBe("ldl_cholesterol");
    expect(hdl.canonicalName).toBe("hdl_cholesterol");
    expect(ldl.canonicalName).not.toBe(hdl.canonicalName);
  });

  it("distinguishes free T4 from total T4", () => {
    const free = matchTestName("free t4");
    const total = matchTestName("total t4");
    expect(free.canonicalName).toBe("free_t4");
    expect(total.canonicalName).toBe("total_t4");
    expect(free.canonicalName).not.toBe(total.canonicalName);
  });

  it("matches creatinine", () => {
    const match = matchTestName("serum creatinine");
    expect(match.canonicalName).toBe("serum_creatinine");
  });

  it("matches vitamin d", () => {
    const match = matchTestName("vitamin d");
    expect(match.canonicalName).toBe("vitamin_d");
  });

  it("matches TSH", () => {
    const match = matchTestName("tsh");
    expect(match.canonicalName).toBe("tsh");
  });

  it("returns no match for unknown test", () => {
    const match = matchTestName("xyzzy_test");
    expect(match.matchMethod).toBe("none");
  });
});

describe("getTestIdentity", () => {
  it("returns identity for known test", () => {
    const identity = getTestIdentity("hemoglobin_a1c");
    expect(identity).toBeDefined();
    expect(identity!.canonical).toBe("hemoglobin_a1c");
    expect(identity!.aliases.length).toBeGreaterThan(0);
  });

  it("returns undefined for unknown test", () => {
    const identity = getTestIdentity("unknown_test");
    expect(identity).toBeUndefined();
  });
});

describe("classifyIntentDeterministic - new intents", () => {
  it("detects medicine lookup intent", () => {
    const result = classifyIntentDeterministic("What is metformin?");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("MEDICINE_LOOKUP");
  });

  it("detects medicine lookup with tablet mention", () => {
    const result = classifyIntentDeterministic("Tell me about amoxicillin tablets");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("MEDICINE_LOOKUP");
  });

  it("detects test lookup intent", () => {
    const result = classifyIntentDeterministic("What is HbA1c?");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("TEST_LOOKUP");
  });

  it("detects report explanation intent", () => {
    const result = classifyIntentDeterministic("Explain my lab report");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("REPORT_EXPLANATION");
  });

  it("detects health trend question", () => {
    const result = classifyIntentDeterministic("Compare changes in my test results");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("HEALTH_TREND_QUESTION")
  });

  it("detects product help", () => {
    const result = classifyIntentDeterministic("What can Healthfolio do?");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("PRODUCT_HELP");
  });

  it("detects emergency", () => {
    const result = classifyIntentDeterministic("I have chest pain");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("EMERGENCY_OR_URGENT");
  });

  it("detects diagnosis request as safety boundary", () => {
    const result = classifyIntentDeterministic("Do I have diabetes?");
    expect(result).toBeDefined();
    expect(result!.intent).toBe("PERSONALIZED_MEDICAL_ADVICE");
  });
});

describe("normalizer-matcher pipeline", () => {
  it("metformine normalizes and matches", () => {
    const normalized = normalizeQuery("What is metformine?");
    expect(normalized.correctedText).toContain("metformin");
    const medicineMatch = matchMedicineName("metformin");
    expect(medicineMatch.canonicalName).toBe("metformin");
    expect(medicineMatch.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("hemoglobin alc matches through test matcher", () => {
    const testMatch = matchTestName("hemoglobin alc");
    expect(testMatch.canonicalName).toBe("hemoglobin_a1c");
  });

  it("amoxilin corrected and matched", () => {
    const medicineMatch = matchMedicineName("amoxilin");
    expect(medicineMatch.canonicalName).toBe("amoxicillin");
    expect(medicineMatch.wasCorrected).toBe(true);
  });
});
