/**
 * Feature 6: Medication Routine Agent — Unit Tests
 *
 * Tests state machine, extraction schema, scheduler, safety rules, and plan lifecycle.
 */

import { describe, it, expect } from "vitest";
import {
  PLAN_TYPE_LABELS,
  PLAN_STATUS_LABELS,
  OCCURRENCE_STATUS_LABELS,
  VALID_PLAN_TRANSITIONS,
  isValidPlanTransition,
  MISSED_DOSE_MESSAGE,
  SAFETY_DISCLAIMER,
} from "@/lib/routines/types";
import {
  ScheduleExtractionSchema,
} from "@/lib/routines/extraction-schema";
import {
  generateOccurrences,
  getSnoozeOptions,
  isOccurrenceDue,
  isOccurrenceMissed,
} from "@/lib/routines/scheduler";

// ─── Plan State Machine ──────────────────────────────────────────────────

describe("Plan State Machine", () => {
  it("allows proposed → review_required", () => {
    expect(isValidPlanTransition("proposed", "review_required")).toBe(true);
  });

  it("allows proposed → active", () => {
    expect(isValidPlanTransition("proposed", "active")).toBe(true);
  });

  it("allows proposed → rejected", () => {
    expect(isValidPlanTransition("proposed", "rejected")).toBe(true);
  });

  it("allows review_required → active", () => {
    expect(isValidPlanTransition("review_required", "active")).toBe(true);
  });

  it("allows active → paused", () => {
    expect(isValidPlanTransition("active", "paused")).toBe(true);
  });

  it("allows active → completed", () => {
    expect(isValidPlanTransition("active", "completed")).toBe(true);
  });

  it("allows active → superseded", () => {
    expect(isValidPlanTransition("active", "superseded")).toBe(true);
  });

  it("allows active → invalidated", () => {
    expect(isValidPlanTransition("active", "invalidated")).toBe(true);
  });

  it("allows paused → active", () => {
    expect(isValidPlanTransition("paused", "active")).toBe(true);
  });

  it("rejects completed → any", () => {
    expect(isValidPlanTransition("completed", "active")).toBe(false);
    expect(isValidPlanTransition("completed", "paused")).toBe(false);
  });

  it("rejects rejected → any", () => {
    expect(isValidPlanTransition("rejected", "active")).toBe(false);
  });

  it("rejects invalidated → any", () => {
    expect(isValidPlanTransition("invalidated", "active")).toBe(false);
  });

  it("defines all plan type labels", () => {
    expect(PLAN_TYPE_LABELS.fixed_times).toBeTruthy();
    expect(PLAN_TYPE_LABELS.as_needed).toBeTruthy();
    expect(PLAN_TYPE_LABELS.tapering).toBeTruthy();
    expect(PLAN_TYPE_LABELS.unclear).toBeTruthy();
  });

  it("defines all occurrence status labels", () => {
    expect(OCCURRENCE_STATUS_LABELS.taken).toBe("Taken");
    expect(OCCURRENCE_STATUS_LABELS.missed).toBe("No response recorded");
    expect(OCCURRENCE_STATUS_LABELS.scheduled).toBe("Scheduled");
  });
});

// ─── Safety Messages ─────────────────────────────────────────────────────

describe("Safety Messages", () => {
  it("missed dose message does not give medical advice", () => {
    expect(MISSED_DOSE_MESSAGE).toContain("cannot determine");
    expect(MISSED_DOSE_MESSAGE).toContain("clinician");
    expect(MISSED_DOSE_MESSAGE).toContain("pharmacist");
    expect(MISSED_DOSE_MESSAGE).not.toContain("take it when remembered");
    expect(MISSED_DOSE_MESSAGE).not.toContain("double dose");
  });

  it("safety disclaimer does not claim prescribing", () => {
    expect(SAFETY_DISCLAIMER).toContain("does not prescribe");
    expect(SAFETY_DISCLAIMER).toContain("not prescribe");
    expect(SAFETY_DISCLAIMER).toContain("recommend");
  });
});

// ─── Schedule Extraction Schema ──────────────────────────────────────────

describe("Schedule Extraction Schema", () => {
  it("accepts valid extraction with required fields", () => {
    const result = ScheduleExtractionSchema.parse({
      prescriptionItemId: "550e8400-e29b-41d4-a716-446655440000",
      medicineNameText: "Metformin",
      doseText: "500mg",
      routeText: "Oral",
      frequencyText: "Twice daily",
      durationText: "30 days",
      timingText: "Before food",
      conditionText: null,
      routineType: "times_per_day",
      timesPerDay: 2,
      intervalHours: null,
      suggestedTimeSlots: ["08:00", "20:00"],
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      durationDays: 30,
      requiresConfirmation: true,
      confidence: 0.85,
      evidence: [
        {
          field: "frequencyText",
          page: 1,
          textQuote: "Twice daily before food",
        },
      ],
      ambiguities: [],
      warnings: [],
    });

    expect(result.routineType).toBe("times_per_day");
    expect(result.suggestedTimeSlots).toHaveLength(2);
    expect(result.evidence.length).toBeGreaterThanOrEqual(1);
  });

  it("accepts as_needed routine type", () => {
    const result = ScheduleExtractionSchema.parse({
      prescriptionItemId: "550e8400-e29b-41d4-a716-446655440000",
      medicineNameText: "Paracetamol",
      doseText: "500mg",
      routeText: "Oral",
      frequencyText: "SOS",
      durationText: null,
      timingText: "When needed",
      conditionText: "For fever",
      routineType: "as_needed",
      timesPerDay: null,
      intervalHours: null,
      suggestedTimeSlots: [],
      startDate: null,
      endDate: null,
      durationDays: null,
      requiresConfirmation: false,
      confidence: 0.9,
      evidence: [
        { field: "frequencyText", page: 1, textQuote: "SOS" },
      ],
      ambiguities: [],
      warnings: [],
    });

    expect(result.routineType).toBe("as_needed");
    expect(result.suggestedTimeSlots).toHaveLength(0);
  });

  it("accepts tapering routine type", () => {
    const result = ScheduleExtractionSchema.parse({
      prescriptionItemId: "550e8400-e29b-41d4-a716-446655440000",
      medicineNameText: "Prednisolone",
      doseText: "Taper per schedule",
      routeText: "Oral",
      frequencyText: "Once daily",
      durationText: "14 days",
      timingText: "Morning",
      conditionText: null,
      routineType: "tapering",
      timesPerDay: 1,
      intervalHours: null,
      suggestedTimeSlots: ["08:00"],
      startDate: "2025-01-01",
      endDate: "2025-01-14",
      durationDays: 14,
      requiresConfirmation: true,
      confidence: 0.7,
      evidence: [
        { field: "frequencyText", page: 1, textQuote: "Taper per schedule" },
      ],
      ambiguities: ["Taper phases not specified"],
      warnings: ["Tapering schedule requires full manual review"],
    });

    expect(result.routineType).toBe("tapering");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("rejects confidence outside 0-1", () => {
    expect(() =>
      ScheduleExtractionSchema.parse({
        prescriptionItemId: "550e8400-e29b-41d4-a716-446655440000",
        medicineNameText: "Test",
        doseText: null,
        routeText: null,
        frequencyText: null,
        durationText: null,
        timingText: null,
        conditionText: null,
        routineType: "unclear",
        timesPerDay: null,
        intervalHours: null,
        suggestedTimeSlots: [],
        startDate: null,
        endDate: null,
        durationDays: null,
        requiresConfirmation: true,
        confidence: 1.5,
        evidence: [{ field: "test", page: 1, textQuote: "test" }],
        ambiguities: [],
        warnings: [],
      })
    ).toThrow();
  });

  it("rejects extraction without evidence", () => {
    expect(() =>
      ScheduleExtractionSchema.parse({
        prescriptionItemId: "550e8400-e29b-41d4-a716-446655440000",
        medicineNameText: "Test",
        doseText: null,
        routeText: null,
        frequencyText: null,
        durationText: null,
        timingText: null,
        conditionText: null,
        routineType: "unclear",
        timesPerDay: null,
        intervalHours: null,
        suggestedTimeSlots: [],
        startDate: null,
        endDate: null,
        durationDays: null,
        requiresConfirmation: true,
        confidence: 0.5,
        evidence: [],
        ambiguities: [],
        warnings: [],
      })
    ).toThrow();
  });

  it("rejects invalid routine type", () => {
    expect(() =>
      ScheduleExtractionSchema.parse({
        prescriptionItemId: "550e8400-e29b-41d4-a716-446655440000",
        medicineNameText: "Test",
        doseText: null,
        routeText: null,
        frequencyText: null,
        durationText: null,
        timingText: null,
        conditionText: null,
        routineType: "invalid_type",
        timesPerDay: null,
        intervalHours: null,
        suggestedTimeSlots: [],
        startDate: null,
        endDate: null,
        durationDays: null,
        requiresConfirmation: true,
        confidence: 0.5,
        evidence: [{ field: "test", page: 1, textQuote: "test" }],
        ambiguities: [],
        warnings: [],
      })
    ).toThrow();
  });
});

// ─── Scheduler ───────────────────────────────────────────────────────────

describe("Scheduler", () => {
  it("generates daily occurrences for a fixed time", () => {
    const now = new Date();
    const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const end = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

    const occurrences = generateOccurrences({
      planId: "plan-1",
      userId: "user-1",
      ruleId: "rule-1",
      ruleType: "fixed_times",
      localTime: "08:00",
      intervalHours: null,
      weekdays: null,
      startDate: start,
      endDate: end,
      timezone: "Asia/Kolkata",
      revisionNumber: 1,
    });

    expect(occurrences.length).toBeGreaterThanOrEqual(1);
    expect(occurrences[0].localScheduledTime).toContain("08:00");
    expect(occurrences[0].timezone).toBe("Asia/Kolkata");
    expect(occurrences[0].idempotencyKey).toBeTruthy();
  });

  it("generates interval occurrences", () => {
    const now = new Date();
    const later = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const end = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(later.getDate()).padStart(2, "0")}`;

    const occurrences = generateOccurrences({
      planId: "plan-2",
      userId: "user-1",
      ruleId: "rule-2",
      ruleType: "interval",
      localTime: "08:00",
      intervalHours: 8,
      weekdays: null,
      startDate: start,
      endDate: end,
      timezone: "Asia/Kolkata",
      revisionNumber: 1,
    });

    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

  it("generates weekday occurrences", () => {
    const now = new Date();
    const later = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const end = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(later.getDate()).padStart(2, "0")}`;

    const occurrences = generateOccurrences({
      planId: "plan-3",
      userId: "user-1",
      ruleId: "rule-3",
      ruleType: "specific_weekdays",
      localTime: "09:00",
      intervalHours: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6], // All days
      startDate: start,
      endDate: end,
      timezone: "Asia/Kolkata",
      revisionNumber: 1,
    });

    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for as_needed", () => {
    const occurrences = generateOccurrences({
      planId: "plan-4",
      userId: "user-1",
      ruleId: "rule-4",
      ruleType: "as_needed",
      localTime: "08:00",
      intervalHours: null,
      weekdays: null,
      startDate: null,
      endDate: null,
      timezone: "Asia/Kolkata",
      revisionNumber: 1,
    });

    expect(occurrences).toHaveLength(0);
  });

  it("returns empty for one_time", () => {
    const occurrences = generateOccurrences({
      planId: "plan-5",
      userId: "user-1",
      ruleId: "rule-5",
      ruleType: "one_time",
      localTime: "08:00",
      intervalHours: null,
      weekdays: null,
      startDate: null,
      endDate: null,
      timezone: "Asia/Kolkata",
      revisionNumber: 1,
    });

    expect(occurrences).toHaveLength(0);
  });

  it("generates unique idempotency keys per occurrence", () => {
    const occurrences = generateOccurrences({
      planId: "plan-6",
      userId: "user-1",
      ruleId: "rule-6",
      ruleType: "fixed_times",
      localTime: "08:00",
      intervalHours: null,
      weekdays: null,
      startDate: "2025-06-01",
      endDate: "2025-06-05",
      timezone: "Asia/Kolkata",
      revisionNumber: 1,
    });

    const keys = occurrences.map((o) => o.idempotencyKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("generates bounded occurrences within window", () => {
    const occurrences = generateOccurrences(
      {
        planId: "plan-7",
        userId: "user-1",
        ruleId: "rule-7",
        ruleType: "fixed_times",
        localTime: "08:00",
        intervalHours: null,
        weekdays: null,
        startDate: null,
        endDate: null,
        timezone: "Asia/Kolkata",
        revisionNumber: 1,
      },
      7 // 7-day window
    );

    // Should not generate more than 7 occurrences for daily at one time
    expect(occurrences.length).toBeLessThanOrEqual(8);
  });

  it("snooze options are bounded", () => {
    const options = getSnoozeOptions();
    expect(options).toContain(5);
    expect(options).toContain(15);
    for (const m of options) {
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThanOrEqual(60);
    }
  });

  it("detects due occurrences", () => {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60000);
    const tenMinLater = new Date(now.getTime() + 10 * 60000);

    expect(
      isOccurrenceDue(now, {
        dueWindowStart: tenMinAgo.toISOString(),
        dueWindowEnd: tenMinLater.toISOString(),
        status: "scheduled",
      })
    ).toBe(true);
  });

  it("detects missed occurrences", () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60000);

    expect(
      isOccurrenceMissed(now, {
        dueWindowEnd: thirtyMinAgo.toISOString(),
        status: "scheduled",
      })
    ).toBe(true);
  });
});
