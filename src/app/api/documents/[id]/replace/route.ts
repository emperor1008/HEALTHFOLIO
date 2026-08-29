import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const replaceSchema = z.object({
  replacementDocumentId: z.string(),
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
        formatErrorResponse(
          createError("AUTH_REQUIRED", "Authentication required"),
          requestId
        ),
        { status: 401 }
      );
    }

    const documentId = params.id;
    const body = await request.json();
    const parsed = replaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", "Invalid replacement data"),
          requestId
        ),
        { status: 400 }
      );
    }

    const { replacementDocumentId } = parsed.data;
    const admin = createAdminClient();

    // Verify both documents belong to user
    const { data: originalDoc } = await admin
      .from("documents")
      .select("id, user_id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (!originalDoc) {
      return NextResponse.json(
        formatErrorResponse(
          createError("NOT_FOUND", "Original document not found."),
          requestId
        ),
        { status: 404 }
      );
    }

    const { data: replacementDoc } = await admin
      .from("documents")
      .select("id, user_id")
      .eq("id", replacementDocumentId)
      .eq("user_id", user.id)
      .single();

    if (!replacementDoc) {
      return NextResponse.json(
        formatErrorResponse(
          createError("NOT_FOUND", "Replacement document not found."),
          requestId
        ),
        { status: 404 }
      );
    }

    // Mark old document as replaced
    await admin
      .from("documents")
      .update({ status: "replaced" })
      .eq("id", documentId);

    // Mark replacement as uploaded for processing
    await admin
      .from("documents")
      .update({ status: "uploaded" })
      .eq("id", replacementDocumentId);

    // Reject old extractions
    await admin
      .from("extractions")
      .update({ verification_status: "rejected" })
      .eq("document_id", documentId);

    // Audit
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "document_replaced",
      resource_type: "document",
      resource_id: documentId,
      metadata: { replacementDocumentId },
    });

    return NextResponse.json({
      data: {
        documentId,
        replacementDocumentId,
        message: "Document replaced. The replacement will be processed.",
      },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(
        createError("INTERNAL_ERROR", "Something went wrong"),
        requestId
      ),
      { status: 500 }
    );
  }
}
