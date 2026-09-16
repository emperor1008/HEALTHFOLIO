import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("portfolioId");
    const allowedFilters = new Set(["1w", "1m", "3m", "6m", "1y", "all"]);
    const timeFilter = allowedFilters.has(searchParams.get("timeFilter") || "all")
      ? (searchParams.get("timeFilter") as string)
      : "all";

    const admin = createAdminClient();

    // Build date filter
    let dateFilter: string | null = null;
    if (timeFilter !== "all") {
      const now = new Date();
      switch (timeFilter) {
        case "1w":
          dateFilter = new Date(now.setDate(now.getDate() - 7)).toISOString();
          break;
        case "1m":
          dateFilter = new Date(now.setMonth(now.getMonth() - 1)).toISOString();
          break;
        case "3m":
          dateFilter = new Date(now.setMonth(now.getMonth() - 3)).toISOString();
          break;
        case "6m":
          dateFilter = new Date(now.setMonth(now.getMonth() - 6)).toISOString();
          break;
        case "1y":
          dateFilter = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString();
          break;
      }
    }

    // Fetch confirmed measurements (verified or corrected, not rejected/invalidated)
    let query = admin
      .from("medical_measurements")
      .select(`
        id, normalized_test_name, normalized_unit, value_numeric, value_text,
        calculated_status, observed_at, report_issued_at, specimen_collected_at,
        verification_status, document_id, page_number
      `)
      .eq("user_id", user.id)
      .in("verification_status", ["verified", "corrected"])
      .is("invalidated_at", null)
      .order("observed_at", { ascending: false, nullsFirst: false });

    if (portfolioId) {
      query = query.eq("portfolio_id", portfolioId);
    }
    if (dateFilter) {
      // Check all three date columns using priority: specimen > observed > reported
      query = query.or(
        `specimen_collected_at.gte.${dateFilter},observed_at.gte.${dateFilter},report_issued_at.gte.${dateFilter}`
      );
    }

    const { data: measurements, error: measError } = await query;

    if (measError) {
      return NextResponse.json(
        formatErrorResponse(createError("INTERNAL_ERROR", "Could not load health tracking data"), requestId),
        { status: 500 }
      );
    }

    // Fetch pending measurements count
    let pendingQuery = admin
      .from("medical_measurements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("verification_status", "pending")
      .is("invalidated_at", null);

    if (portfolioId) {
      pendingQuery = pendingQuery.eq("portfolio_id", portfolioId);
    }

    const { count: pendingCount } = await pendingQuery;

    // Group by normalized test name
    const testGroups = new Map<string, Array<typeof measurements extends Array<infer T> ? T : never>>();
    for (const m of measurements || []) {
      const key = m.normalized_test_name;
      const existing = testGroups.get(key) || [];
      existing.push(m);
      testGroups.set(key, existing);
    }

    // Build trend summaries
    const { calculateTrendSummary } = await import("@/lib/measurements/trends");
    const trends = [];

    for (const [testName, group] of Array.from(testGroups.entries())) {
      const trend = calculateTrendSummary(testName, group as any);
      if (trend) trends.push(trend);
    }

    // Sort trends by latest date
    trends.sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());

    // Latest measurements per test
    const latestMeasurements = trends.map((t) => ({
      normalizedTestName: t.normalizedTestName,
      normalizedUnit: t.normalizedUnit,
      latestValue: t.latestValue,
      latestDate: t.latestDate,
      totalMeasurements: t.totalMeasurements,
      graphableMeasurements: t.graphableMeasurements,
    }));

    return NextResponse.json({
      data: {
        totalTests: testGroups.size,
        totalMeasurements: measurements?.length || 0,
        pendingReview: pendingCount || 0,
        trends,
        latestMeasurements,
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
