/**
 * Medicine Service Layer
 * Orchestrates source adapters, caching, database operations, and API responses.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { searchRxNorm, resolveRxCUI } from "./sources/rxnorm";
import { searchDailyMed, getDailyMedLabel, convertToLabelSections } from "./sources/dailymed";
import { searchOpenFDA, getOpenFDALabel } from "./sources/openfda";
import { normalizeMedicineName, extractStrength, extractDoseForm, extractRoute } from "./normalize";
import { generateSectionCitations, validateCitation, createSourceLocator } from "./citations";
import { getCoverageWarnings } from "./safety";
import type {
  MedicineSearchResult,
  MedicineIdentity,
  MedicineLabelSection,
  MedicineSourceRecord,
  UserMedicineLink,
  SourceCitation,
} from "./types";

let _admin: ReturnType<typeof createAdminClient> | null = null;
function getAdmin() {
  if (!_admin) _admin = createAdminClient();
  return _admin;
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Search for medicines across all enabled sources.
 * Returns normalized candidates with deduplication.
 */
export async function searchMedicines(
  query: string
): Promise<{
  results: MedicineSearchResult[];
  sourcesQueried: string[];
  error?: string;
}> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { results: [], sourcesQueried: [], error: "MEDICINE_QUERY_REQUIRED" };
  }

  const sourcesQueried: string[] = [];
  const allResults: MedicineSearchResult[] = [];

  // Query RxNorm (primary source)
  try {
    const rxnormResults = await searchRxNorm(trimmed);
    sourcesQueried.push("rxnorm");
    allResults.push(...rxnormResults.results);
  } catch {
    // RxNorm failed — continue with other sources
  }

  // Query DailyMed
  try {
    const dailymedResults = await searchDailyMed(trimmed);
    sourcesQueried.push("dailymed");
    // DailyMed results are label-based, add as additional candidates
    for (const r of dailymedResults.results) {
      if (!allResults.some((a) => a.name.toLowerCase() === r.name.toLowerCase())) {
        allResults.push({
          rxcui: r.setid,
          name: r.name,
          entityType: "clinical_drug",
          genericName: null,
          brandName: null,
          strength: null,
          doseForm: null,
          route: null,
          source: "dailymed",
        });
      }
    }
  } catch {
    // DailyMed failed — continue
  }

  // Deduplicate by normalized name
  const seen = new Map<string, MedicineSearchResult>();
  for (const result of allResults) {
    const normalized = normalizeMedicineName(result.name);
    if (!seen.has(normalized)) {
      seen.set(normalized, result);
    }
  }

  return {
    results: Array.from(seen.values()).slice(0, 20),
    sourcesQueried,
  };
}

// ─── Detail ───────────────────────────────────────────────────────────────

/**
 * Get full medicine detail including identity, labels, and sources.
 */
export async function getMedicineDetail(
  medicineEntityId: string,
  userId?: string
): Promise<{
  identity: MedicineIdentity | null;
  labelSections: MedicineLabelSection[];
  sourceRecords: MedicineSourceRecord[];
  userLinks: UserMedicineLink[];
  citations: SourceCitation[];
  coverageWarnings: string[];
  error?: string;
}> {
  // Fetch entity
  const { data: entity } = await getAdmin()
    .from("medicine_entities")
    .select("*")
    .eq("id", medicineEntityId)
    .single();

  if (!entity) {
    return {
      identity: null,
      labelSections: [],
      sourceRecords: [],
      userLinks: [],
      citations: [],
      coverageWarnings: [],
      error: "MEDICINE_NOT_FOUND",
    };
  }

  // Fetch source records
  const { data: sourceRecords } = await getAdmin()
    .from("medicine_source_records")
    .select("*")
    .eq("medicine_entity_id", medicineEntityId)
    .order("retrieved_at", { ascending: false });

  // Fetch label sections
  const sourceRecordIds = (sourceRecords || []).map((r) => r.id);
  let labelSections: MedicineLabelSection[] = [];

  if (sourceRecordIds.length > 0) {
    const { data: sections } = await getAdmin()
      .from("medicine_label_sections")
      .select("*")
      .in("source_record_id", sourceRecordIds);

    labelSections = (sections || []) as MedicineLabelSection[];
  }

  // Fetch user links if userId provided
  let userLinks: UserMedicineLink[] = [];
  if (userId) {
    const { data: links } = await getAdmin()
      .from("user_medicine_links")
      .select("*")
      .eq("user_id", userId)
      .eq("medicine_entity_id", medicineEntityId);

    userLinks = (links || []) as UserMedicineLink[];
  }

  // Generate citations
  const citations = generateSectionCitations(labelSections);

  // Get coverage warnings
  const hasDailyMed = (sourceRecords || []).some((r) => r.source_name === "dailymed");
  const hasOpenFDA = (sourceRecords || []).some((r) => r.source_name === "openfda");
  const hasRxNorm = !!entity.rxcui;
  const isIndianBrand = entity.source_status === "unverified" && !entity.generic_name;
  const coverageWarnings = getCoverageWarnings(hasDailyMed, hasOpenFDA, hasRxNorm, isIndianBrand, !!entity.generic_name);

  const identity: MedicineIdentity = {
    id: entity.id,
    rxcui: entity.rxcui,
    normalizedName: entity.normalized_name,
    displayName: entity.display_name,
    entityType: entity.entity_type,
    genericName: entity.generic_name,
    brandName: entity.brand_name,
    strength: entity.strength,
    doseForm: entity.dose_form,
    route: entity.route,
    activeIngredients: entity.active_ingredients || [],
    sourceStatus: entity.source_status,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };

  return {
    identity,
    labelSections,
    sourceRecords: (sourceRecords || []) as MedicineSourceRecord[],
    userLinks,
    citations,
    coverageWarnings,
  };
}

// ─── Resolve from Prescription ────────────────────────────────────────────

/**
 * Resolve a prescription item to medicine candidates.
 */
export async function resolvePrescriptionItem(
  prescriptionItemId: string,
  userId: string
): Promise<{
  candidates: MedicineSearchResult[];
  prescriptionText: string;
  medicineName: string | null;
  error?: string;
}> {
  // Verify ownership
  const { data: item } = await getAdmin()
    .from("prescription_items")
    .select("id, raw_medicine_text, medicine_name, user_id")
    .eq("id", prescriptionItemId)
    .eq("user_id", userId)
    .single();

  if (!item) {
    return {
      candidates: [],
      prescriptionText: "",
      medicineName: null,
      error: "PRESCRIPTION_ITEM_NOT_FOUND",
    };
  }

  // Search using medicine name or raw text
  const searchTerm = item.medicine_name || item.raw_medicine_text;
  const searchResult = await searchMedicines(searchTerm);

  return {
    candidates: searchResult.results,
    prescriptionText: item.raw_medicine_text,
    medicineName: item.medicine_name,
    error: searchResult.error,
  };
}

// ─── Link Medicine ────────────────────────────────────────────────────────

/**
 * Link a medicine entity to a user's prescription or manual save.
 */
export async function linkMedicine(params: {
  userId: string;
  medicineEntityId: string;
  prescriptionItemId?: string;
  documentId?: string;
  relationshipType: string;
}): Promise<{ success: boolean; linkId?: string; error?: string }> {
  // Check for existing link
  const { data: existing } = await getAdmin()
    .from("user_medicine_links")
    .select("id")
    .eq("user_id", params.userId)
    .eq("medicine_entity_id", params.medicineEntityId)
    .eq("relationship_type", params.relationshipType)
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: true, linkId: existing[0].id };
  }

  // Create new link
  const { data: link, error } = await getAdmin()
    .from("user_medicine_links")
    .insert({
      user_id: params.userId,
      medicine_entity_id: params.medicineEntityId,
      prescription_item_id: params.prescriptionItemId || null,
      document_id: params.documentId || null,
      relationship_type: params.relationshipType,
      verification_status: "confirmed",
      evidence_locator: params.prescriptionItemId
        ? JSON.stringify({ prescriptionItemId: params.prescriptionItemId })
        : null,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: "DATABASE_WRITE_FAILED" };
  }

  return { success: true, linkId: link?.id };
}

// ─── Get User's Prescribed Medicines ──────────────────────────────────────

/**
 * Get medicines linked to the user's prescriptions.
 */
export async function getUserPrescribedMedicines(
  userId: string
): Promise<{
  medicines: Array<{
    link: UserMedicineLink;
    entity: MedicineIdentity | null;
    prescriptionText: string | null;
  }>;
}> {
  const { data: links } = await getAdmin()
    .from("user_medicine_links")
    .select(`
      *,
      medicine_entity:medicine_entity_id(*),
      prescription_item:prescription_item_id(raw_medicine_text, medicine_name, dose_text, frequency_text)
    `)
    .eq("user_id", userId)
    .eq("relationship_type", "prescribed")
    .order("created_at", { ascending: false });

  if (!links) {
    return { medicines: [] };
  }

  return {
    medicines: links.map((link) => ({
      link: link as UserMedicineLink,
      entity: link.medicine_entity as MedicineIdentity | null,
      prescriptionText: (link.prescription_item as any)?.raw_medicine_text || null,
    })),
  };
}

// ─── Record Lookup Event ──────────────────────────────────────────────────

/**
 * Record a medicine lookup event for analytics.
 */
export async function recordLookupEvent(params: {
  userId: string;
  query: string;
  matchedEntityId?: string;
  sourceNames: string[];
  resultStatus: string;
}): Promise<void> {
  // Hash the query for privacy
  const encoder = new TextEncoder();
  const data = encoder.encode(params.query);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const queryHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await getAdmin().from("medicine_lookup_events").insert({
    user_id: params.userId,
    query_hash: queryHash,
    matched_medicine_entity_id: params.matchedEntityId || null,
    source_names: JSON.stringify(params.sourceNames),
    result_status: params.resultStatus,
  });
}

// ─── Cache Helpers ────────────────────────────────────────────────────────

/**
 * Check if a cached source record is still fresh.
 */
export function isSourceFresh(record: MedicineSourceRecord, maxAgeHours: number = 168): boolean {
  const retrievedAt = new Date(record.retrievedAt).getTime();
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  return now - retrievedAt < maxAgeMs;
}

/**
 * Get the freshness status of a source record.
 */
export function getSourceFreshness(record: MedicineSourceRecord): string {
  const retrievedAt = new Date(record.retrievedAt).getTime();
  const now = Date.now();
  const ageHours = (now - retrievedAt) / (1000 * 60 * 60);

  if (ageHours < 24) return "Current source retrieved";
  if (ageHours < 168) return "Cached source";
  if (ageHours < 720) return "Source may be outdated";
  return "Source may be significantly outdated";
}
