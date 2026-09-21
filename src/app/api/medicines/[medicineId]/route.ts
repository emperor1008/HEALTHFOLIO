import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import { getMedicineDetail, recordLookupEvent } from "@/lib/medicines/service";
import { isEmergencyQuery, getEmergencyMessage } from "@/lib/medicines/safety";

/**
 * GET /api/medicines/[medicineId]
 * Get full medicine detail including identity, labels, and sources.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ medicineId: string }> }
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

    const medicineId = (await params).medicineId;

    // Check for emergency context in query params
    const { searchParams } = new URL(request.url);
    const context = searchParams.get("context");
    if (context && isEmergencyQuery(context)) {
      return NextResponse.json({
        data: {
          emergency: true,
          emergencyMessage: getEmergencyMessage(),
        },
        error: null,
        requestId,
      });
    }

    // Get medicine detail
    const detail = await getMedicineDetail(medicineId, user.id);

    if (detail.error) {
      const status = detail.error === "MEDICINE_NOT_FOUND" ? 404 : 500;
      return NextResponse.json(
        formatErrorResponse(createError(detail.error as any, "Medicine not found"), requestId),
        { status }
      );
    }

    // Record lookup event
    await recordLookupEvent({
      userId: user.id,
      query: detail.identity?.displayName || medicineId,
      matchedEntityId: medicineId,
      sourceNames: detail.sourceRecords.map((r) => r.sourceName),
      resultStatus: "found",
    });

    return NextResponse.json({
      data: detail,
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
