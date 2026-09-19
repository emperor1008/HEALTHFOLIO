/**
 * Zod schemas for every Part 4 write route. Rejected inputs never reach the
 * database; validation errors return safe, actionable messages without
 * leaking internals.
 */

import { z } from "zod";

export const StockStatusSchema = z.enum([
  "available",
  "low_stock",
  "unavailable",
  "not_stocked",
]);

export const StockUpdateSchema = z.object({
  pharmacyId: z.string().uuid(),
  medicineId: z.string().min(1).max(120),
  medicineLabel: z.string().min(1).max(300),
  status: StockStatusSchema,
  quantityHint: z.number().int().min(0).optional().nullable(),
  showQuantityToPatients: z.boolean().optional().default(false),
  internalNote: z.string().max(500).optional().nullable(),
  source: z.enum(["manual_operator", "approved_integration"]).optional().default("manual_operator"),
  idempotencyKey: z.string().uuid(),
});

export const AvailabilityRequestSchema = z.object({
  pharmacyId: z.string().uuid(),
  medicineId: z.string().min(1).max(120),
  medicineLabel: z.string().min(1).max(300),
  strength: z.string().max(80).optional().nullable(),
  form: z.string().max(80).optional().nullable(),
  language: z.enum(["en", "hi", "or"]).optional().default("en"),
  idempotencyKey: z.string().uuid(),
});

export const AvailabilityResponseSchema = z.object({
  requestId: z.string().uuid(),
  response: z.enum(["confirmed_available", "limited", "unavailable", "cannot_confirm_now"]),
  noteForPatient: z.string().max(300).optional().nullable(),
  idempotencyKey: z.string().uuid(),
});

export const StockQuerySchema = z.object({
  medicineId: z.string().min(1).max(120),
});

export type StockUpdateInput = z.infer<typeof StockUpdateSchema>;
export type AvailabilityRequestInput = z.infer<typeof AvailabilityRequestSchema>;
export type AvailabilityResponseInput = z.infer<typeof AvailabilityResponseSchema>;
