/**
 * POST /api/upload-sessions/page — Request signed upload URL for a page.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nanoid } from "nanoid";
import { z } from "zod";
import crypto from "crypto";

const pageIntentSchema = z.object({
  sessionId: z.string().min(1),
  documentId: z.string().min(1),
  pageNumber: z.number().int().min(1).max(25),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().positive(),
  fileHash: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  rotation: z.number().int().refine((r) => [0, 90, 180, 270].includes(r)),
  qualityStatus: z.enum(["acceptable", "warning", "retake_recommended", "unusable"]),
  qualityMetrics: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
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

  const body = await request.json();
  const parsed = pageIntentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid page parameters" } },
      { status: 400 }
    );
  }

  const {
    sessionId, documentId, pageNumber, fileName, mimeType,
    sizeBytes, fileHash, width, height, rotation,
    qualityStatus, qualityMetrics,
  } = parsed.data;

  const admin = createAdminClient();

  // Verify session ownership and status
  const { data: session } = await admin
    .from("upload_sessions")
    .select("id, user_id, portfolio_id, status, expected_page_count")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session || session.status === "cancelled" || session.status === "completed") {
    return NextResponse.json(
      { error: { code: "UPLOAD_SESSION_FAILED", message: "Invalid or expired upload session" } },
      { status: 400 }
    );
  }

  // Check page count limit
  if (pageNumber > session.expected_page_count) {
    return NextResponse.json(
      { error: { code: "TOO_MANY_PAGES", message: `Page ${pageNumber} exceeds expected ${session.expected_page_count} pages` } },
      { status: 400 }
    );
  }

  // Generate storage path
  const ext = fileName.split(".").pop() || "jpg";
  const safeFilename = `${nanoid(12)}.${ext}`;
  const storagePath = `${user.id}/${session.portfolio_id}/${documentId}/pages/${safeFilename}`;

  // Create signed upload URL
  const { data: uploadData, error: uploadError } = await admin.storage
    .from("documents")
    .createSignedUploadUrl(storagePath);

  if (uploadError) {
    return NextResponse.json(
      { error: { code: "STORAGE_FAILED", message: "Upload storage is temporarily unavailable" } },
      { status: 500 }
    );
  }

  // Create or find document record
  const { data: existingDoc } = await admin
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (!existingDoc) {
    await admin.from("documents").insert({
      id: documentId,
      user_id: user.id,
      portfolio_id: session.portfolio_id,
      original_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      document_type: "other",
      status: "uploaded",
    });
  }

  // Create document page record
  const pageId = crypto.randomUUID();
  const idempotencyKey = `${documentId}::${pageNumber}::${fileHash}`;

  // Check idempotency
  const { data: existingPage } = await admin
    .from("document_pages")
    .select("id, storage_path")
    .eq("idempotency_key", idempotencyKey)
    .single();

  if (existingPage) {
    return NextResponse.json({
      data: {
        pageId: existingPage.id,
        uploadUrl: uploadData.signedUrl,
        storagePath: existingPage.storage_path,
      },
    });
  }

  const { error: pageError } = await admin.from("document_pages").insert({
    id: pageId,
    user_id: user.id,
    document_id: documentId,
    upload_session_id: sessionId,
    page_number: pageNumber,
    storage_path: storagePath,
    original_filename: fileName,
    mime_type: mimeType,
    file_size_bytes: sizeBytes,
    file_hash: fileHash,
    width: width || null,
    height: height || null,
    rotation,
    quality_status: qualityStatus,
    quality_metrics: qualityMetrics || {},
    upload_status: "pending",
    idempotency_key: idempotencyKey,
  });

  if (pageError) {
    return NextResponse.json(
      { error: { code: "DATABASE_WRITE_FAILED", message: "Could not save page record" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      pageId,
      uploadUrl: uploadData.signedUrl,
      storagePath,
    },
  });
}
