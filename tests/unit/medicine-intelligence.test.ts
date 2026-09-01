import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  normalizeMedicineName,
  extractStrength,
  extractDoseForm,
  extractRoute,
  isLikelyBrandName,
  calculateNameSimilarity,
  doFormulationsMatch,
} from "@/lib/medicines/normalize";
import {
  isEmergencyQuery,
  getEmergencyMessage,
  hasUnsafeDosagePattern,
  areFormulationsCompatible,
  SAFETY_DISCLAIMERS,
} from "@/lib/medicines/safety";
import {
  validateSearchQuery,
  validateSourceUrl,
  MedicineSearchInputSchema,
  MedicineIdentitySchema,
  LabelSectionSchema,
  SourceCitationSchema,
  AIExplanationSchema,
} from "@/lib/medicines/schemas";
import {
  generateCitation,
  validateCitation,
  validateAICitations,
  formatCitation,
} from "@/lib/medicines/citations";
import type { SourceLocator, MedicineLabelSection } from "@/lib/medicines/types";

// ─── Normalization Tests ──────────────────────────────────────────────────

describe("Medicine Name Normalization", () => {
  it("normalizes basic names", () => {
    expect(normalizeMedicineName("Paracetamol")).toBe("paracetamol");
    expect(normalizeMedicineName("  Aspirin  ")).toBe("aspirin");
  });

  it("removes special characters", () => {
    expect(normalizeMedicineName("Amoxicillin®")).toBe("amoxicillin");
    expect(normalizeMedicineName("Tylenol™")).toBe("tylenol");
  });

  it("collapses whitespace", () => {
    expect(normalizeMedicineName("Ibuprofen   200mg")).toBe("ibuprofen 200mg");
  });

  it("extracts strength from name", () => {
    expect(extractStrength("Paracetamol 500mg")).toBe("500mg");
    expect(extractStrength("Amoxicillin 250 mg/5ml")).toBe("250 mg");
    expect(extractStrength("Ibuprofen")).toBeNull();
  });

  it("extracts dose form", () => {
    expect(extractDoseForm("Paracetamol Tablet")).toBe("tablet");
    expect(extractDoseForm("Amoxicillin Capsule")).toBe("capsule");
    expect(extractDoseForm("Ibuprofen Gel")).toBe("gel");
    expect(extractDoseForm("Aspirin")).toBeNull();
  });

  it("extracts route", () => {
    expect(extractRoute("Oral Paracetamol")).toBe("oral");
    expect(extractRoute("Intravenous Injection")).toBe("intravenous");
    expect(extractRoute("Topical Cream")).toBe("topical");
    expect(extractRoute("Paracetamol")).toBeNull();
  });

  it("identifies brand names", () => {
    expect(isLikelyBrandName("Tylenol")).toBe(true);
    expect(isLikelyBrandName("Paracetamol")).toBe(false);
    expect(isLikelyBrandName("Crocin")).toBe(true);
  });

  it("calculates name similarity", () => {
    expect(calculateNameSimilarity("Paracetamol", "Paracetamol")).toBe(1.0);
    expect(calculateNameSimilarity("Paracetamol", "paracetamol")).toBe(1.0);
    expect(calculateNameSimilarity("Ibuprofen", "Paracetamol")).toBeLessThan(0.5);
  });

  it("matches formulations correctly", () => {
    const result = doFormulationsMatch("500mg", "tablet", "oral", "500mg", "tablet", "oral");
    expect(result.match).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("rejects mismatched formulations", () => {
    const result = doFormulationsMatch("500mg", "tablet", "oral", "250mg", "injection", "intravenous");
    expect(result.match).toBe(false);
  });
});

// ─── Safety Tests ─────────────────────────────────────────────────────────

describe("Medicine Safety", () => {
  it("detects emergency queries", () => {
    expect(isEmergencyQuery("What happens in an overdose?")).toBe(true);
    expect(isEmergencyQuery("I'm having chest pain")).toBe(true);
    expect(isEmergencyQuery("breathing difficulty after taking medicine")).toBe(true);
    expect(isEmergencyQuery("What is paracetamol used for?")).toBe(false);
  });

  it("returns emergency message", () => {
    const msg = getEmergencyMessage();
    expect(msg).toContain("EMERGENCY");
    expect(msg).toContain("112");
    expect(msg).toContain("emergency");
  });

  it("detects unsafe dosage patterns", () => {
    expect(hasUnsafeDosagePattern("50000mg")).toBe(true);
    expect(hasUnsafeDosagePattern("every minute")).toBe(true);
    expect(hasUnsafeDosagePattern("500mg twice daily")).toBe(false);
  });

  it("checks formulation compatibility", () => {
    expect(areFormulationsCompatible("tablet", "oral", "capsule", "oral")).toBe(true);
    expect(areFormulationsCompatible("tablet", "oral", "injection", "intravenous")).toBe(false);
    expect(areFormulationsCompatible(null, null, null, null)).toBe(true);
  });

  it("has all required safety disclaimers", () => {
    expect(SAFETY_DISCLAIMERS.GENERAL).toBeTruthy();
    expect(SAFETY_DISCLAIMERS.PRESCRIPTION).toBeTruthy();
    expect(SAFETY_DISCLAIMERS.LABEL).toBeTruthy();
    expect(SAFETY_DISCLAIMERS.AI_EXPLANATION).toBeTruthy();
    expect(SAFETY_DISCLAIMERS.UNAVAILABLE).toBeTruthy();
    expect(SAFETY_DISCLAIMERS.NO_AGE_INFO).toBeTruthy();
  });
});

// ─── Schema Validation Tests ──────────────────────────────────────────────

describe("Medicine Schemas", () => {
  it("validates search input", () => {
    expect(validateSearchQuery("paracetamol").valid).toBe(true);
    expect(validateSearchQuery("").valid).toBe(false);
    expect(validateSearchQuery("   ").valid).toBe(false);
  });

  it("validates source URLs", () => {
    expect(validateSourceUrl("https://rxnav.nlm.nih.gov/REST/rxcui/123")).toBe(true);
    expect(validateSourceUrl("https://dailymed.nlm.nih.gov/dailymed/setid/abc")).toBe(true);
    expect(validateSourceUrl("https://api.fda.gov/drug/label.json")).toBe(true);
    expect(validateSourceUrl("https://evil.com/steal")).toBe(false);
    expect(validateSourceUrl("not-a-url")).toBe(false);
  });

  it("validates MedicineIdentitySchema", () => {
    const valid = {
      rxcui: "12345",
      normalizedName: "paracetamol",
      displayName: "Paracetamol 500mg",
      entityType: "clinical_drug" as const,
      genericName: "Paracetamol",
      brandName: null,
      strength: "500mg",
      doseForm: "tablet",
      route: "oral",
      activeIngredients: [{ name: "Paracetamol", strength: "500mg", unit: "mg" }],
      sourceStatus: "verified" as const,
    };
    expect(MedicineIdentitySchema.safeParse(valid).success).toBe(true);
  });

  it("validates LabelSectionSchema", () => {
    const valid = {
      sectionKey: "dosage_and_administration",
      sectionTitle: "Dosage and Administration",
      originalText: "Adults: 500mg every 4-6 hours",
      plainLanguageText: null,
      aiGenerated: false,
      sourceLocator: {
        sourceName: "dailymed",
        sourceUrl: "https://dailymed.nlm.nih.gov/test",
        sourceRecordId: "abc-123",
        sectionTitle: "Dosage",
        effectiveDate: "2025-01-01",
        retrievedAt: "2025-01-15T00:00:00Z",
      },
    };
    expect(LabelSectionSchema.safeParse(valid).success).toBe(true);
  });

  it("validates SourceCitationSchema", () => {
    const valid = {
      sourceOrganization: "DailyMed (NLM)",
      sourceDocumentName: "Test Label",
      sourceIdentifier: "abc-123",
      sourceUrl: "https://dailymed.nlm.nih.gov/test",
      effectiveDate: "2025-01-01",
      retrievedAt: "2025-01-15T00:00:00Z",
      sectionTitle: "Dosage",
    };
    expect(SourceCitationSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid URL in citation", () => {
    const invalid = {
      sourceOrganization: "DailyMed (NLM)",
      sourceDocumentName: "Test",
      sourceIdentifier: "abc",
      sourceUrl: "not-a-url",
      effectiveDate: null,
      retrievedAt: "2025-01-15T00:00:00Z",
      sectionTitle: "Test",
    };
    expect(SourceCitationSchema.safeParse(invalid).success).toBe(false);
  });
});

// ─── Citation Tests ───────────────────────────────────────────────────────

describe("Medicine Citations", () => {
  const testLocator: SourceLocator = {
    sourceName: "dailymed",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/setid/test",
    sourceRecordId: "test-set-id",
    sectionTitle: "Dosage and Administration",
    effectiveDate: "2025-01-01",
    retrievedAt: "2025-01-15T00:00:00Z",
  };

  it("generates citation from locator", () => {
    const citation = generateCitation(testLocator);
    expect(citation.sourceOrganization).toBe("DailyMed (NLM)");
    expect(citation.sourceIdentifier).toBe("test-set-id");
    expect(citation.sectionTitle).toBe("Dosage and Administration");
  });

  it("validates real citations", () => {
    const citation = generateCitation(testLocator);
    expect(validateCitation(citation)).toBe(true);
  });

  it("rejects citation with invalid URL", () => {
    const citation = generateCitation(testLocator);
    citation.sourceUrl = "not-a-url";
    expect(validateCitation(citation)).toBe(false);
  });

  it("validates AI citations against available sections", () => {
    const sections: Array<{ sectionKey: string }> = [
      { sectionKey: "dosage_and_administration" },
      { sectionKey: "indications_and_usage" },
    ];
    const result = validateAICitations(
      ["dosage_and_administration", "nonexistent_section"],
      sections
    );
    expect(result.valid).toContain("dosage_and_administration");
    expect(result.invalid).toContain("nonexistent_section");
  });

  it("formats citation for display", () => {
    const citation = generateCitation(testLocator);
    const formatted = formatCitation(citation);
    expect(formatted).toContain("DailyMed");
    expect(formatted).toContain("test-set-id");
  });
});
