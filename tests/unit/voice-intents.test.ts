import { describe, it, expect } from "vitest";
import {
  VOICE_INTENTS,
  isVoiceIntent,
  VOICE_INTENT_RISK,
  CONFIRMATION_REQUIRED_INTENTS,
  READ_ONLY_INTENTS,
  VoiceEntitiesSchema,
  VoiceCommandSchema,
  parseVoiceCommand,
  commandFingerprint,
} from "@/lib/voice/intents";

describe("voice intent vocabulary", () => {
  it("exposes exactly the controlled intents", () => {
    expect(VOICE_INTENTS).toContain("CHECK_SYMPTOMS");
    expect(VOICE_INTENTS).toContain("TALK_TO_DOCTOR");
    expect(VOICE_INTENTS).toContain("CHECK_DOCTOR_AVAILABILITY");
    expect(VOICE_INTENTS).toContain("CHECK_MEDICINE");
    expect(VOICE_INTENTS).toContain("OPEN_HEALTH_CARD");
    expect(VOICE_INTENTS).toContain("READ_HEALTH_CARD");
    expect(VOICE_INTENTS).toContain("EXPLAIN_TRIAGE");
    expect(VOICE_INTENTS).toContain("EXPLAIN_OFFLINE_STATUS");
    expect(VOICE_INTENTS).toContain("EXPLAIN_SYNC_STATUS");
    expect(VOICE_INTENTS).toContain("START_CONSULTATION");
    expect(VOICE_INTENTS).toContain("SWITCH_TO_AUDIO");
    expect(VOICE_INTENTS).toContain("REPEAT");
    expect(VOICE_INTENTS).toContain("CHANGE_LANGUAGE");
    expect(VOICE_INTENTS).toContain("HELP");
    expect(VOICE_INTENTS).toContain("CANCEL");
    expect(VOICE_INTENTS).toContain("END_SESSION");
  });

  it("rejects intents outside the controlled vocabulary", () => {
    expect(isVoiceIntent("DELETE_EVERYTHING")).toBe(false);
    expect(isVoiceIntent("DIAGNOSE")).toBe(false);
    expect(isVoiceIntent("PRESCRIBE")).toBe(false);
    expect(isVoiceIntent("")).toBe(false);
  });

  it("every intent has a risk class", () => {
    for (const intent of VOICE_INTENTS) {
      expect(VOICE_INTENT_RISK[intent]).toBeDefined();
    }
  });

  it("consultation controls require confirmation; read-only intents do not", () => {
    expect(CONFIRMATION_REQUIRED_INTENTS.has("START_CONSULTATION")).toBe(true);
    expect(CONFIRMATION_REQUIRED_INTENTS.has("SWITCH_TO_AUDIO")).toBe(true);
    expect(CONFIRMATION_REQUIRED_INTENTS.has("END_SESSION")).toBe(true);
    expect(READ_ONLY_INTENTS.has("READ_HEALTH_CARD")).toBe(true);
    expect(READ_ONLY_INTENTS.has("EXPLAIN_TRIAGE")).toBe(true);
    expect(READ_ONLY_INTENTS.has("TALK_TO_DOCTOR")).toBe(false);
    expect(CONFIRMATION_REQUIRED_INTENTS.has("TALK_TO_DOCTOR")).toBe(false);
  });
});

describe("voice command validation", () => {
  it("accepts a valid command", () => {
    const cmd = parseVoiceCommand({
      intent: "CHECK_MEDICINE",
      language: "en",
      entities: { medicineName: "paracetamol" },
      source: "deterministic",
      confidence: "high",
      fingerprint: "abc123",
    });
    expect(cmd).not.toBeNull();
    expect(cmd?.intent).toBe("CHECK_MEDICINE");
    expect(cmd?.entities.medicineName).toBe("paracetamol");
  });

  it("rejects unknown intents", () => {
    expect(
      parseVoiceCommand({
        intent: "FLY_TO_MOON",
        language: "en",
        entities: {},
        source: "deterministic",
        confidence: "high",
        fingerprint: "abc123",
      })
    ).toBeNull();
  });

  it("rejects extra fields (strict schema)", () => {
    expect(
      VoiceCommandSchema.safeParse({
        intent: "HELP",
        language: "en",
        entities: {},
        source: "deterministic",
        confidence: "high",
        sneaky: "injected",
      }).success
    ).toBe(false);
  });

  it("rejects oversized entities", () => {
    expect(
      VoiceEntitiesSchema.safeParse({
        symptomText: "x".repeat(201),
      }).success
    ).toBe(false);
    expect(
      VoiceEntitiesSchema.safeParse({
        medicineName: "x".repeat(121),
      }).success
    ).toBe(false);
    expect(
      VoiceEntitiesSchema.safeParse({
        symptoms: Array.from({ length: 21 }, () => "cough"),
      }).success
    ).toBe(false);
  });

  it("drops non-concept symptoms in parseVoiceCommand", () => {
    const cmd = parseVoiceCommand({
      intent: "CHECK_SYMPTOMS",
      language: "en",
      entities: { symptoms: ["banana", "fever"] },
      source: "deterministic",
      confidence: "high",
      fingerprint: "abc123",
    });
    expect(cmd).not.toBeNull();
    expect(cmd?.entities.symptoms).toEqual(["fever"]);
  });

  it("fingerprint is stable and distinct", () => {
    const a = commandFingerprint("CHECK_MEDICINE", { medicineName: "a" }, "en");
    const b = commandFingerprint("CHECK_MEDICINE", { medicineName: "a" }, "en");
    const c = commandFingerprint("CHECK_MEDICINE", { medicineName: "b" }, "en");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBeLessThanOrEqual(128);
  });
});
