/**
 * Care-request packet schema (Part 2) — the single contract shared by the
 * wizard (client), the offline queue payload, and the API (server).
 *
 * SAFETY RULES ENCODED HERE
 * - Only user-confirmed data may enter a packet: no server-inferred fields,
 *   no diagnoses, no unverified clinical facts.
 * - Triage rule IDs must match the engine's ID format; arbitrary strings
 *   (which could smuggle "diagnosis" wording) are rejected.
 * - Concepts must be from the closed broad set in concepts.ts.
 * - A packet that resulted in emergency or urgent triage MUST carry the
 *   emergency-safety acknowledgement (`acknowledged_emergency_guidance`),
 *   or it cannot be submitted.
 * - The user-visible summary is limited length, plain language, and is
 *   generated in the UI from confirmed fields — never a server diagnosis.
 */

import { z } from "zod";
import { SYMPTOM_CONCEPTS, BODY_AREAS, SYMPTOM_CATEGORIES, AGE_GROUPS } from "./concepts";
import { FOLLOW_UP_IDS } from "./red-flags";

export const TriageCategorySchema = z.enum(["emergency", "urgent", "routine"]);

/** Rule IDs look like EM-01 / UR-07. Anything else is rejected. */
export const RuleIdSchema = z.string().regex(/^(EM|UR)-\d{2}$/, "INVALID_RULE_ID");

export const FollowUpsSchema = z
  .record(z.enum(FOLLOW_UP_IDS), z.boolean())
  .default({});

export const PacketSchema = z
  .object({
    /** Client-generated packet ID (UUID). Server preserves it via idempotency. */
    packet_id: z.string().uuid(),
    /** Preferred language of the person writing the request. */
    language: z.enum(["en", "hi", "or"]),
    /** Original free text, preserved verbatim, or null when unused. */
    symptom_text_original: z.string().max(2000).nullable(),
    /** User-confirmed broad concepts only. */
    symptom_concepts: z.array(z.enum(SYMPTOM_CONCEPTS)).max(11),
    body_area: z.enum(BODY_AREAS).nullable(),
    symptom_category: z.enum(SYMPTOM_CATEGORIES).nullable(),
    /** Only yes/no answers for the known follow-up set. */
    follow_up_answers: FollowUpsSchema,
    age_group: z.enum(AGE_GROUPS).nullable(),
    triage_category: TriageCategorySchema,
    triage_rules_version: z.string().min(1).max(40),
    triage_rule_ids: z.array(RuleIdSchema).max(30),
    linked_document_ids: z.array(z.string().uuid()).max(20),
    /** ISO timestamp of packet creation on the device. */
    created_at: z.string().datetime(),
    /**
     * Emergency/urgent guidance acknowledgement. REQUIRED for emergency and
     * urgent packets — enforced below with a superRefine.
     */
    acknowledged_emergency_guidance: z.boolean().default(false),
    /** Short user-visible summary in the packet language. */
    summary: z.string().min(1).max(500),
  })
  .superRefine((packet, ctx) => {
    if (
      (packet.triage_category === "emergency" || packet.triage_category === "urgent") &&
      !packet.acknowledged_emergency_guidance
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acknowledged_emergency_guidance"],
        message: "EMERGENCY_ACK_REQUIRED",
      });
    }
    // An emergency packet must be traceable to at least one EM rule.
    if (
      packet.triage_category === "emergency" &&
      !packet.triage_rule_ids.some((id) => id.startsWith("EM-"))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["triage_rule_ids"],
        message: "EMERGENCY_REQUIRES_EM_RULE",
      });
    }
  });

export type CareRequestPacket = z.infer<typeof PacketSchema>;

/** Safe row shape returned by the API (no internal wording beyond rule IDs). */
export const PacketRowSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  created_at: z.string(),
  triage_category: TriageCategorySchema.nullable(),
});
export type CareRequestPacketRow = z.infer<typeof PacketRowSchema>;

/**
 * Build a new, empty packet skeleton from confirmed wizard inputs.
 * Triaging and acknowledgement are filled by the wizard before submission;
 * this helper exists so every packet gets a consistent shape + UUIDs.
 */
export function newPacketSkeleton(input: {
  language: CareRequestPacket["language"];
  now?: string;
}): CareRequestPacket {
  return {
    packet_id: crypto.randomUUID(),
    language: input.language,
    symptom_text_original: null,
    symptom_concepts: [],
    body_area: null,
    symptom_category: null,
    follow_up_answers: {},
    age_group: null,
    triage_category: "routine",
    triage_rules_version: "",
    triage_rule_ids: [],
    linked_document_ids: [],
    created_at: input.now ?? new Date().toISOString(),
    acknowledged_emergency_guidance: false,
    summary: "",
  };
}
