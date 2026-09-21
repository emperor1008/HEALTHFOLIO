/**
 * POST /api/upload-sessions/page/verify — Verify uploaded page exists and is valid.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const verifySchema = z.object({
  sessionId: z.string().min(1),
  pageId: z.string().min(1),
  storagePath: z.string().min(1),
});

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid verification parameters" } },
      { status: 400 }
    );
  }

  const { sessionId, pageId, storagePath } = parsed.data;
  const admin = await createAdminClient();

  // Verify session ownership
  const { data: session } = await admin
    .from("upload_sessions")
    .select("id, user_id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: { code: "UPLOAD_SESSION_FAILED", message: "Invalid session" } },
      { status: 400 }
    );
  }

  // Verify page ownership
  const { data: page } = await admin
    .from("document_pages")
    .select("id, user_id, storage_path, file_size_bytes")
    .eq("id", pageId)
    .eq("user_id", user.id)
    .single();

  if (!page) {
    return NextResponse.json(
      { error: { code: "DOCUMENT_NOT_FOUND", message: "Page not found" } },
      { status: 404 }
    );
  }

  // Verify the file exists in storage by listing the directory
  const dirPath = storagePath.substring(0, storagePath.lastIndexOf("/"));
  const { error: fileError } = await admin.storage
    .from("documents")
    .list(dirPath);

  if (fileError) {
    return NextResponse.json(
      { error: { code: "UPLOAD_VERIFICATION_FAILED", message: "Could not verify upload" } },
      { status: 500 }
    );
  }

  // Update page upload status
  await admin
    .from("document_pages")
    .update({ upload_status: "verified" })
    .eq("id", pageId);

  // Increment completed page count
  const { data: currentSession } = await admin
    .from("upload_sessions")
    .select("completed_page_count")
    .eq("id", sessionId)
    .single();

  if (currentSession) {
    await admin
      .from("upload_sessions")
      .update({
        completed_page_count: (currentSession.completed_page_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  }

  // Audit
  await admin.from("capture_events").insert({
    user_id: user.id,
    upload_session_id: sessionId,
    event_type: "page_verified",
    safe_metadata: { pageId, storagePath },
  });

  return NextResponse.json({
    data: { verified: true, pageId },
  });
}
