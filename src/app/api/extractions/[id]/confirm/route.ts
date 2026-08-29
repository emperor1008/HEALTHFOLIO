import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const confirmSchema = z.object({
  decision: z.enum(["confirm", "correct", "reject"]),
  correctedValue: z.string().nullable().optional(),
});

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

    const extractionId = params.id;
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(createError("INVALID_REQUEST", "Invalid confirmation data"), requestId),
        { status: 400 }
      );
    }

    const { decision, correctedValue } = parsed.data;
    const admin = createAdminClient();

    // Verify extraction ownership
    const { data: extraction, error: fetchError } = await admin
      .from("extractions")
      .select("id, user_id, document_id")
      .eq("id", extractionId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !extraction) {
      return NextResponse.json(
        formatErrorResponse(createError("NOT_FOUND", "Extraction not found."), requestId),
        { status: 404 }
      );
    }

    // Update verification status
    let newStatus: string;
    let updateData: Record<string, unknown> = {};

    switch (decision) {
      case "confirm":
        newStatus = "user_confirmed";
        break;
      case "correct":
        newStatus = "user_corrected";
        if (correctedValue) {
          updateData = {
            raw_value: correctedValue,
            normalized_value: { value: correctedValue, manuallyCorrected: true },
          };
        }
        break;
      case "reject":
        newStatus = "rejected";
        break;
      default:
        return NextResponse.json(
          formatErrorResponse(createError("INVALID_REQUEST", "Invalid decision"), requestId),
          { status: 400 }
        );
    }

    const { error: updateError } = await admin
      .from("extractions")
      .update({
        verification_status: newStatus,
        ...updateData,
      })
      .eq("id", extractionId);

    if (updateError) {
      return NextResponse.json(
        formatErrorResponse(createError("INTERNAL_ERROR", "Could not update extraction"), requestId),
        { status: 500 }
      );
    }

    // Audit
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "extraction_reviewed",
      resource_type: "extraction",
      resource_id: extractionId,
      metadata: { decision },
    });

    return NextResponse.json({
      data: {
        extractionId,
        verificationStatus: newStatus,
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
