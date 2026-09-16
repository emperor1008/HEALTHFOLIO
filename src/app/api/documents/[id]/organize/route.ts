import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

/**
 * GET /api/documents/[id]/organize — Get document organization status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const documentId = params.id;
    const admin = createAdminClient();

    // Fetch document with organization data
    const { data: doc, error: docError } = await admin
      .from("documents")
      .select(`
        id, original_name, original_filename, mime_type, size_bytes, file_hash,
        category, category_confidence, classification_status, processing_status,
        document_date, document_date_precision, document_date_source,
        title, issuer_name, patient_name, doctor_name, facility_name,
        language, summary, requires_review, failure_code, failure_message,
        created_at, updated_at
      `)
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        formatErrorResponse(createError("DOCUMENT_NOT_FOUND", "Document not found"), requestId),
        { status: 404 }
      );
    }

    // Fetch classification history
    const { data: history } = await admin
      .from("document_classification_history")
      .select("id, proposed_category, confidence, source, model_name, decision, created_at")
      .eq("document_id", documentId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Fetch relationships
    const { data: relationships } = await admin
      .from("document_relationships")
      .select(`
        id, relationship_type, confidence, status, created_at,
        target_document_id, target:target_document_id(id, title, original_name, category)
      `)
      .eq("source_document_id", documentId)
      .eq("user_id", user.id);

    // Fetch prescription items if any
    const { data: prescriptions } = await admin
      .from("prescription_items")
      .select("id, raw_medicine_text, medicine_name, strength, dose_text, frequency_text, duration_text, instruction_text, confidence, verification_status")
      .eq("document_id", documentId)
      .eq("user_id", user.id);

    return NextResponse.json({
      data: {
        document: doc,
        classificationHistory: history || [],
        relationships: relationships || [],
        prescriptionItems: prescriptions || [],
      },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Something went wrong"), requestId),
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents/[id]/organize — Trigger classification/organization
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const documentId = params.id;
    const body = await request.json();
    const { action } = body;

    const admin = createAdminClient();

    // Verify ownership
    const { data: doc } = await admin
      .from("documents")
      .select("id, processing_status, file_hash, mime_type, user_id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (!doc) {
      return NextResponse.json(
        formatErrorResponse(createError("DOCUMENT_NOT_FOUND", "Document not found"), requestId),
        { status: 404 }
      );
    }

    if (action === "classify") {
      // Trigger classification — fetch extracted text from extractions
      const { data: extractions } = await admin
        .from("extractions")
        .select("raw_value, page_number")
        .eq("document_id", documentId)
        .eq("user_id", user.id)
        .order("page_number", { ascending: true });

      const extractedText = (extractions || [])
        .map((e) => `[Page ${e.page_number}] ${e.raw_value}`)
        .join("\n\n");

      if (extractedText.length < 10) {
        return NextResponse.json(
          formatErrorResponse(
            createError("INSUFFICIENT_TEXT", "Not enough extracted text to classify"),
            requestId
          ),
          { status: 400 }
        );
      }

      // Update processing status
      await admin
        .from("documents")
        .update({ processing_status: "classifying", updated_at: new Date().toISOString() })
        .eq("id", documentId);

      try {
        const { classifyDocument, recordClassificationHistory } = await import("@/lib/documents/organize");
        const classification = await classifyDocument(documentId, extractedText, doc.mime_type);

        // Record history
        await recordClassificationHistory({
          userId: user.id,
          documentId,
          proposedCategory: classification.category,
          confidence: classification.confidence,
          source: "ai",
          evidence: classification.evidence,
          decision: "proposed",
        });

        // Determine if review is needed
        const { classifyConfidence } = await import("@/lib/documents/taxonomy");
        const { classificationStatus, requiresReview } = classifyConfidence(
          classification.confidence,
          classification.evidence.length > 0,
          classification.warnings.length > 0
        );

        // Update document
        await admin
          .from("documents")
          .update({
            category: classification.category,
            category_confidence: classification.confidence,
            classification_status: classificationStatus,
            processing_status: requiresReview ? "review_required" : "completed",
            requires_review: requiresReview,
            title: classification.title,
            document_date: classification.documentDate || null,
            document_date_precision: classification.documentDatePrecision,
            document_date_source: "ai_classification",
            summary: classification.summary,
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId);

        return NextResponse.json({
          data: {
            classification: {
              category: classification.category,
              confidence: classification.confidence,
              title: classification.title,
              summary: classification.summary,
              requiresReview,
              prescriptionItemCount: classification.prescriptionItems?.length || 0,
              warnings: classification.warnings,
            },
          },
          error: null,
          requestId,
        });
      } catch (err) {
        const errorCode = err instanceof Error ? err.message : "CLASSIFICATION_FAILED";
        await admin
          .from("documents")
          .update({
            processing_status: "failed",
            failure_code: errorCode,
            failure_message: `Classification failed: ${errorCode}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId);

        return NextResponse.json(
          formatErrorResponse(createError(errorCode as any, "Classification failed"), requestId),
          { status: 500 }
        );
      }
    }

    if (action === "confirm") {
      // Confirm current classification
      const { category, title, documentDate } = body;

      if (!category) {
        return NextResponse.json(
          formatErrorResponse(createError("INVALID_REQUEST", "Category is required"), requestId),
          { status: 400 }
        );
      }

      const { recordClassificationHistory } = await import("@/lib/documents/organize");
      await recordClassificationHistory({
        userId: user.id,
        documentId,
        proposedCategory: category,
        confidence: 1.0,
        source: "user",
        evidence: [],
        decision: "confirmed",
      });

      await admin
        .from("documents")
        .update({
          category,
          classification_status: "confirmed",
          processing_status: "completed",
          requires_review: false,
          title: title || undefined,
          document_date: documentDate || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      return NextResponse.json({
        data: { success: true },
        error: null,
        requestId,
      });
    }

    if (action === "reject") {
      await admin
        .from("documents")
        .update({
          classification_status: "rejected",
          processing_status: "failed",
          requires_review: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      return NextResponse.json({
        data: { success: true },
        error: null,
        requestId,
      });
    }

    return NextResponse.json(
      formatErrorResponse(createError("INVALID_REQUEST", "Invalid action"), requestId),
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Something went wrong"), requestId),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/documents/[id]/organize — Update document organization (user correction)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const documentId = params.id;
    const body = await request.json();
    const { category, title, documentDate, correctionReason } = body;

    const admin = createAdminClient();

    // Verify ownership
    const { data: existing } = await admin
      .from("documents")
      .select("id, category, classification_status, user_id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (!existing) {
      return NextResponse.json(
        formatErrorResponse(createError("DOCUMENT_NOT_FOUND", "Document not found"), requestId),
        { status: 404 }
      );
    }

    // Record correction in history
    const { recordClassificationHistory } = await import("@/lib/documents/organize");
    await recordClassificationHistory({
      userId: user.id,
      documentId,
      proposedCategory: category || existing.category,
      confidence: 1.0,
      source: "user",
      evidence: correctionReason ? [{ field: "correction_reason", page: 0, textQuote: correctionReason }] : [],
      decision: correctionReason ? "corrected" : "confirmed",
    });

    // Update document
    const updateData: Record<string, unknown> = {
      classification_status: "confirmed",
      processing_status: "completed",
      requires_review: false,
      updated_at: new Date().toISOString(),
    };

    if (category) updateData.category = category;
    if (title !== undefined) updateData.title = title;
    if (documentDate !== undefined) updateData.document_date = documentDate || null;

    await admin
      .from("documents")
      .update(updateData)
      .eq("id", documentId);

    return NextResponse.json({
      data: { success: true },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Something went wrong"), requestId),
      { status: 500 }
    );
  }
}
