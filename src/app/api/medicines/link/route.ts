import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import { linkMedicine, getUserPrescribedMedicines } from "@/lib/medicines/service";
import { LinkMedicineInputSchema } from "@/lib/medicines/schemas";

/**
 * POST /api/medicines/link
 * Link a medicine entity to a user's prescription or manual save.
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
    const validation = LinkMedicineInputSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", validation.error.issues[0]?.message || "Invalid input"),
          requestId
        ),
        { status: 400 }
      );
    }

    const result = await linkMedicine({
      userId: user.id,
      medicineEntityId: validation.data.medicineEntityId,
      prescriptionItemId: validation.data.prescriptionItemId || undefined,
      documentId: validation.data.documentId || undefined,
      relationshipType: validation.data.relationshipType,
    });

    if (!result.success) {
      return NextResponse.json(
        formatErrorResponse(createError(result.error as any, "Could not link medicine"), requestId),
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { success: true, linkId: result.linkId },
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
 * GET /api/medicines/link
 * Get user's prescribed medicines.
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

    const result = await getUserPrescribedMedicines(user.id);

    return NextResponse.json({
      data: result,
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
