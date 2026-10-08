/**
 * Zod schemas for every authentication-adjacent write. Shared by client
 * validation and server route handlers so the contract is identical.
 */
import { z } from "zod";

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, "NAME_REQUIRED").max(120, "NAME_TOO_LONG"),
  dob: z
    .string()
    .min(1, "DOB_REQUIRED")
    .refine((v) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      const age =
        (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 13 && age < 130;
    }, "DOB_INVALID"),
  gender: z.enum(["female", "male", "other"]).optional(),
  region: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(254),
  password: z.string().min(8, "PASSWORD_TOO_SHORT").max(128),
  consent: z.literal(true, {
    errorMap: () => ({ message: "CONSENT_REQUIRED" }),
  }),
});

export const DoctorApplicationSchema = z.object({
  name: z.string().trim().min(1, "NAME_REQUIRED").max(120),
  email: z.string().trim().email().max(254),
  licenceNumber: z
    .string()
    .trim()
    .min(4, "LICENCE_REQUIRED")
    .max(64, "LICENCE_TOO_LONG"),
  specialty: z.string().trim().min(1, "SPECIALTY_REQUIRED").max(120),
  facilityName: z.string().trim().min(1, "FACILITY_REQUIRED").max(160),
  facilityId: z.string().uuid().optional(),
  region: z.string().trim().min(1, "REGION_REQUIRED").max(160),
  attestation: z.literal(true, {
    errorMap: () => ({ message: "ATTESTATION_REQUIRED" }),
  }),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(10).max(512),
  newPassword: z.string().min(8, "PASSWORD_TOO_SHORT").max(128),
});

/** Admin console role actions (never accepts platform_admin from the client). */
export const AdminRoleActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    email: z.string().trim().email().max(254),
    role: z.enum(["doctor", "facility_admin"]),
    facilityId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("assign_facility_admin"),
    email: z.string().trim().email().max(254),
    facilityId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("suspend"),
    userId: z.string().uuid(),
    role: z.enum(["doctor", "facility_admin", "doctor_pending"]),
  }),
  z.object({
    action: z.literal("revoke"),
    userId: z.string().uuid(),
    role: z.enum(["doctor", "facility_admin", "doctor_pending"]),
  }),
  z.object({
    action: z.literal("review_application"),
    applicationId: z.string().uuid(),
    decision: z.enum(["under_review", "approved", "declined"]),
    reasonCode: z.string().trim().max(64).optional(),
  }),
]);

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type DoctorApplicationInput = z.infer<typeof DoctorApplicationSchema>;
export type AdminRoleAction = z.infer<typeof AdminRoleActionSchema>;
