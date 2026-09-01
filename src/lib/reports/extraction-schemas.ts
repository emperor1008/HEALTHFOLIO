/**
 * Zod schemas for laboratory report extraction.
 *
 * Strict validation of AI output — no invented values allowed.
 * Document text is untrusted evidence, not an instruction.
 */

import { z } from "zod";

// ─── Evidence locator for extracted measurements ──────────────────────────

export const MeasurementEvidenceSchema = z.object({
  page: z.number().int().positive(),
  textQuote: z.string().min(1),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .optional(),
  rowIdentifier: z.string().nullable().optional(),
  ocrConfidence: z.number().min(0).max(1).nullable().optional(),
});

export type MeasurementEvidence = z.infer<typeof MeasurementEvidenceSchema>;

// ─── Individual measurement extraction ────────────────────────────────────

export const ExtractedMeasurementSchema = z
  .object({
    rawTestName: z.string().min(1),
    normalizedTestName: z.string().nullable(),
    resultType: z.enum([
      "numeric",
      "qualitative",
      "ordinal",
      "ratio",
      "text",
      "unknown",
    ]),
    rawValueText: z.string().min(1),
    numericValue: z.number().finite().nullable(),
    comparator: z
      .enum(["less_than", "less_than_or_equal", "equal", "greater_than_or_equal", "greater_than"])
      .nullable(),
    qualitativeValue: z.string().nullable(),
    unitRaw: z.string().nullable(),
    referenceRangeRaw: z.string().nullable(),
    referenceLower: z.number().finite().nullable(),
    referenceUpper: z.number().finite().nullable(),
    referenceText: z.string().nullable(),
    laboratoryFlagRaw: z.string().nullable(),
    specimen: z.string().nullable(),
    method: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    evidence: MeasurementEvidenceSchema,
  })
  .refine(
    (data) => {
      if (data.resultType === "numeric") {
        return data.numericValue !== null || data.rawValueText.length > 0;
      }
      return true;
    },
    { message: "Numeric results must have a numeric value or raw text" }
  );

export type ExtractedMeasurement = z.infer<typeof ExtractedMeasurementSchema>;

// ─── Panel grouping ───────────────────────────────────────────────────────

export const ExtractedPanelSchema = z.object({
  panelName: z.string().nullable(),
  measurements: z.array(ExtractedMeasurementSchema).min(1),
});

export type ExtractedPanel = z.infer<typeof ExtractedPanelSchema>;

// ─── Full lab report extraction ───────────────────────────────────────────

export const LabReportExtractionSchema = z.object({
  report: z.object({
    laboratoryName: z.string().nullable(),
    reportNumber: z.string().nullable(),
    patientName: z.string().nullable(),
    orderingClinician: z.string().nullable(),
    collectionDate: z.string().nullable(),
    reportDate: z.string().nullable(),
    specimen: z.string().nullable(),
    fastingStatus: z.string().nullable(),
  }),
  panels: z.array(ExtractedPanelSchema),
  warnings: z.array(z.string()),
});

export type LabReportExtraction = z.infer<typeof LabReportExtractionSchema>;

// ─── AI test explanation schema ───────────────────────────────────────────

export const TestExplanationSchema = z.object({
  testKey: z.string(),
  summary: z.string(),
  sourceClaims: z.array(
    z.object({
      text: z.string().min(1),
      sourceIdentifier: z.string().min(1),
      sourceUrl: z.string().url(),
      sourceSection: z.string().min(1),
    })
  ),
  limitations: z.array(z.string()),
  diagnosisProvided: z.boolean(),
  treatmentProvided: z.boolean(),
});

export type TestExplanation = z.infer<typeof TestExplanationSchema>;

// ─── Report summary schema ────────────────────────────────────────────────

export const ReportSummarySchema = z.object({
  text: z.string(),
  totalTestsDetected: z.number().int().nonnegative(),
  withinRange: z.number().int().nonnegative(),
  aboveRange: z.number().int().nonnegative(),
  belowRange: z.number().int().nonnegative(),
  abnormalFlagged: z.number().int().nonnegative(),
  criticalFlagged: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  notEvaluable: z.number().int().nonnegative(),
});

export type ReportSummary = z.infer<typeof ReportSummarySchema>;
