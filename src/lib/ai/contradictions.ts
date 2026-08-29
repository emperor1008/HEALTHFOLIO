import { createAdminClient } from "@/lib/supabase/admin";

export interface Contradiction {
  fieldType: string;
  values: Array<{
    extractionId: string;
    documentId: string;
    documentName: string;
    pageNumber: number;
    rawValue: string;
    confidence: number;
    evidenceLocator: Record<string, unknown> | null;
  }>;
  reason: string;
}

/**
 * Detect contradictions between extractions from different documents.
 * Two extractions conflict if they have the same fieldType but different values
 * and come from different documents.
 */
export async function detectContradictions(
  documentIds: string[],
  userId: string
): Promise<Contradiction[]> {
  const admin = createAdminClient();

  const { data: extractions } = await admin
    .from("extractions")
    .select(
      "id, document_id, page_number, field_type, raw_value, confidence, evidence_locator"
    )
    .in("document_id", documentIds)
    .eq("user_id", userId)
    .or("verification_status.eq.pending,verification_status.eq.user_confirmed");

  if (!extractions || extractions.length < 2) return [];

  // Get document names
  const docIdSet = new Set(extractions.map((e) => e.document_id));
  const docIds = Array.from(docIdSet);
  const { data: docs } = await admin
    .from("documents")
    .select("id, original_name")
    .in("id", docIds);

  const docMap = new Map(docs?.map((d) => [d.id, d.original_name]) || []);

  // Group extractions by fieldType
  const byFieldType = new Map<string, typeof extractions>();
  extractions.forEach((ext) => {
    const existing = byFieldType.get(ext.field_type) || [];
    existing.push(ext);
    byFieldType.set(ext.field_type, existing);
  });

  const contradictions: Contradiction[] = [];

  Array.from(byFieldType.entries()).forEach(([fieldType, group]) => {
    if (group.length < 2) return;

    // Check for different raw values from different documents
    const uniqueValues = new Map<string, typeof group>();
    group.forEach((ext) => {
      const normalizedValue = ext.raw_value.toLowerCase().trim();
      const existing = uniqueValues.get(normalizedValue) || [];
      existing.push(ext);
      uniqueValues.set(normalizedValue, existing);
    });

    // If there are multiple unique values, check if they come from different documents
    if (uniqueValues.size > 1) {
      const valueGroups = Array.from(uniqueValues.values());

      // If any two value groups have no document overlap, it's a contradiction
      for (let i = 0; i < valueGroups.length; i++) {
        for (let j = i + 1; j < valueGroups.length; j++) {
          const docA = valueGroups[i].map((e) => e.document_id);
          const docB = valueGroups[j].map((e) => e.document_id);
          const hasOverlap = docA.some((id) => docB.includes(id));

          if (!hasOverlap) {
            contradictions.push({
              fieldType,
              values: [...valueGroups[i], ...valueGroups[j]].map((e) => ({
                extractionId: e.id,
                documentId: e.document_id,
                documentName: docMap.get(e.document_id) || "Unknown",
                pageNumber: e.page_number,
                rawValue: e.raw_value,
                confidence: e.confidence,
                evidenceLocator: e.evidence_locator,
              })),
              reason: `Different values found: "${valueGroups[i][0].raw_value}" vs "${valueGroups[j][0].raw_value}"`,
            });
          }
        }
      }
    }
  });

  return contradictions;
}
