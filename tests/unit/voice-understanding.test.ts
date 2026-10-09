import { describe, it, expect } from "vitest";
import {
  detectUtteranceLanguage,
  interpretVoiceCommand,
} from "@/lib/voice/understanding";

describe("detectUtteranceLanguage", () => {
  it("detects Devanagari as Hindi", () => {
    expect(detectUtteranceLanguage("मुझे डॉक्टर चाहिए")).toBe("hi");
  });

  it("detects Odia script as Odia", () => {
    expect(detectUtteranceLanguage("ମୁଁ ଡାକ୍ତରଙ୍କ ସହ କଥା ହେବାକୁ ଚାହୁଁଛି")).toBe("or");
  });

  it("returns null for plain English (uncertain)", () => {
    expect(detectUtteranceLanguage("i need a doctor")).toBeNull();
  });

  it("detects romanized Hindi by marker majority", () => {
    expect(detectUtteranceLanguage("mujhe doctor se baat karni hai")).toBe("hi");
  });
});

describe("interpretVoiceCommand — spec fixtures", () => {
  it("interprets 'I need a doctor'", () => {
    const r = interpretVoiceCommand("I need a doctor", "en");
    expect(r.command?.intent).toBe("TALK_TO_DOCTOR");
    expect(r.command?.source).toBe("deterministic");
  });

  it("interprets romanized Hindi 'mujhe doctor se baat karni hai'", () => {
    const r = interpretVoiceCommand("mujhe doctor se baat karni hai", "en");
    expect(r.command?.intent).toBe("TALK_TO_DOCTOR");
    expect(r.language).toBe("hi");
  });

  it("interprets native Hindi script", () => {
    const r = interpretVoiceCommand("मुझे डॉक्टर से बात करनी है", "en");
    expect(r.command?.intent).toBe("TALK_TO_DOCTOR");
    expect(r.language).toBe("hi");
  });

  it("interprets native Odia script", () => {
    const r = interpretVoiceCommand(
      "ମୁଁ ଡାକ୍ତରଙ୍କ ସହ କଥା ହେବାକୁ ଚାହୁଁଛି",
      "en"
    );
    expect(r.command?.intent).toBe("TALK_TO_DOCTOR");
    expect(r.language).toBe("or");
  });

  it("interprets 'check paracetamol' with the medicine entity", () => {
    const r = interpretVoiceCommand("check paracetamol", "en");
    expect(r.command?.intent).toBe("CHECK_MEDICINE");
    expect(r.command?.entities.medicineName).toBe("paracetamol");
  });

  it("interprets 'show my health card'", () => {
    const r = interpretVoiceCommand("show my health card", "en");
    expect(r.command?.intent).toBe("OPEN_HEALTH_CARD");
  });

  it("interprets 'read my health card'", () => {
    const r = interpretVoiceCommand("read my health card", "en");
    expect(r.command?.intent).toBe("READ_HEALTH_CARD");
  });

  it("interprets 'repeat'", () => {
    const r = interpretVoiceCommand("repeat", "en");
    expect(r.command?.intent).toBe("REPEAT");
  });

  it("interprets 'cancel'", () => {
    const r = interpretVoiceCommand("cancel", "en");
    expect(r.command?.intent).toBe("CANCEL");
  });

  it("interprets 'help'", () => {
    const r = interpretVoiceCommand("help", "en");
    expect(r.command?.intent).toBe("HELP");
  });

  it("interprets 'switch to audio'", () => {
    const r = interpretVoiceCommand("switch to audio", "en");
    expect(r.command?.intent).toBe("SWITCH_TO_AUDIO");
  });

  it("interprets 'end session'", () => {
    const r = interpretVoiceCommand("end session", "en");
    expect(r.command?.intent).toBe("END_SESSION");
  });

  it("interprets 'change language to hindi'", () => {
    const r = interpretVoiceCommand("change language to hindi", "en");
    expect(r.command?.intent).toBe("CHANGE_LANGUAGE");
    expect(r.command?.entities.language).toBe("hi");
  });

  it("interprets 'explain triage'", () => {
    const r = interpretVoiceCommand("explain triage", "en");
    expect(r.command?.intent).toBe("EXPLAIN_TRIAGE");
  });

  it("interprets 'why offline'", () => {
    const r = interpretVoiceCommand("why offline", "en");
    expect(r.command?.intent).toBe("EXPLAIN_OFFLINE_STATUS");
  });

  it("interprets 'sync status'", () => {
    const r = interpretVoiceCommand("sync status", "en");
    expect(r.command?.intent).toBe("EXPLAIN_SYNC_STATUS");
  });

  it("interprets 'start consultation'", () => {
    const r = interpretVoiceCommand("start consultation", "en");
    expect(r.command?.intent).toBe("START_CONSULTATION");
  });

  it("interprets 'is doctor available'", () => {
    const r = interpretVoiceCommand("is doctor available", "en");
    expect(r.command?.intent).toBe("CHECK_DOCTOR_AVAILABILITY");
  });
});

describe("interpretVoiceCommand — symptom fixtures", () => {
  // Concepts the Phase-2 normalizer maps at HIGH confidence.
  const recognized = [
    { text: "fever", concept: "fever" },
    { text: "abdominal pain", concept: "abdominal_pain" },
    { text: "difficulty breathing", concept: "difficulty_breathing" },
    { text: "chest pain", concept: "chest_discomfort" },
    { text: "vomiting", concept: "vomiting" },
    { text: "injury", concept: "injury" },
  ];

  for (const { text, concept } of recognized) {
    it(`interprets symptom '${text}' as CHECK_SYMPTOMS`, () => {
      const r = interpretVoiceCommand(text, "en");
      expect(r.command?.intent).toBe("CHECK_SYMPTOMS");
      expect(r.command?.entities.symptoms).toContain(concept);
      expect(r.command?.entities.symptomText).toBe(text);
    });
  }

  // SAFETY BOUNDARY: vague single-word wording must NOT escalate
  // into a severe concept. The Phase-2 normalizer deliberately
  // requires qualifiers ("severe headache", "severe bleeding");
  // the voice layer inherits that boundary unchanged.
  const vague = [
    "headache",
    "weakness",
    "bleeding",
    "loss of consciousness",
    "cough",
  ];

  for (const s of vague) {
    it(`does NOT escalate vague '${s}' to a severe concept`, () => {
      const r = interpretVoiceCommand(s, "en");
      const symptoms = r.command?.entities.symptoms ?? [];
      expect(symptoms).not.toContain("severe_headache");
      expect(symptoms).not.toContain("severe_bleeding");
      expect(symptoms).not.toContain("weakness_one_side");
      expect(symptoms).not.toContain("fainting");
      // Either no command (clarification/AI fallback) or a
      // non-severe concept — never a severe escalation.
      if (r.command) {
        expect(r.command.intent).toBe("CHECK_SYMPTOMS");
      } else {
        expect(r.needsAiFallback).toBe(true);
      }
    });
  }

  it("recognizes qualified severe wording", () => {
    const r = interpretVoiceCommand("severe headache", "en");
    expect(r.command?.intent).toBe("CHECK_SYMPTOMS");
    expect(r.command?.entities.symptoms).toContain("severe_headache");
  });

  it("interprets 'unconscious' as fainting", () => {
    const r = interpretVoiceCommand("unconscious", "en");
    expect(r.command?.intent).toBe("CHECK_SYMPTOMS");
    expect(r.command?.entities.symptoms).toContain("fainting");
  });
});

describe("interpretVoiceCommand — answers and fallbacks", () => {
  it("recognizes yes/no answers", () => {
    expect(interpretVoiceCommand("yes", "en").answer).toBe(true);
    expect(interpretVoiceCommand("no", "en").answer).toBe(false);
    expect(interpretVoiceCommand("haan", "en").answer).toBe(true);
    expect(interpretVoiceCommand("नहीं", "en").answer).toBe(false);
  });

  it("flags unknown input for AI fallback", () => {
    const r = interpretVoiceCommand("what is the capital of france", "en");
    expect(r.command).toBeNull();
    expect(r.needsAiFallback).toBe(true);
  });

  it("empty input produces nothing", () => {
    const r = interpretVoiceCommand("   ", "en");
    expect(r.command).toBeNull();
    expect(r.needsAiFallback).toBe(false);
  });

  it("does not flip session language on uncertain English", () => {
    const r = interpretVoiceCommand("i need a doctor", "or");
    expect(r.language).toBe("or");
  });

  it("embeds a stable fingerprint", () => {
    const r = interpretVoiceCommand("I need a doctor", "en");
    expect(r.command?.fingerprint).toBeTruthy();
    expect(r.command?.fingerprint!.length).toBeLessThanOrEqual(128);
  });
});
