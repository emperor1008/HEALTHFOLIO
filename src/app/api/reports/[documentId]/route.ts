/**
 * GET /api/reports/[documentId] — Get report detail with measurements.
 * POST /api/reports/[documentId] — Trigger report extraction.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const supabase = createClient();
  const documentId = params.documentId;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  // Get lab report
  const { data: report, error: reportError } = await supabase
    .from("laboratory_reports")
    .select("*")
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .single();

  if (reportError || !report) {
    return NextResponse.json(
      { error: { code: "REPORT_NOT_FOUND", message: "Report not found" } },
      { status: 404 }
    );
  }

  // Get all measurements for this document
  const { data: measurements } = await supabase
    .from("medical_measurements")
    .select(
      "id, original_test_name, normalized_test_name, test_key, panel_name, result_type, value_numeric, value_text, original_unit, normalized_unit, reference_low, reference_high, reference_text, reference_range_raw, laboratory_flag_raw, calculated_status, comparator, specimen, method, fasting_status, specimen_collected_at, observed_at, report_issued_at, page_number, evidence_text, laboratory_name, confidence, verification_status, evidence_locator, invalidated_at, created_at, updated_at"
    )
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .order("page_number", { ascending: true })
    .order("created_at", { ascending: true });

  // Get analysis runs
  const { data: analysisRuns } = await supabase
    .from("report_analysis_runs")
    .select("id, status, measurements_found, measurements_review_required, public_summary, failure_code, started_at, completed_at")
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    data: {
      report,
      measurements: measurements || [],
      analysisRuns: analysisRuns || [],
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const supabase = createClient();
  const documentId = params.documentId;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  // Verify document ownership
  const { data: doc } = await supabase
    .from("documents")
    .select("id, portfolio_id")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (!doc) {
    return NextResponse.json(
      { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found" } },
      { status: 404 }
    );
  }

  // Trigger extraction via the report service
  try {
    const { extractLabReport } = await import("@/lib/reports/service");
    const result = await extractLabReport({
      documentId,
      userId: user.id,
      portfolioId: doc.portfolio_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: { code: result.errorCode || "EXTRACTION_FAILED", message: "Report extraction failed" } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "EXTRACTION_FAILED", message: "Report extraction failed" } },
      { status: 500 }
    );
  }
}
