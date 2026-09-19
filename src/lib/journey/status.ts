/**
 * Journey status model (Part 5) — derives the patient's end-to-end journey
 * from REAL persisted state only: the offline queue (Part 1 engine), the
 * care-request row, the appointment row, and the pharmacy request row.
 *
 * No invented events, no fabricated progress. Every step maps to a source of
 * truth and carries a timestamp only when one genuinely exists. Internal rule
 * names and audit internals are never exposed here — just safe, localized
 * step keys that the UI translates.
 */

import type { QueueItem } from "@/lib/offline/types";

export type JourneyStepState =
  | "done"
  | "current"
  | "waiting"
  | "attention"
  | "not_started";

export interface JourneyStep {
  /** Stable key — translated in the journey dictionary (en/hi/or). */
  key: string;
  state: JourneyStepState;
  /** ISO timestamp when genuinely known; null otherwise. */
  at: string | null;
  /** Optional retry action supported for this step. */
  retryable?: boolean;
}

export interface JourneyInputs {
  queueItems: QueueItem[];
  online: boolean;
  /** Latest care request (server row or queued draft), if any. */
  careRequest?: {
    id: string;
    status: string;
    createdAt: string;
    urgency?: string | null;
  } | null;
  /** Latest appointment for the care request, if any. */
  appointment?: { id: string; state: string; updatedAt: string | null } | null;
  /** Whether a share consent was granted/revoked for this request. */
  consent?: { granted: boolean; revoked: boolean; at: string | null } | null;
  /** Latest pharmacy availability request, if any. */
  pharmacyRequest?: { id: string; status: string; createdAt: string } | null;
}

interface QueueShape {
  created: QueueItem | null;
  syncedCareRequest: QueueItem | null;
  anyPending: boolean;
  anyFailed: QueueItem | null;
  latestSyncedAt: string | null;
}

function analyzeQueue(items: QueueItem[]): QueueShape {
  const sorted = [...items].sort(
    (a, b) => new Date(b.localCreatedAt).getTime() - new Date(a.localCreatedAt).getTime(),
  );
  const created = sorted[0] ?? null;
  const syncedCareRequest =
    sorted.find((i) => i.actionType === "care_request.create" && i.state === "synced") ?? null;
  const anyPending = items.some(
    (i) => i.state === "pending" || i.state === "syncing",
  );
  const anyFailed =
    sorted.find((i) => i.state === "failed" || i.state === "requires_attention") ?? null;
  const syncedItems = items.filter((i) => i.syncedAt).map((i) => i.syncedAt as string);
  const latestSyncedAt =
    syncedItems.length > 0
      ? syncedItems.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null;
  return { created, syncedCareRequest, anyPending, anyFailed, latestSyncedAt };
}

/**
 * Deterministic derivation. Steps the patient sees:
 * captured → saved/synced → submitted → routed → review → care-team action →
 * appointment/message → consent → pharmacy → done/attention.
 */
export function deriveJourney(inputs: JourneyInputs): JourneyStep[] {
  const q = analyzeQueue(inputs.queueItems);
  const steps: JourneyStep[] = [];

  const hasStarted = Boolean(inputs.careRequest || q.created);
  steps.push({
    key: "captured",
    state: hasStarted ? "done" : "not_started",
    at: inputs.careRequest?.createdAt ?? q.created?.localCreatedAt ?? null,
  });

  if (q.anyFailed) {
    steps.push({
      key: "saved_device",
      state: "attention",
      at: q.created?.localCreatedAt ?? null,
      retryable: true,
    });
  } else if (q.anyPending) {
    steps.push({
      key: inputs.online ? "saved_device" : "saved_device",
      state: "current",
      at: q.created?.localCreatedAt ?? null,
    });
  } else {
    steps.push({
      key: "saved_device",
      state: hasStarted ? "done" : "not_started",
      at: q.created?.localCreatedAt ?? null,
    });
  }

  const synced = Boolean(q.syncedCareRequest || inputs.careRequest);
  steps.push({
    key: "synced",
    state: synced ? "done" : hasStarted ? "current" : "not_started",
    at: q.syncedCareRequest?.syncedAt ?? q.latestSyncedAt ?? null,
  });

  steps.push({
    key: "submitted",
    state: inputs.careRequest ? "done" : "not_started",
    at: inputs.careRequest?.createdAt ?? null,
  });

  const routed = Boolean(inputs.careRequest?.urgency && inputs.careRequest.urgency !== "unknown");
  steps.push({
    key: "routed",
    state: routed ? "done" : inputs.careRequest ? "current" : "not_started",
    at: routed ? (inputs.careRequest?.createdAt ?? null) : null,
  });

  const apptState = inputs.appointment?.state;
  const reviewDone = ["assigned", "accepted", "appointment_proposed", "appointment_confirmed", "in_consultation", "completed"].includes(
    apptState ?? "",
  );
  steps.push({
    key: "awaiting_review",
    state: reviewDone ? "done" : synced ? "current" : "not_started",
    at: null,
  });

  const clinicianActed = ["accepted", "appointment_proposed", "appointment_confirmed", "in_consultation", "completed"].includes(
    apptState ?? "",
  );
  steps.push({
    key: "clinician_action",
    state: clinicianActed ? "done" : reviewDone ? "current" : "not_started",
    at: null,
  });

  const apptActive = ["appointment_proposed", "appointment_confirmed", "in_consultation"].includes(
    apptState ?? "",
  );
  steps.push({
    key: "appointment",
    state:
      apptState === "completed"
        ? "done"
        : apptState === "declined" || apptState === "cancelled" || apptState === "expired"
          ? "attention"
          : apptActive
            ? "done"
            : "not_started",
    at: inputs.appointment?.updatedAt ?? null,
  });

  steps.push({
    key: "consent",
    state: inputs.consent
      ? inputs.consent.revoked
        ? "attention"
        : inputs.consent.granted
          ? "done"
          : "not_started"
      : "not_started",
    at: inputs.consent?.at ?? null,
  });

  const pharmStatus = inputs.pharmacyRequest?.status;
  steps.push({
    key: "pharmacy",
    state:
      pharmStatus === "responded"
        ? "done"
        : pharmStatus === "pending"
          ? "current"
          : "not_started",
    at: inputs.pharmacyRequest?.createdAt ?? null,
  });

  const allDone =
    steps.every((s) => s.state === "done") && (apptState === "completed" || !inputs.appointment);
  const anyAttention = steps.some((s) => s.state === "attention");
  steps.push({
    key: anyAttention ? "needs_attention" : allDone ? "completed" : "in_progress",
    state: anyAttention ? "attention" : "current",
    at: null,
  });

  return steps;
}

/** The one step the patient should look at right now (for aria-live). */
export function currentJourneyStep(steps: JourneyStep[]): JourneyStep | null {
  return steps.find((s) => s.state === "attention") ?? steps.find((s) => s.state === "current") ?? null;
}
