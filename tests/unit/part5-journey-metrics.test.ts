/**
 * Part 5 tests — journey status derivation + metric vocabulary.
 * Proves:
 * - every journey step maps to real state and carries timestamps only when
 *   they genuinely exist;
 * - "needs attention" appears only for genuine failures (failed queue items,
 *   revoked consent, declined/cancelled/expired appointments);
 * - metric events outside the closed vocabulary or with free-form metadata
 *   are rejected (privacy guarantee).
 */

import { describe, it, expect } from "vitest";
import { deriveJourney, currentJourneyStep, type JourneyInputs } from "@/lib/journey/status";
import { validateMetric, METRIC_EVENTS } from "@/lib/metrics/events";
import { RESILIENCE_PROFILES, readResilienceProfile } from "@/lib/dev/network-resilience";
import { UNCONFIGURED_REGION, validateRegionConfig } from "@/lib/region/config";
import type { QueueItem } from "@/lib/offline/types";

function mkQueue(partial: Partial<QueueItem>): QueueItem {
  return {
    id: partial.id ?? "q-1",
    idempotencyKey: "idem-1",
    actionType: partial.actionType ?? "care_request.create",
    payload: {} as QueueItem["payload"],
    localCreatedAt: partial.localCreatedAt ?? "2026-09-19T08:00:00Z",
    retryCount: partial.retryCount ?? 0,
    state: partial.state ?? "pending",
    updatedAt: partial.updatedAt ?? "2026-09-19T08:00:00Z",
    syncedAt: partial.syncedAt,
    serverRecordId: partial.serverRecordId,
    lastFailureReason: partial.lastFailureReason,
  };
}

const BASE: JourneyInputs = {
  queueItems: [],
  online: true,
};

describe("journey derivation", () => {
  it("empty state shows nothing started and no fake progress", () => {
    const steps = deriveJourney(BASE);
    expect(steps[0].key).toBe("captured");
    expect(steps[0].state).toBe("not_started");
    expect(steps.find((s) => s.key === "synced")?.state).toBe("not_started");
    expect(steps.find((s) => s.key === "submitted")?.state).toBe("not_started");
    // Timestamps are null when nothing happened.
    expect(steps.find((s) => s.key === "synced")?.at).toBeNull();
  });

  it("a pending offline queue item shows saved-on-device as current, not synced", () => {
    const steps = deriveJourney({
      ...BASE,
      online: false,
      queueItems: [mkQueue({ state: "pending" })],
    });
    expect(steps.find((s) => s.key === "saved_device")?.state).toBe("current");
    expect(steps.find((s) => s.key === "synced")?.state).toBe("current");
    expect(steps.find((s) => s.key === "submitted")?.state).toBe("not_started");
  });

  it("a failed queue item produces the failed step (retryable) + terminal summary", () => {
    const steps = deriveJourney({
      ...BASE,
      queueItems: [mkQueue({ state: "requires_attention", retryCount: 5 })],
    });
    const attention = steps.filter((s) => s.state === "attention");
    expect(attention.map((s) => s.key)).toEqual(["saved_device", "needs_attention"]);
    expect(attention[0].retryable).toBe(true);
    expect(currentJourneyStep(steps)?.key).toBe("saved_device");
  });

  it("synced care request + server row marks submitted done with real timestamps", () => {
    const steps = deriveJourney({
      ...BASE,
      queueItems: [mkQueue({ actionType: "care_request.create", state: "synced", syncedAt: "2026-09-19T09:00:00Z" })],
      careRequest: { id: "cr-1", status: "submitted", createdAt: "2026-09-19T08:30:00Z", urgency: "urgent" },
    });
    expect(steps.find((s) => s.key === "synced")?.at).toBe("2026-09-19T09:00:00Z");
    expect(steps.find((s) => s.key === "submitted")?.state).toBe("done");
    expect(steps.find((s) => s.key === "routed")?.state).toBe("done");
    expect(steps.find((s) => s.key === "awaiting_review")?.state).toBe("current");
  });

  it("urgency unknown does not claim routing is complete", () => {
    const steps = deriveJourney({
      ...BASE,
      careRequest: { id: "cr-1", status: "submitted", createdAt: "2026-09-19T08:30:00Z", urgency: null },
    });
    expect(steps.find((s) => s.key === "routed")?.state).toBe("current");
  });

  it("declined appointment becomes attention, completed becomes done", () => {
    const declined = deriveJourney({
      ...BASE,
      appointment: { id: "ap-1", state: "declined", updatedAt: "2026-09-19T10:00:00Z" },
    });
    expect(declined.find((s) => s.key === "appointment")?.state).toBe("attention");

    const completed = deriveJourney({
      ...BASE,
      appointment: { id: "ap-1", state: "completed", updatedAt: "2026-09-19T10:00:00Z" },
    });
    expect(completed.find((s) => s.key === "appointment")?.state).toBe("done");
  });

  it("revoked consent is attention; granted consent is done", () => {
    const revoked = deriveJourney({
      ...BASE,
      consent: { granted: true, revoked: true, at: "2026-09-19T11:00:00Z" },
    });
    expect(revoked.find((s) => s.key === "consent")?.state).toBe("attention");

    const granted = deriveJourney({
      ...BASE,
      consent: { granted: true, revoked: false, at: "2026-09-19T11:00:00Z" },
    });
    expect(granted.find((s) => s.key === "consent")?.state).toBe("done");
  });

  it("pharmacy request pending/responded map to current/done", () => {
    const pending = deriveJourney({
      ...BASE,
      pharmacyRequest: { id: "pr-1", status: "pending", createdAt: "2026-09-19T07:00:00Z" },
    });
    expect(pending.find((s) => s.key === "pharmacy")?.state).toBe("current");

    const responded = deriveJourney({
      ...BASE,
      pharmacyRequest: { id: "pr-1", status: "responded", createdAt: "2026-09-19T07:00:00Z" },
    });
    expect(responded.find((s) => s.key === "pharmacy")?.state).toBe("done");
  });

  it("is deterministic for identical inputs", () => {
    const inputs: JourneyInputs = {
      queueItems: [mkQueue({ state: "synced", syncedAt: "2026-09-19T09:00:00Z" })],
      online: true,
      careRequest: { id: "cr-1", status: "submitted", createdAt: "2026-09-19T08:00:00Z", urgency: "routine" },
    };
    expect(deriveJourney(inputs)).toEqual(deriveJourney(inputs));
  });
});

describe("metric vocabulary enforcement", () => {
  it("accepts valid events from the closed set with their documented metadata", () => {
    const validMetadata: Record<string, Record<string, unknown>> = {
      queue_item_created: { actionType: "care_request.create" },
      queue_item_synced: { actionType: "care_request.create", durationMs: 1200 },
      queue_item_failed: { actionType: "care_request.create", retryCount: 3 },
      care_request_submitted: { urgency: "urgent" },
      triage_completed: { urgency: "routine" },
      clinician_action_recorded: { action: "accepted", timeToActionMs: 60000 },
      appointment_proposed: {},
      appointment_confirmed: {},
      appointment_completed: {},
      consultation_fallback_used: { fallback: "text" },
      pharmacy_status_updated: { status: "available" },
      pharmacy_response_recorded: { response: "confirmed_available", responseTimeMs: 300000 },
      consent_granted: { documentCount: 2 },
      consent_revoked: {},
    };
    for (const event of METRIC_EVENTS) {
      expect(validateMetric({ event, metadata: validMetadata[event] ?? {} })).not.toBeNull();
    }
  });

  it("rejects unknown events", () => {
    expect(validateMetric({ event: "made_up_event" })).toBeNull();
    expect(validateMetric({ event: "patient_symptom_recorded" })).toBeNull();
  });

  it("rejects free-form metadata (privacy guarantee)", () => {
    expect(
      validateMetric({ event: "care_request_submitted", metadata: { symptomText: "chest pain since morning" } }),
    ).toBeNull();
    expect(
      validateMetric({ event: "queue_item_created", metadata: { note: "call patient at 555-0100" } }),
    ).toBeNull();
  });

  it("accepts only documented metadata keys per event", () => {
    expect(
      validateMetric({ event: "queue_item_synced", metadata: { actionType: "care_request.create", durationMs: 1200 } }),
    ).not.toBeNull();
    expect(
      validateMetric({ event: "queue_item_synced", metadata: { actionType: "care_request.create", patientName: "x" } }),
    ).toBeNull();
    expect(
      validateMetric({ event: "consent_granted", metadata: { documentCount: 3 } }),
    ).not.toBeNull();
  });

  it("rejects malformed shapes", () => {
    expect(validateMetric(null)).toBeNull();
    expect(validateMetric("synced")).toBeNull();
    expect(validateMetric({ event: 42 })).toBeNull();
  });
});

describe("resilience test mode guardrails", () => {
  it("defines every profile with a label and description", () => {
    for (const info of Object.values(RESILIENCE_PROFILES)) {
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
    }
  });

  it("defaults to off and never enables itself", () => {
    expect(readResilienceProfile()).toBe("off");
  });
});

describe("region config safety", () => {
  it("unconfigured default fabricates no local details", () => {
    expect(UNCONFIGURED_REGION.emergencyGuidance.phoneNumber).toBeNull();
    expect(UNCONFIGURED_REGION.serviceAreaText).toBe("");
    expect(UNCONFIGURED_REGION.helpContact).toBeNull();
    expect(UNCONFIGURED_REGION.features.videoConsultation).toBe(false);
  });

  it("rejects invalid region configs", () => {
    expect(validateRegionConfig({ region: "" })).toBeNull();
    expect(
      validateRegionConfig({ region: "x", languages: ["xx"], emergencyGuidance: {} }),
    ).toBeNull();
    expect(
      validateRegionConfig({
        region: "demo",
        languages: ["en"],
        serviceAreaText: "",
        emergencyGuidance: { instruction: "call", phoneNumber: null },
        appointmentHours: { openHour: 25, closeHour: 17 },
        freshness: { freshHours: 24, staleHours: 72, expiredHours: 168 },
        consultationModes: { text: true, audio: false, video: false },
        helpContact: null,
        features: { videoConsultation: false, voiceNotes: false, pharmacyConfirmation: true, staffPortal: false },
      }),
    ).toBeNull();
  });

  it("accepts a fully valid region config", () => {
    expect(
      validateRegionConfig({
        region: "coastal-north",
        languages: ["or", "en"],
        serviceAreaText: "Coastal north block",
        emergencyGuidance: { instruction: "Call 108", phoneNumber: "108" },
        appointmentHours: { openHour: 8, closeHour: 18 },
        freshness: { freshHours: 12, staleHours: 48, expiredHours: 120 },
        consultationModes: { text: true, audio: true, video: false },
        helpContact: { label: "Health helpline", value: "1800-000-000" },
        features: { videoConsultation: false, voiceNotes: false, pharmacyConfirmation: true, staffPortal: true },
      }),
    ).not.toBeNull();
  });
});
