/**
 * GET /api/reports — List laboratory reports for the current user.
 * Supports filtering by status, date range, and search.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  const supabase = await createClient();

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

  const { searchParams } = new URL(_request.url);
  const status = searchParams.get("status"); // extraction_status
  const reviewStatus = searchParams.get("reviewStatus");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = supabase
    .from("laboratory_reports")
    .select(
      "id, document_id, laboratory_name, report_number, report_date, collection_date, extraction_status, review_status, overall_confidence, measurement_count, review_count, public_summary, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("extraction_status", status);
  }
  if (reviewStatus) {
    query = query.eq("review_status", reviewStatus);
  }

  const { data: reports, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: { code: "DATABASE_ERROR", message: "Failed to load reports" } },
      { status: 500 }
    );
  }

  // Get total count
  const { count: totalCount } = await supabase
    .from("laboratory_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json({
    data: {
      reports: reports || [],
      total: totalCount || 0,
      limit,
      offset,
    },
  });
}
