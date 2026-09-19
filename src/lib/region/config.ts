/**
 * Multi-region configuration (Part 5) — regional adaptation is CONFIG, not
 * hard-coded constants. Nothing region-specific (town, hospital, emergency
 * number, phone, language list) is baked into code; until an authorized
 * administrator configures a region, the UI shows generic safe defaults and
 * never invents local details.
 *
 * Storage: `region_config` keyed by region slug. Writes are admin-only via
 * the server API; this module exposes typed accessors used by the server.
 */

import { z } from "zod";

export const RegionConfigSchema = z.object({
  region: z.string().min(1).max(60),
  /** Languages enabled for this region (subset of the platform languages). */
  languages: z.array(z.enum(["en", "hi", "or"])).min(1),
  /** Human-readable service area description supplied by the administrator. */
  serviceAreaText: z.string().max(300),
  /** Localized emergency guidance — configured per region, never hard-coded. */
  emergencyGuidance: z.object({
    instruction: z.string().min(1).max(400),
    phoneNumber: z.string().min(1).max(20).nullable(),
  }),
  /** Appointment booking hours (facility-local, ISO-ish). */
  appointmentHours: z.object({
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
  }),
  /** Stock freshness policy override (hours). */
  freshness: z.object({
    freshHours: z.number().int().min(1).max(24 * 30),
    staleHours: z.number().int().min(1).max(24 * 60),
    expiredHours: z.number().int().min(1).max(24 * 90),
  }),
  /** Consultation modes this region can genuinely support. */
  consultationModes: z.object({
    text: z.boolean(),
    audio: z.boolean(),
    video: z.boolean(),
  }),
  /** Regional help contact, shown in Settings only when configured. */
  helpContact: z
    .object({
      label: z.string().min(1).max(100),
      value: z.string().min(1).max(100),
    })
    .nullable(),
  /** Feature flags for this region. */
  features: z.object({
    videoConsultation: z.boolean(),
    voiceNotes: z.boolean(),
    pharmacyConfirmation: z.boolean(),
    staffPortal: z.boolean(),
  }),
});

export type RegionConfig = z.infer<typeof RegionConfigSchema>;

/**
 * Safe default used when a region is not configured: generic guidance with no
 * fabricated phone numbers, no locations, all optional features off.
 */
export const UNCONFIGURED_REGION: RegionConfig = {
  region: "unconfigured",
  languages: ["en", "hi", "or"],
  serviceAreaText: "",
  emergencyGuidance: {
    instruction:
      "If this may be life-threatening, contact your local emergency services or go to the nearest emergency facility now.",
    phoneNumber: null,
  },
  appointmentHours: { openHour: 9, closeHour: 17 },
  freshness: { freshHours: 24, staleHours: 72, expiredHours: 168 },
  consultationModes: { text: true, audio: false, video: false },
  helpContact: null,
  features: {
    videoConsultation: false,
    voiceNotes: false,
    pharmacyConfirmation: true,
    staffPortal: false,
  },
};

export function validateRegionConfig(input: unknown): RegionConfig | null {
  const parsed = RegionConfigSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
