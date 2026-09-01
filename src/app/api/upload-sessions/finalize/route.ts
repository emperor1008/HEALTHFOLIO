/**
 * POST /api/upload-sessions/finalize — Finalize an upload session.
 *
 * Verifies all pages are uploaded, creates the final document record,
 * and triggers the existing processing pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const finalizeSchema = z.object({
  sessionId: z.string().min(1),
  pageOrder: z.array(z.string()).min(1).max(25),
  idempotencyKey: z.string().min(1).max(128),
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
  const parsed = finalizeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid finalize parameters" } },
      { status: 400 }
    );
  }

  const { sessionId, pageOrder, idempotencyKey } = parsed.data;
  const admin = createAdminClient();

  // Verify session ownership
  const { data: session } = await admin
    .from("upload_sessions")
    .select("id, user_id, portfolio_id, status, expected_page_count, document_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: { code: "UPLOAD_SESSION_FAILED", message: "Invalid session" } },
      { status: 400 }
    );
  }

  // Idempotency check
  if (session.status === "completed" && session.document_id) {
    return NextResponse.json({
      data: {
        documentId: session.document_id,
        status: "completed",
      },
    });
  }

  if (session.status === "cancelled" || session.status === "failed") {
    return NextResponse.json(
      { error: { code: "UPLOAD_SESSION_FAILED", message: "Session is no longer active" } },
      { status: 400 }
    );
  }

  // Verify all pages are uploaded
  const { data: pages } = await admin
    .from("document_pages")
    .select("id, upload_status, file_hash, page_number, storage_path, mime_type, file_size_bytes, original_filename, document_id")
    .eq("upload_session_id", sessionId)
    .eq("user_id", user.id)
    .order("page_number", { ascending: true });

  if (!pages || pages.length === 0) {
    return NextResponse.json(
      { error: { code: "DOCUMENT_FINALIZATION_FAILED", message: "No pages found in session" } },
      { status: 400 }
    );
  }

  const allVerified = pages.every((p) => p.upload_status === "verified" || p.upload_status === "uploaded");
  if (!allVerified) {
    const unverified = pages.filter((p) => p.upload_status === "pending" || p.upload_status === "uploading");
    return NextResponse.json(
      {
        error: {
          code: "DOCUMENT_FINALIZATION_FAILED",
          message: `${unverified.length} page(s) have not been uploaded yet`,
        },
      },
      { status: 400 }
    );
  }

  // Create document record using the first page's info
  const firstPage = pages[0];
  const documentId = session.document_id || firstPage.document_id || firstPage.storage_path.split("/")[3];

  // Check for duplicate by file hash
  const combinedHash = pageOrder
    .map((pageId) => {
      const page = pages.find((p) => p.id === pageId);
      return page?.file_hash || "";
    })
    .join("::");

  const { data: existingDoc } = await admin
    .from("documents")
    .select("id")
    .eq("sha256", combinedHash)
    .eq("user_id", user.id)
    .single();

  if (existingDoc) {
    // Mark session as completed with existing document
    await admin
      .from("upload_sessions")
      .update({
        status: "completed",
        document_id: existingDoc.id,
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    return NextResponse.json({
      data: {
        documentId: existingDoc.id,
        status: "duplicate",
      },
    });
  }

  // Update document record with page-ordered info
  await admin
    .from("documents")
    .update({
      original_name: firstPage.original_filename || `scan-${Date.now()}.jpg`,
      storage_path: firstPage.storage_path,
      mime_type: firstPage.mime_type,
      size_bytes: pages.reduce((sum, p) => sum + (p.file_size_bytes || 0), 0),
      sha256: combinedHash,
      page_count: pages.length,
      status: "uploaded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  // Update page ordering
  for (let i = 0; i < pageOrder.length; i++) {
    const pageId = pageOrder[i];
    const page = pages.find((p) => p.id === pageId);
    if (page) {
      await admin
        .from("document_pages")
        .update({ page_number: i + 1 })
        .eq("id", pageId);
    }
  }

  // Mark session as completed
  await admin
    .from("upload_sessions")
    .update({
      status: "completed",
      document_id: documentId,
      completed_page_count: pages.length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // Trigger the existing processing pipeline via agent run directly
  try {
    const maxSteps = parseInt(process.env.AGENT_MAX_STEPS || "12");
    const maxRetries = parseInt(process.env.AGENT_MAX_RETRIES || "2");

    const initialState = {
      runId: "",
      userId: user.id,
      portfolioId: session.portfolio_id,
      goal: "Process uploaded document",
      status: "running",
      currentAgentState: "intake" as const,
      currentStep: 0,
      maxSteps,
      retryCount: 0,
      maxRetries,
      documentIds: [documentId],
      verifiedExtractionIds: [],
      uncertainExtractionIds: [],
      blockedOn: null,
    };

    const { data: run } = await admin
      .from("agent_runs")
      .insert({
        user_id: user.id,
        portfolio_id: session.portfolio_id,
        goal: "Process uploaded document",
        state: initialState,
        status: "running",
        current_step: 0,
      })
      .select("id")
      .single();

    if (run) {
      initialState.runId = run.id;
      await admin
        .from("agent_runs")
        .update({ state: initialState })
        .eq("id", run.id);

      await admin.from("agent_steps").insert({
        user_id: user.id,
        run_id: run.id,
        sequence: 1,
        phase: "observe",
        public_summary: `Capture upload finalized. ${pages.length} page(s) queued for processing.`,
        tool_name: null,
        tool_status: "succeeded",
      });
    }
  } catch {
    // Processing can be triggered later — document is saved
  }

  // Audit
  await admin.from("capture_events").insert({
    user_id: user.id,
    upload_session_id: sessionId,
    document_id: documentId,
    event_type: "session_finalized",
    safe_metadata: { pageCount: pages.length, pageOrder: pageOrder.length },
  });

  return NextResponse.json({
    data: {
      documentId,
      status: "completed",
    },
  });
}
