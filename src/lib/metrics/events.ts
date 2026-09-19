/**
 * Privacy-safe operational metrics (Part 5).
 *
 * RULES
 * - Closed event vocabulary (mirrors the DB constraint in migration 021).
 * - Metadata keys are fixed per event; arbitrary payloads are rejected.
 * - NO symptom text, document contents, phone numbers, addresses, or any
 *   personal identifier is ever recorded — aggregates and durations only.
 * - Events are written server-side; the client never talks to this table.
 */

import { z } from "zod";

export const METRIC_EVENTS = [
  "queue_item_created",
  "queue_item_synced",
  "queue_item_failed",
  "care_request_submitted",
  "triage_completed",
  "clinician_action_recorded",
  "appointment_proposed",
  "appointment_confirmed",
  "appointment_completed",
  "consultation_fallback_used",
  "pharmacy_status_updated",
  "pharmacy_response_recorded",
  "consent_granted",
  "consent_revoked",
] as const;

export type MetricEvent = (typeof METRIC_EVENTS)[number];

export function isMetricEvent(v: unknown): v is MetricEvent {
  return typeof v === "string" && (METRIC_EVENTS as readonly string[]).includes(v);
}

/**
 * Per-event metadata schemas. Every key is fixed; free-form objects are
 * rejected at parse time. Values are enums, booleans, counts, or ms durations.
 */
export const METRIC_METADATA_SCHEMAS: Record<MetricEvent, z.ZodTypeAny> = {
  queue_item_created: z.object({ actionType: z.string().max(60) }).strict(),
  queue_item_synced: z
    .object({ actionType: z.string().max(60), durationMs: z.number().int().min(0) })
    .strict(),
  queue_item_failed: z
    .object({ actionType: z.string().max(60), retryCount: z.number().int().min(0) })
    .strict(),
  care_request_submitted: z.object({ urgency: z.enum(["emergency", "urgent", "routine", "unknown"]) }).strict(),
  triage_completed: z.object({ urgency: z.enum(["emergency", "urgent", "routine"]) }).strict(),
  clinician_action_recorded: z
    .object({ action: z.enum(["assigned", "accepted", "declined"]), timeToActionMs: z.number().int().min(0) })
    .strict(),
  appointment_proposed: z.object({}).strict(),
  appointment_confirmed: z.object({}).strict(),
  appointment_completed: z.object({}).strict(),
  consultation_fallback_used: z.object({ fallback: z.enum(["text", "audio"]) }).strict(),
  pharmacy_status_updated: z
    .object({ status: z.enum(["available", "low_stock", "unavailable", "not_stocked"]) })
    .strict(),
  pharmacy_response_recorded: z
    .object({ response: z.enum(["confirmed_available", "limited", "unavailable", "cannot_confirm_now"]), responseTimeMs: z.number().int().min(0) })
    .strict(),
  consent_granted: z.object({ documentCount: z.number().int().min(1) }).strict(),
  consent_revoked: z.object({}).strict(),
};

export interface MetricRecord {
  event: MetricEvent;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

/** Validate one metric; returns null when the record violates the vocabulary. */
export function validateMetric(input: unknown): MetricRecord | null {
  const parsed = z
    .object({
      event: z.enum(METRIC_EVENTS),
      durationMs: z.number().int().min(0).optional().nullable(),
      metadata: z.record(z.unknown()).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return null;
  const { event, durationMs, metadata } = parsed.data;
  const metaCheck = METRIC_METADATA_SCHEMAS[event].safeParse(metadata ?? {});
  if (!metaCheck.success) return null;
  return { event, durationMs: durationMs ?? null, metadata: metadata ?? {} };
}

/** Explicit definitions surfaced on the dashboard (transparency requirement). */
export const METRIC_DEFINITIONS: Record<string, string> = {
  syncReliability:
    "Successfully acknowledged queued actions / attempted queued actions",
  availabilityFreshness:
    "Pharmacy statuses still within the configured freshness window",
  timeToClinicianAction:
    "Submitted request → first authorized clinician/coordinator action",
  consultationFallbackRate:
    "Completed fallback selections / attempted consultation starts",
};
