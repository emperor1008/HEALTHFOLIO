/**
 * Appointment lifecycle state machine (pure, no I/O).
 *
 * States (documented in docs/care-coordination-part3.md):
 *   draft → queued_offline → submitted → awaiting_review → assigned → accepted
 *   → appointment_proposed → appointment_confirmed → in_consultation → completed
 * Terminal: cancelled | declined | expired | needs_attention
 *
 * Rules:
 * - Transitions are validated server-side using this module.
 * - Each transition declares which actor roles may perform it.
 * - Re-asserting the current state is an idempotent no-op (ok).
 * - Emergency requests never enter this flow (guarded upstream).
 */

export const APPOINTMENT_STATES = [
  "draft",
  "queued_offline",
  "submitted",
  "awaiting_review",
  "assigned",
  "accepted",
  "appointment_proposed",
  "appointment_confirmed",
  "in_consultation",
  "completed",
  "cancelled",
  "declined",
  "expired",
  "needs_attention",
] as const;

export type AppointmentState = (typeof APPOINTMENT_STATES)[number];

export const TERMINAL_STATES = ["completed", "cancelled", "declined", "expired", "needs_attention"] as const;

export type ActorRole = "patient" | "clinician" | "coordinator" | "system";

export interface TransitionRequest {
  from: string;
  to: string;
  actorRole: ActorRole;
}

export interface TransitionResult {
  ok: boolean;
  /** "noop" when `to` equals current state (idempotent retry). */
  kind: "ok" | "noop" | "invalid";
  reason?: string;
}

type ActorRoles = readonly ActorRole[];

const P = "patient" as const;
const C = "clinician" as const;
const K = "coordinator" as const;
const S = "system" as const;

/** Allowed transitions and the actor roles permitted to perform them. */
const TRANSITIONS: Record<string, Record<string, ActorRoles>> = {
  draft: {
    submitted: [S],
    queued_offline: [S, P],
    cancelled: [P],
  },
  queued_offline: {
    submitted: [S],
    cancelled: [P],
  },
  submitted: {
    awaiting_review: [S, K, C],
    cancelled: [P],
    needs_attention: [S, K],
  },
  awaiting_review: {
    assigned: [C, K],
    declined: [C],
    cancelled: [P],
    needs_attention: [S, K],
  },
  assigned: {
    accepted: [C],
    declined: [C],
    appointment_proposed: [C],
    cancelled: [P],
    needs_attention: [S, K],
  },
  accepted: {
    appointment_proposed: [C],
    cancelled: [P],
    needs_attention: [S, K],
  },
  appointment_proposed: {
    appointment_confirmed: [P, K],
    declined: [C, P],
    cancelled: [P],
    needs_attention: [S, K],
  },
  appointment_confirmed: {
    in_consultation: [C, P],
    cancelled: [P],
    expired: [S, K],
    needs_attention: [S, K],
},
  in_consultation: {
    completed: [C, P],
    needs_attention: [S, K],
  },
  completed: {},
  cancelled: {},
  declined: {},
  expired: {},
  needs_attention: {},
};

export function isAppointmentState(value: unknown): value is string {
  return typeof value === "string" && value in TRANSITIONS;
}

/** Validate a transition. Pure — used by APIs and tests. */
export function validateAppointmentTransition(req: TransitionRequest): TransitionResult {
  const { from, to, actorRole } = req;
  if (from === to) {
    return { ok: true, kind: "noop" }; // idempotent duplicate
  }
  const row = TRANSITIONS[from];
  if (!row) return { ok: false, kind: "invalid", reason: "UNKNOWN_FROM_STATE" };
  if (!(to in row)) {
    return { ok: false, kind: "invalid", reason: "INVALID_TRANSITION" };
  }
  const roles = row[to];
  if (!roles.includes(actorRole)) {
    return { ok: false, kind: "invalid", reason: "ROLE_NOT_PERMITTED" };
  }
  return { ok: true, kind: "ok" };
}

/** Public, safe listing for UI hints. */
export function allowedTransitions(from: string, actorRole: ActorRole): string[] {
  const row = TRANSITIONS[from];
  if (!row) return [];
  return Object.entries(row)
    .filter(([, roles]) => roles.includes(actorRole))
    .map(([to]) => to);
}
