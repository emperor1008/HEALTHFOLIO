import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import { searchMedicines, recordLookupEvent } from "@/lib/medicines/service";
import { validateSearchQuery } from "@/lib/medicines/schemas";
import { isEmergencyQuery, getEmergencyMessage } from "@/lib/medicines/safety";

/**
 * GET /api/medicines/search?q={query}
 * Search for medicines across authoritative sources.
 */
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
    const query = searchParams.get("q") || "";

    // Validate query
    const validation = validateSearchQuery(query);
    if (!validation.valid) {
      return NextResponse.json(
        formatErrorResponse(createError(validation.error as any, "Invalid search query"), requestId),
        { status: 400 }
      );
    }

    // Check for emergency queries
    if (isEmergencyQuery(query)) {
      return NextResponse.json({
        data: {
          results: [],
          emergency: true,
          emergencyMessage: getEmergencyMessage(),
          sourcesQueried: [],
        },
        error: null,
        requestId,
      });
    }

    // Search across sources
    const result = await searchMedicines(query);

    // Record lookup event
    await recordLookupEvent({
      userId: user.id,
      query,
      sourceNames: result.sourcesQueried,
      resultStatus: result.results.length > 0 ? "found" : "not_found",
    });

    return NextResponse.json({
      data: {
        results: result.results,
        sourcesQueried: result.sourcesQueried,
        totalResults: result.results.length,
      },
      error: result.error ? { code: result.error, message: result.error } : null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Something went wrong"), requestId),
      { status: 500 }
    );
  }
}
