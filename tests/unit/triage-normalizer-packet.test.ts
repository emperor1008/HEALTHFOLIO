/**
 * Normalizer + packet schema tests (Part 2).
 * Proves: typo/transliteration normalization maps ONLY to the closed broad
 * concept set; original text is never altered; uncertain text asks for
 * clarification instead of guessing; packets enforce safety constraints.
 */

import { describe, it, expect } from "vitest";
import { normalizeSymptomText } from "@/lib/triage/normalizer";
import { SYMPTOM_CONCEPTS } from "@/lib/triage/concepts";
import { PacketSchema, newPacketSkeleton } from "@/lib/triage/packet";
import { evaluateTriage, RULES_VERSION } from "@/lib/triage/red-flags";

describe("normalizer: original text preservation", () => {
  it("returns the original text byte-for-byte", () => {
    const raw = "  I have BREATHELESSness & cheast pain!!!  ";
    const r = normalizeSymptomText(raw);
    expect(r.originalText).toBe(raw);
  });

  it("empty text is empty, not uncertain", () => {
    const r = normalizeSymptomText("   ");
    expect(r.empty).toBe(true);
    expect(r.uncertain).toBe(false);
    expect(r.concepts).toEqual([]);
  });
});

describe("normalizer: typo and spelling variation", () => {
  it("maps 'brethless' to difficulty_breathing", () => {
    expect(normalizeSymptomText("feeling brethless").concepts).toContain("difficulty_breathing");
  });

  it("maps 'chestpain' to chest_discomfort", () => {
    expect(normalizeSymptomText("bad chestpain").concepts).toContain("chest_discomfort");
  });

  it("maps 'vomitting' (double-t typo)", () => {
    expect(normalizeSymptomText("vomitting since night").concepts).toContain("vomiting");
  });

  it("maps romanized Hindi 'bukhar' to fever", () => {
    expect(normalizeSymptomText("mujhe bukhar hai").concepts).toContain("fever");
  });

  it("maps 'behosh ho gaya' to fainting", () => {
    expect(normalizeSymptomText("wo behosh ho gaya").concepts).toContain("fainting");
  });

  it("maps 'khoon nahi ruk raha' to severe_bleeding", () => {
    expect(normalizeSymptomText("khoon nahi ruk raha hai").concepts).toContain("severe_bleeding");
  });
});

describe("normalizer: native scripts", () => {
  it("Devanagari बुखार → fever", () => {
    expect(normalizeSymptomText("मुझे बुखार है").concepts).toContain("fever");
  });

  it("Devanagari सांस लेने में दिक्कत → difficulty_breathing", () => {
    expect(normalizeSymptomText("सांस लेने में दिक्कत हो रही है").concepts).toContain(
      "difficulty_breathing"
    );
  });

  it("Odia ଜ୍ୱର → fever", () => {
    expect(normalizeSymptomText("ମୋର ଜ୍ୱର ଅଛି").concepts).toContain("fever");
  });

  it("Odia ବାନ୍ତି → vomiting", () => {
    expect(normalizeSymptomText("ବାନ୍ତି ହେଉଛି").concepts).toContain("vomiting");
  });
});

describe("normalizer: safety boundaries", () => {
  it("only outputs concepts from the closed set", () => {
    const samples = [
      "brethless chestpain vomitting",
      "मुझे बुखार है और उल्टी भी",
      "severe headache and dizzyness",
      "ପେଟ ଯନ୍ତ୍ରଣା",
      "total nonsense xyzzy",
    ];
    for (const s of samples) {
      for (const c of normalizeSymptomText(s).concepts) {
        expect(SYMPTOM_CONCEPTS).toContain(c);
      }
    }
  });

  it("never emits a disease name even when text contains one", () => {
    // "dengue"/"covid" are diseases; the normalizer must not echo them as
    // concepts. They should simply not match anything verified.
    const r = normalizeSymptomText("maybe dengue or covid, i feel feverish");
    expect(r.concepts).toEqual(["fever"]); // feverish → fever, diseases ignored
    expect(JSON.stringify(r.concepts)).not.toMatch(/dengue|covid/i);
  });

  it("unrecognized text is uncertain, not guessed", () => {
    const r = normalizeSymptomText("asdf qwerty zzzz unknownword");
    expect(r.concepts).toEqual([]);
    expect(r.uncertain).toBe(true);
  });

  it("confidence is reported per concept", () => {
    const r = normalizeSymptomText("chest pain and fever");
    expect(r.confidence["chest_discomfort"]).toBe("high");
    expect(r.confidence["fever"]).toBe("high");
  });
});

// ─── Packet schema ─────────────────────────────────────────────────────────

function validPacket() {
  const t = evaluateTriage({ concepts: ["fever"], followUps: { fever_three_days_or_more: true } });
  const p = newPacketSkeleton({ language: "en" });
  return {
    ...p,
    symptom_concepts: ["fever"],
    triage_category: t.category,
    triage_rules_version: t.rulesVersion,
    triage_rule_ids: t.triggered.map((x) => x.id),
    summary: "Concerns: fever. Suggested urgency: Urgent.",
  };
}

describe("packet schema: accepts valid packets", () => {
  it("parses a well-formed urgent packet with ack", () => {
    const p = { ...validPacket(), acknowledged_emergency_guidance: true };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(true);
  });

  it("parses a routine packet without ack", () => {
    const p = {
      ...newPacketSkeleton({ language: "hi" }),
      symptom_concepts: [],
      triage_category: "routine" as const,
      triage_rules_version: RULES_VERSION,
      triage_rule_ids: [],
      summary: "सारांश",
    };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(true);
  });
});

describe("packet schema: safety rejections", () => {
  it("rejects emergency packet without acknowledgement", () => {
    const t = evaluateTriage({ concepts: ["severe_bleeding"] });
    const p = {
      ...validPacket(),
      triage_category: t.category,
      triage_rule_ids: t.triggered.map((x) => x.id),
      acknowledged_emergency_guidance: false,
    };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain("EMERGENCY_ACK_REQUIRED");
    }
  });

  it("rejects emergency category without any EM- rule", () => {
    const p = {
      ...validPacket(),
      triage_category: "emergency" as const,
      triage_rule_ids: ["UR-01"],
      acknowledged_emergency_guidance: true,
    };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain("EMERGENCY_REQUIRES_EM_RULE");
    }
  });

  it("rejects invented rule IDs (which could smuggle diagnosis wording)", () => {
    const p = { ...validPacket(), triage_rule_ids: ["DENGUE-FEVER"], acknowledged_emergency_guidance: true };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(false);
  });

  it("rejects concepts outside the closed set", () => {
    const p = { ...validPacket(), symptom_concepts: ["dengue"], acknowledged_emergency_guidance: true };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(false);
  });

  it("rejects unknown triage categories", () => {
    const p = { ...validPacket(), triage_category: "probably_fine", acknowledged_emergency_guidance: true };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(false);
  });

  it("rejects oversized summaries", () => {
    const p = { ...validPacket(), summary: "x".repeat(501), acknowledged_emergency_guidance: true };
    const r = PacketSchema.safeParse(p);
    expect(r.success).toBe(false);
  });
});
