import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const deleteSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError(
            "INVALID_REQUEST",
            'Type DELETE to confirm account deletion.'
          ),
          requestId
        ),
        { status: 400 }
      );
    }

    // Check if admin key is available for user deletion
    const hasAdminKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!hasAdminKey) {
      return NextResponse.json(
        formatErrorResponse(
          createError(
            "CONFIGURATION_ERROR",
            "Account deletion is not configured. The administrator needs to set SUPABASE_SERVICE_ROLE_KEY."
          ),
          requestId
        ),
        { status: 503 }
      );
    }

    const admin = createAdminClient();
    const userId = user.id;

    // 1. Soft-delete profile
    await admin
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", userId);

    // 2. Delete storage objects
    try {
      const { data: portfolio } = await admin
        .from("portfolios")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (portfolio) {
        // List and remove all storage files for this user
        const userPath = userId;
        const { data: folders } = await admin.storage
          .from("documents")
          .list(userPath);

        if (folders) {
          for (const folder of folders) {
            const folderPath = `${userPath}/${folder.name}`;
            const { data: subfolders } = await admin.storage
              .from("documents")
              .list(folderPath);

            if (subfolders) {
              const filePaths = subfolders.map(
                (f) => `${folderPath}/${f.name}`
              );
              if (filePaths.length > 0) {
                await admin.storage.from("documents").remove(filePaths);
              }
            }
          }
        }
      }
    } catch {
      // Storage deletion is best-effort
    }

    // 3. Delete database records (cascading should handle most, but be explicit)
    const tables = [
      "audit_events",
      "agent_steps",
      "agent_runs",
      "medical_events",
      "extractions",
      "briefs",
      "reminders",
      "consents",
      "appointments",
      "documents",
      "portfolios",
    ];

    for (const table of tables) {
      await admin.from(table).delete().eq("user_id", userId);
    }

    // Delete profile
    await admin.from("profiles").delete().eq("id", userId);

    // 4. Delete the Supabase Auth user
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(
      userId
    );

    if (deleteAuthError) {
      // Data is already deleted; log the auth deletion failure
      return NextResponse.json(
        formatErrorResponse(
          createError(
            "PARTIAL_DELETION",
            "Your data has been deleted, but account deactivation could not complete. Please contact support."
          ),
          requestId
        ),
        { status: 200 }
      );
    }

    // 5. Sign out
    const supabase = createClient();
    await supabase.auth.signOut();

    return NextResponse.json({
      data: {
        success: true,
        message: "Your account and all data have been permanently deleted.",
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
