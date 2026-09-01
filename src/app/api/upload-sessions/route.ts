/**
 * POST /api/upload-sessions — Create a new upload session.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nanoid } from "nanoid";
import { z } from "zod";

const createSessionSchema = z.object({
  portfolioId: z.string().uuid(),
  sourceType: z.enum(["camera", "gallery", "file"]),
  expectedPageCount: z.number().int().min(1).max(25),
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
  const parsed = createSessionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid upload session parameters" } },
      { status: 400 }
    );
  }

  const { portfolioId, sourceType, expectedPageCount, idempotencyKey } = parsed.data;

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
      { error: { code: "NOT_FOUND", message: "Portfolio not found" } },
      { status: 404 }
    );
  }

  // Check idempotency — return existing session if retrying
  const { data: existingSession } = await admin
    .from("upload_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["active", "uploading"])
    .single();

  if (existingSession) {
    return NextResponse.json({
      data: { session: existingSession },
    });
  }

  // Create document record (single-page or multi-page)
  const documentId = nanoid(21);
  const safeFilename = `${nanoid(12)}.jpg`;

  // Create upload session
  const sessionId = nanoid(21);
  const { data: session, error: sessionError } = await admin
    .from("upload_sessions")
    .insert({
      id: sessionId,
      user_id: user.id,
      portfolio_id: portfolioId,
      status: "active",
      source_type: sourceType,
      expected_page_count: expectedPageCount,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();

  if (sessionError) {
    return NextResponse.json(
      { error: { code: "DATABASE_WRITE_FAILED", message: "Could not create upload session" } },
      { status: 500 }
    );
  }

  // Audit
  await admin.from("capture_events").insert({
    user_id: user.id,
    upload_session_id: sessionId,
    event_type: "session_created",
    safe_metadata: { sourceType, expectedPageCount },
  });

  return NextResponse.json({
    data: { session },
  });
}
