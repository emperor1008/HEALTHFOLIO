import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { nanoid } from "nanoid";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const uploadIntentSchema = z.object({
  portfolioId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  sizeBytes: z.number().positive(),
});

const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const maxBytes = parseInt(process.env.DOCUMENT_MAX_BYTES || "10485760");
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = uploadIntentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", "Invalid upload parameters"),
          requestId
        ),
        { status: 400 }
      );
    }

    const { portfolioId, fileName, mimeType, sizeBytes } = parsed.data;

    // Validate file size
    if (sizeBytes > maxBytes) {
      return NextResponse.json(
        formatErrorResponse(
          createError("FILE_TOO_LARGE", `This file exceeds the ${maxBytes / 1024 / 1024} MB limit.`),
          requestId
        ),
        { status: 400 }
      );
    }

    // Validate file extension
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS[ext]) {
      return NextResponse.json(
        formatErrorResponse(
          createError("FILE_UNSUPPORTED", "Upload a PDF, PNG, JPEG, or WEBP file."),
          requestId
        ),
        { status: 400 }
      );
    }

    // Verify extension matches MIME type
    const expectedMime = ALLOWED_EXTENSIONS[ext];
    if (expectedMime !== mimeType) {
      return NextResponse.json(
        formatErrorResponse(
          createError("FILE_UNSUPPORTED", "File type does not match extension."),
          requestId
        ),
        { status: 400 }
      );
    }

    // Verify portfolio ownership
    const admin = createAdminClient();
    const { data: portfolio } = await admin
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .eq("user_id", user.id)
      .single();

    if (!portfolio) {
      return NextResponse.json(
        formatErrorResponse(
          createError("NOT_FOUND", "Portfolio not found."),
          requestId
        ),
        { status: 404 }
      );
    }

    // Note: Consent is checked at agent run creation, not at upload time.
    // This allows users to upload documents before granting AI-processing consent.

    // Generate safe filename and storage path
    const safeFilename = `${nanoid(12)}.${ext}`;
    const documentId = nanoid(21);
    const storagePath = `${user.id}/${portfolioId}/${documentId}/${safeFilename}`;

    // Create upload URL
    const { data: uploadData, error: uploadError } = await admin.storage
      .from("documents")
      .createSignedUploadUrl(storagePath);

    if (uploadError) {
      return NextResponse.json(
        formatErrorResponse(
          createError("STORAGE_FAILED", "File storage is temporarily unavailable. Please try again."),
          requestId
        ),
        { status: 500 }
      );
    }

    // Create document record
    const { error: docError } = await admin.from("documents").insert({
      id: documentId,
      user_id: user.id,
      portfolio_id: portfolioId,
      original_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      document_type: "other",
      status: "uploaded",
    });

    if (docError) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INTERNAL_ERROR", "Could not save document record."),
          requestId
        ),
        { status: 500 }
      );
    }

    // Audit event
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "upload",
      resource_type: "document",
      resource_id: documentId,
      metadata: { fileName: fileName.replace(/\.[^.]+$/, ""), mimeType },
    });

    return NextResponse.json({
      data: {
        documentId,
        uploadUrl: uploadData.signedUrl,
        path: storagePath,
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
