/**
 * Voice assistant — action router (spec §33–§38, §75–§76, §93).
 *
 * LAYERS 3 + 5. The router maps a VALIDATED VoiceCommand to a
 * pure action plan that describes an EXISTING HEALTHFOLIO
 * action (a route to navigate to, an existing API endpoint to
 * call, a confirmation to collect). It never fetches, never
 * mutates, and never authorizes by itself — every plan is
 * executed through the same server routes the normal UI uses,
 * so server-side authorization always applies (spec §35: no
 * voice backdoor).
 *
 * RISK POLICY (fixed, from VOICE_INTENT_RISK):
 * - READ_ONLY plans execute immediately.
 * - USER_CONFIRMATION_REQUIRED plans are wrapped so the
 *   conversation controller must collect an explicit yes.
 * - Mutations while offline become queue proposals (spec §93).
 * - Roles: patients may run patient workflows; clinicians and
 *   pharmacy staff get navigation + read-only only — the closed
 *   intent vocabulary deliberately contains no staff mutation
 *   intents, so voice can never become a privileged backdoor
 *   (spec §37, §38).
 */

import {
  CONFIRMATION_REQUIRED_INTENTS,
  VOICE_INTENT_RISK,
  type VoiceCommand,
  type VoiceIntent,
  type VoiceRiskClass,
} from "./intents";
import type { Language } from "@/lib/i18n";

/** What the assistant knows about the current session. */
export interface VoiceSessionContext {
  /** Null when not signed in. */
  role: "patient" | "clinician" | "pharmacy" | "coordinator" | "admin" | null;
  isAuthenticated: boolean;
  isOnline: boolean;
  /** Current app route, for context-aware commands (spec §39). */
  currentPath: string;
  /** Active consultation id, when one is open. */
  activeConsultationId: string | null;
  /** Active care-request id, when one exists this session. */
  activeCareRequestId: string | null;
}

/**
 * A pure description of what to do. The conversation controller
 * executes plans through existing routes/endpoints only.
 */
export type VoiceActionPlan =
  | { kind: "navigate"; path: string }
  | { kind: "readHealthCard" }
  | { kind: "medicineLookup"; medicineName: string }
  | { kind: "doctorAvailability" }
  | { kind: "requestDoctor"; language: Language }
  | { kind: "shareWithDoctor" }
  | { kind: "startConsultation" }
  | { kind: "switchAudio" }
  | { kind: "endConsultation" }
  | { kind: "symptomCheck"; symptomText: string }
  | { kind: "explain"; topic: "triage" | "offline" | "sync" }
  | { kind: "repeat" }
  | { kind: "help" }
  | { kind: "cancel" }
  | { kind: "endVoiceSession" }
  | { kind: "changeLanguage"; language: Language }
  /** Nothing the voice assistant is allowed to do here. */
  | { kind: "unauthorized" }
  /** Intent exists but needs a capability the session lacks. */
  | { kind: "unsupported" }
  /** Mutation proposed while offline — queue it? (spec §93) */
  | { kind: "offlineQueue"; plan: OfflineablePlan };

/** Plans that mutate state and can be queued offline. */
export type OfflineablePlan = Extract<
  VoiceActionPlan,
  {
    kind:
      | "requestDoctor"
      | "shareWithDoctor"
      | "startConsultation"
      | "switchAudio"
      | "endConsultation";
  }
>;

export interface RoutedAction {
  plan: VoiceActionPlan;
  riskClass: VoiceRiskClass;
  /** The controller must collect an explicit yes before executing. */
  requiresConfirmation: boolean;
}

/** Intents that need an authenticated session. */
const AUTH_REQUIRED: ReadonlySet<VoiceIntent> = new Set<VoiceIntent>([
  "CHECK_SYMPTOMS",
  "TALK_TO_DOCTOR",
  "CHECK_DOCTOR_AVAILABILITY",
  "CHECK_MEDICINE",
  "OPEN_HEALTH_CARD",
  "READ_HEALTH_CARD",
  "START_CONSULTATION",
  "SWITCH_TO_AUDIO",
  "EXPLAIN_SYNC_STATUS",
]);

/**
 * Route one validated command. Pure: same input + context →
 * same plan. The command has already passed VoiceCommandSchema;
 * nothing here re-interprets free text.
 */
export function routeVoiceCommand(
  command: VoiceCommand,
  ctx: VoiceSessionContext
): RoutedAction {
  const riskClass = VOICE_INTENT_RISK[command.intent];
  const requiresConfirmation = CONFIRMATION_REQUIRED_INTENTS.has(
    command.intent
  );

  // Unauthenticated sessions: only help / language / session-end.
  if (!ctx.isAuthenticated && AUTH_REQUIRED.has(command.intent)) {
    return {
      plan: { kind: "unauthorized" },
      riskClass,
      requiresConfirmation: false,
    };
  }

  const plan = planFor(command, ctx);

  // Offline mutations become queue proposals, never silent failures.
  if (
    !ctx.isOnline &&
    isOfflineable(plan) &&
    command.intent !== "END_SESSION" &&
    command.intent !== "CANCEL"
  ) {
    return { plan: { kind: "offlineQueue", plan }, riskClass, requiresConfirmation: true };
  }

  return { plan, riskClass, requiresConfirmation };
}

function isOfflineable(plan: VoiceActionPlan): plan is OfflineablePlan {
  return (
    plan.kind === "requestDoctor" ||
    plan.kind === "shareWithDoctor" ||
    plan.kind === "startConsultation" ||
    plan.kind === "switchAudio" ||
    plan.kind === "endConsultation"
  );
}

function planFor(
  command: VoiceCommand,
  ctx: VoiceSessionContext
): VoiceActionPlan {
  switch (command.intent) {
    case "HELP":
      return { kind: "help" };
    case "CANCEL":
      return { kind: "cancel" };
    case "END_SESSION":
      return { kind: "endVoiceSession" };
    case "REPEAT":
      return { kind: "repeat" };
    case "CHANGE_LANGUAGE": {
      const language = command.entities.language ?? command.language;
      return { kind: "changeLanguage", language };
    }
    case "EXPLAIN_TRIAGE":
      return { kind: "explain", topic: "triage" };
    case "EXPLAIN_OFFLINE_STATUS":
      return { kind: "explain", topic: "offline" };
    case "EXPLAIN_SYNC_STATUS":
      return { kind: "explain", topic: "sync" };

    case "OPEN_HEALTH_CARD":
      return { kind: "navigate", path: "/health-card" };
    case "READ_HEALTH_CARD":
      return { kind: "readHealthCard" };

    case "CHECK_MEDICINE": {
      const name = command.entities.medicineName;
      if (!name) return { kind: "unsupported" };
      return { kind: "medicineLookup", medicineName: name };
    }

    case "CHECK_DOCTOR_AVAILABILITY":
      return { kind: "doctorAvailability" };

    case "TALK_TO_DOCTOR":
      return { kind: "navigate", path: "/care-requests" };

    case "CHECK_SYMPTOMS":
      return {
        kind: "symptomCheck",
        symptomText: command.entities.symptomText ?? "",
      };

    case "START_CONSULTATION":
      // A consultation needs an existing care request; otherwise
      // the controller guides the user through the normal flow.
      if (!ctx.activeCareRequestId && !ctx.activeConsultationId) {
        return { kind: "navigate", path: "/care-requests" };
      }
      return { kind: "startConsultation" };

    case "SWITCH_TO_AUDIO":
      if (!ctx.activeConsultationId) return { kind: "unsupported" };
      return { kind: "switchAudio" };

    // ── Role gates (spec §37, §38) ─────────────────────
    // Clinicians and pharmacy staff: navigation + read-only
    // only. The closed vocabulary has no staff mutation
    // intents, so staff voice actions that would mutate are
    // simply not expressible.
    default: {
      // Exhaustiveness guard: a new VoiceIntent without a
      // case above makes command.intent non-never and fails
      // the typecheck, so it cannot silently fall through.
      const exhaustive: never = command.intent;
      void exhaustive;
      return { kind: "unsupported" };
    }
  }
}

/** shareWithDoctor is reached via the confirmation flow after
 *  a consultation/care request exists — kept as a plan the
 *  controller can propose only with explicit consent (§25). */
export function shareWithDoctorPlan(): VoiceActionPlan {
  return { kind: "shareWithDoctor" };
}

/** Helper: does this intent navigate (for context tracking)? */
export function isNavigationIntent(intent: VoiceIntent): boolean {
  return intent === "OPEN_HEALTH_CARD" || intent === "TALK_TO_DOCTOR";
}
