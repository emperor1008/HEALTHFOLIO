import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import {
  runSignalMonitorForMeasurement,
  archiveSignalsForInvalidatedMeasurement,
} from "@/lib/signals/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const measurementId = (await params).id;
    const admin = await createAdminClient();

    // Fetch measurement with ownership check
    const { data: measurement, error: measError } = await admin
      .from("medical_measurements")
      .select(`
        id, original_test_name, normalized_test_name, value_numeric, value_text,
        original_unit, normalized_unit, reference_low, reference_high, reference_text,
        report_flag, calculated_status, specimen_collected_at, observed_at,
        report_issued_at, page_number, evidence_text, confidence,
        verification_status, document_id, created_at, updated_at
      `)
      .eq("id", measurementId)
      .eq("user_id", user.id)
      .single();

    if (measError || !measurement) {
      return NextResponse.json(
        formatErrorResponse(createError("NOT_FOUND", "Measurement not found"), requestId),
        { status: 404 }
      );
    }

    // Get document info
    const { data: doc } = await admin
      .from("documents")
      .select("id, original_name, document_type, storage_path")
      .eq("id", measurement.document_id)
      .single();

    // Generate signed URL for source document access
    let signedUrl: string | null = null;
    if (doc?.storage_path) {
      const { data: urlData } = await admin.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 300); // 5 minutes

      signedUrl = urlData?.signedUrl || null;
    }

    return NextResponse.json({
      data: {
        measurement,
        document: doc ? {
          id: doc.id,
          originalName: doc.original_name,
          documentType: doc.document_type,
        } : null,
        signedUrl,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const measurementId = (await params).id;
    const body = await request.json();
    const { decision, correctionReason, correctedValueNumeric, correctedValueText,
            correctedReferenceLow, correctedReferenceHigh, correctedReferenceText,
            correctedReportFlag } = body;

    if (!["verified", "corrected", "rejected"].includes(decision)) {
      return NextResponse.json(
        formatErrorResponse(createError("INVALID_REQUEST", "Invalid decision"), requestId),
        { status: 400 }
      );
    }

    // Validate correction fields if decision is corrected
    if (decision === "corrected") {
      if (!correctionReason) {
        return NextResponse.json(
          formatErrorResponse(createError("INVALID_REQUEST", "Corrections require a reason"), requestId),
          { status: 400 }
        );
      }
      const hasAnyCorrection =
        correctedValueNumeric !== undefined && correctedValueNumeric !== null ||
        correctedValueText !== undefined && correctedValueText !== null ||
        correctedReferenceLow !== undefined && correctedReferenceLow !== null ||
        correctedReferenceHigh !== undefined && correctedReferenceHigh !== null ||
        correctedReferenceText !== undefined && correctedReferenceText !== null ||
        correctedReportFlag !== undefined && correctedReportFlag !== null;
      if (!hasAnyCorrection) {
        return NextResponse.json(
          formatErrorResponse(createError("INVALID_REQUEST", "At least one corrected field is required"), requestId),
          { status: 400 }
        );
      }
    }

    const admin = await createAdminClient();

    // Use the atomic RPC function for transactional update + audit
    const { data: result, error: rpcError } = await admin.rpc("review_measurement", {
      p_measurement_id: measurementId,
      p_decision: decision,
      p_correction_reason: correctionReason || null,
      p_corrected_value_numeric: correctedValueNumeric ?? null,
      p_corrected_value_text: correctedValueText ?? null,
      p_corrected_reference_low: correctedReferenceLow ?? null,
      p_corrected_reference_high: correctedReferenceHigh ?? null,
      p_corrected_reference_text: correctedReferenceText ?? null,
      p_corrected_report_flag: correctedReportFlag ?? null,
      p_request_id: requestId,
    });

    if (rpcError) {
      return NextResponse.json(
        formatErrorResponse(createError("REVIEW_FAILED", "Could not complete the review"), requestId),
        { status: 500 }
      );
    }

    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    if (!parsed?.success) {
      const errorCode = parsed?.errorCode || "REVIEW_FAILED";
      const status = errorCode === "NOT_FOUND" ? 404 : errorCode === "SESSION_REQUIRED" ? 401 : 400;
      return NextResponse.json(
        formatErrorResponse(createError(errorCode, "Review could not be completed"), requestId),
        { status }
      );
    }

    // Health Signal Monitor: deterministic, no LLM. Runs after the review
    // transaction committed; never throws, so verification stays valid even
    // if signal generation fails.
    if (decision === "verified" || decision === "corrected") {
      await runSignalMonitorForMeasurement(admin, user.id, measurementId);
    } else if (decision === "rejected") {
      await archiveSignalsForInvalidatedMeasurement(
        admin,
        user.id,
        measurementId,
        "measurement_rejected"
      );
    }

    return NextResponse.json({
      data: { measurementId: parsed.measurementId, verificationStatus: parsed.verificationStatus },
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
