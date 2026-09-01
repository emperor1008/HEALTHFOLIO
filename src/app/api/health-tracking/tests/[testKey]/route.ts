import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: { testKey: string } }
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

    const testKey = decodeURIComponent(params.testKey);
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("portfolioId");

    const admin = createAdminClient();

    // Fetch all measurements for this test
    let query = admin
      .from("medical_measurements")
      .select(`
        id, original_test_name, normalized_test_name, value_numeric, value_text,
        original_unit, normalized_unit, reference_low, reference_high, reference_text,
        report_flag, calculated_status, specimen_collected_at, observed_at,
        report_issued_at, page_number, evidence_text, confidence,
        verification_status, document_id, created_at, updated_at
      `)
      .eq("user_id", user.id)
      .eq("normalized_test_name", testKey)
      .is("invalidated_at", null)
      .order("observed_at", { ascending: true, nullsFirst: false });

    if (portfolioId) {
      query = query.eq("portfolio_id", portfolioId);
    }

    const { data: measurements, error: measError } = await query;

    if (measError) {
      return NextResponse.json(
        formatErrorResponse(createError("INTERNAL_ERROR", "Could not load test data"), requestId),
        { status: 500 }
      );
    }

    if (!measurements?.length) {
      return NextResponse.json(
        formatErrorResponse(createError("NOT_FOUND", "No measurements found for this test"), requestId),
        { status: 404 }
      );
    }

    // Get document names
    const documentIds = Array.from(new Set(measurements.map((m) => m.document_id)));
    const { data: docs } = await admin
      .from("documents")
      .select("id, original_name, document_type")
      .in("id", documentIds);

    const docMap = new Map(docs?.map((d) => [d.id, d]) || []);

    // Build trend
    const { calculateTrendSummary } = await import("@/lib/measurements/trends");
    const documentNames = new Map(docs?.map((d) => [d.id, d.original_name]) || []);
    const trend = calculateTrendSummary(testKey, measurements as any, documentNames);

    // Add document info to each measurement
    const enrichedMeasurements = measurements.map((m) => ({
      ...m,
      documentName: docMap.get(m.document_id)?.original_name || "Unknown",
      documentType: docMap.get(m.document_id)?.document_type || "other",
    }));

    return NextResponse.json({
      data: {
        testKey,
        trend,
        measurements: enrichedMeasurements,
        documentNames: Object.fromEntries(documentNames),
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
