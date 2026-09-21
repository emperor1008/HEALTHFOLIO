import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const documentId = (await params).id;
    const admin = await createAdminClient();

    // Verify document ownership
    const { data: doc, error: docError } = await admin
      .from("documents")
      .select("id, user_id, storage_path")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        formatErrorResponse(createError("NOT_FOUND", "Document not found."), requestId),
        { status: 404 }
      );
    }

    // Download file to compute SHA-256 hash for duplicate detection
    const { data: fileData } = await admin.storage
      .from("documents")
      .download(doc.storage_path);

    let sha256 = "";
    if (fileData) {
      const buffer = await fileData.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Check for duplicate
    const { data: existing } = await admin
      .from("documents")
      .select("id")
      .eq("user_id", user.id)
      .eq("sha256", sha256)
      .neq("id", documentId)
      .limit(1);

    if (existing && existing.length > 0) {
      // Mark as duplicate
      await admin
        .from("documents")
        .update({ status: "excluded", sha256 })
        .eq("id", documentId);

      return NextResponse.json({
        data: {
          documentId,
          status: "duplicate",
          duplicateOf: existing[0].id,
        },
        error: null,
        requestId,
      });
    }

    // Update document with hash
    await admin
      .from("documents")
      .update({ sha256 })
      .eq("id", documentId);

    return NextResponse.json({
      data: { documentId, status: "confirmed" },
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
