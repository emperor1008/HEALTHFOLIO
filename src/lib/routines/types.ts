/**
 * Medication Routine Agent types.
 *
 * Models the lifecycle: prescription → extraction → proposal → confirmation → activation → occurrence tracking.
 *
 * Safety: This is a reminder system, not a prescribing system.
 */

// ─── Plan Types ──────────────────────────────────────────────────────────

export type PlanType =
  | "fixed_times"
  | "times_per_day"
  | "interval"
  | "specific_weekdays"
  | "date_range"
  | "course_duration"
  | "tapering"
  | "as_needed"
  | "one_time"
  | "unclear";

export type PlanStatus =
  | "proposed"
  | "review_required"
  | "active"
  | "paused"
  | "completed"
  | "expired"
  | "superseded"
  | "invalidated"
  | "rejected";

export type OccurrenceStatus =
  | "scheduled"
  | "due"
  | "taken"
  | "skipped"
  | "snoozed"
  | "missed"
  | "cancelled"
  | "invalidated";

export type AdherenceEventType =
  | "marked_taken"
  | "marked_skipped"
  | "snoozed"
  | "marked_not_now"
  | "corrected"
  | "reverted";

export type RuleType = "fixed_times" | "interval" | "specific_weekdays" | "as_needed";

export type SourceType = "prescription" | "user_selected" | "system_suggested";

export type NotificationStatus = "pending" | "sent" | "failed" | "expired" | "cancelled";

// ─── Medication Plan ─────────────────────────────────────────────────────

export interface MedicationPlan {
  id: string;
  userId: string;
  portfolioId: string;
  medicineEntityId: string | null;
  prescriptionItemId: string;
  documentId: string;
  displayName: string;
  sourceInstruction: string;
  planType: PlanType;
  status: PlanStatus;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  confidence: number;
  requiresReview: boolean;
  activatedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Schedule Rule ───────────────────────────────────────────────────────

export interface ScheduleRule {
  id: string;
  userId: string;
  medicationPlanId: string;
  ruleType: RuleType;
  localTime: string | null;
  intervalHours: number | null;
  weekdays: number[] | null;
  startDate: string | null;
  endDate: string | null;
  timingRelation: string | null;
  sourceType: SourceType;
  sourceText: string | null;
  userConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Occurrence ──────────────────────────────────────────────────────────

export interface MedicationOccurrence {
  id: string;
  userId: string;
  medicationPlanId: string;
  scheduleRuleId: string;
  scheduledFor: string;
  localScheduledTime: string;
  timezone: string;
  status: OccurrenceStatus;
  dueWindowStart: string;
  dueWindowEnd: string;
  notificationStatus: NotificationStatus;
  generatedFromRevision: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Adherence Event ─────────────────────────────────────────────────────

export interface AdherenceEvent {
  id: string;
  userId: string;
  medicationPlanId: string;
  occurrenceId: string | null;
  eventType: AdherenceEventType;
  eventAt: string;
  clientTimezone: string | null;
  optionalReason: string | null;
  clientRequestId: string;
  createdAt: string;
}

// ─── Plan Revision ───────────────────────────────────────────────────────

export interface PlanRevision {
  id: string;
  userId: string;
  medicationPlanId: string;
  revisionNumber: number;
  previousPlan: Record<string, unknown> | null;
  revisedPlan: Record<string, unknown>;
  revisionReason: string;
  actorType: string;
  sourceDocumentId: string | null;
  createdAt: string;
}

// ─── Routine Type Labels ─────────────────────────────────────────────────

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  fixed_times: "Fixed times",
  times_per_day: "Times per day",
  interval: "Every N hours",
  specific_weekdays: "Specific weekdays",
  date_range: "Date range",
  course_duration: "Course duration",
  tapering: "Tapering schedule",
  as_needed: "As needed",
  one_time: "One time",
  unclear: "Unclear instructions",
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  proposed: "Proposed",
  review_required: "Needs review",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  expired: "Expired",
  superseded: "Replaced",
  invalidated: "Invalidated",
  rejected: "Rejected",
};

export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  scheduled: "Scheduled",
  due: "Due",
  taken: "Taken",
  skipped: "Skipped",
  snoozed: "Snoozed",
  missed: "No response recorded",
  cancelled: "Cancelled",
  invalidated: "Invalidated",
};

// ─── Safety: Missed dose message ─────────────────────────────────────────

export const MISSED_DOSE_MESSAGE =
  "Healthfolio cannot determine what you should do after a missed dose. Check the medicine's official patient information or contact your prescribing clinician or pharmacist.";

// ─── Safety: No prescribing ──────────────────────────────────────────────

export const SAFETY_DISCLAIMER =
  "Healthfolio helps organize your medication reminders. It does not prescribe, recommend, or adjust any medicine. Follow your clinician's instructions.";

// ─── Routine State Machine ───────────────────────────────────────────────

export const VALID_PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  proposed: ["review_required", "active", "rejected"],
  review_required: ["proposed", "active", "rejected"],
  active: ["paused", "completed", "expired", "superseded", "invalidated"],
  paused: ["active", "invalidated"],
  completed: [],
  expired: [],
  superseded: [],
  invalidated: [],
  rejected: [],
};

export function isValidPlanTransition(from: PlanStatus, to: PlanStatus): boolean {
  return VALID_PLAN_TRANSITIONS[from]?.includes(to) ?? false;
}
