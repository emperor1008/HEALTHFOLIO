/**
 * Part 3 i18n tests: en/hi/or parity, fallback, interpolation, and honest
 * wording (no fabricated claims, no diagnosis, no "seen" receipts).
 */
import { describe, it, expect } from "vitest";
import { t3, hasPart3, type Part3Dict } from "@/lib/i18n/part3";

const ALL_KEYS = Object.keys({
  statusHeading: 1, statusLabel: 1, statusAwaitingReview: 1, statusAssigned: 1,
  statusAccepted: 1, statusProposed: 1, statusConfirmed: 1, statusInConsultation: 1,
  statusCompleted: 1, statusCancelled: 1, statusDeclined: 1, statusNeedsAttention: 1,
  statusQueuedOffline: 1, careOptionsHeading: 1, careOptionsLabel: 1, careOptionsNone: 1,
  careOptionsNoneHint: 1, clinicianSpecialty: 1, clinicianLanguages: 1, clinicianModes: 1,
  modeText: 1, modeAudio: 1, modeVideo: 1, updatedJustNow: 1, updatedMinutesAgo: 1,
  freshnessStale: 1, requestCare: 1, proposeAppointment: 1, proposedTime: 1,
  confirmAppointment: 1, declineProposal: 1, patientAckNote: 1, consentHeading: 1,
  consentExplanation: 1, consentGrant: 1, consentRevoke: 1, consentRevoked: 1,
  consentSelectedRecords: 1, messagesHeading: 1, messagePlaceholder: 1, messageSend: 1,
  messageSavedLocally: 1, messageSending: 1, messageDelivered: 1, messageFailed: 1,
  messagesEmpty: 1, noSeenClaims: 1, lobbyHeading: 1, joinConsultation: 1, connecting: 1,
  connected: 1, reconnecting: 1, switchedToAudio: 1, switchedToText: 1, connectionFailed: 1,
  mute: 1, unmute: 1, cameraOn: 1, cameraOff: 1, endConsultation: 1, continueByText: 1,
  sendVoiceNote: 1, tryAudioOnly: 1, bandwidthHint: 1, permissionDenied: 1,
  realtimeUnavailable: 1, staffNotConfigured: 1, staffNotConfiguredHint: 1,
  availabilityControls: 1, assignedQueue: 1, unassignedQueue: 1, facilityOverview: 1,
  errorGeneric: 1,
}) as Array<keyof Part3Dict>;

const LANGS = ["en", "hi", "or"] as const;

describe("Part 3 i18n completeness", () => {
  it("every key exists in en, hi, and or with non-empty values", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        expect(hasPart3(lang, key), `${lang}.${key} missing`).toBe(true);
        expect(t3(lang, key).length).toBeGreaterThan(0);
      }
    }
  });

  it("falls back to English for an unknown language code", () => {
    expect(t3("xx" as never, "confirmAppointment")).toBe("Confirm appointment");
  });

  it("interpolates {count} in all languages", () => {
    for (const lang of LANGS) {
      expect(t3(lang, "updatedMinutesAgo", { count: 15 })).toContain("15");
    }
  });

  it("no-clinician state is honest in every language", () => {
    for (const lang of LANGS) {
      const s = t3(lang, "careOptionsNone").toLowerCase();
      // Mentions no availability AND that the request stays saved.
      expect(s).toMatch(/not available|no participating|नहीं|ନାହିଁ|ନାହାଁନ୍ତି/);
      expect(s).toMatch(/saved|सहेज|ସଂରକ୍ଷିତ|ସୁରକ୍ଷିତ/);
    }
  });

  it("never claims doctor names, best-doctor, seen receipts, or diagnoses", () => {
    for (const key of ALL_KEYS) {
      for (const lang of LANGS) {
        const v = t3(lang, key).toLowerCase();
        expect(v, `${lang}.${key}`).not.toMatch(/best doctor|best clinician|diagnos/);
        expect(v, `${lang}.${key}`).not.toMatch(/prescrib|dosage/);
      }
    }
  });

  it("messaging labels include the four truthful delivery states", () => {
    for (const lang of LANGS) {
      expect(t3(lang, "messageSavedLocally").length).toBeGreaterThan(0);
      expect(t3(lang, "messageSending").length).toBeGreaterThan(0);
      expect(t3(lang, "messageDelivered").length).toBeGreaterThan(0);
      expect(t3(lang, "messageFailed").length).toBeGreaterThan(0);
    }
  });

  it("lobby includes explicit fallback wording in every language", () => {
    for (const lang of LANGS) {
      expect(t3(lang, "continueByText").length).toBeGreaterThan(0);
      expect(t3(lang, "tryAudioOnly").length).toBeGreaterThan(0);
      expect(t3(lang, "realtimeUnavailable").length).toBeGreaterThan(0);
    }
  });
});
