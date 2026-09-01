import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import { resolvePrescriptionItem } from "@/lib/medicines/service";
import { ResolvePrescriptionInputSchema } from "@/lib/medicines/schemas";

/**
 * POST /api/medicines/resolve-prescription-item
 * Resolve a verified prescription item to medicine candidates.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = ResolvePrescriptionInputSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", validation.error.issues[0]?.message || "Invalid input"),
          requestId
        ),
        { status: 400 }
      );
    }

    const result = await resolvePrescriptionItem(
      validation.data.prescriptionItemId,
      user.id
    );

    if (result.error) {
      return NextResponse.json(
        formatErrorResponse(createError(result.error as any, "Could not resolve prescription item"), requestId),
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: {
        candidates: result.candidates,
        prescriptionText: result.prescriptionText,
        medicineName: result.medicineName,
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
