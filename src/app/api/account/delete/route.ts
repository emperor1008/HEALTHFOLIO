import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import {
  generateRequestId,
  createError,
  formatErrorResponse,
} from "@/lib/errors";
import { isDatabaseAuth } from "@/lib/auth/provider";
import { revokeAllSessions, deleteAccount } from "@/lib/auth/db-auth";
import { isDemoUserId } from "@/lib/preview/identity";
import { clearSessionCookie } from "@/lib/firebase/session-cookie";
import { invalidateSessionProfileCache } from "@/lib/auth-session";

const deleteSchema = z.object({
  confirmation: z.literal("DELETE"),
});

/**
 * POST /api/account/delete — permanent account deletion.
 *
 * Deliberately NOT available in preview mode: the reserved demo identity has
 * no account to delete, and wiping the shared preview dataset would destroy
 * the thing the preview exists to show. It stays a protected, destructive,
 * explicitly confirmed operation.
 *
 * Supabase Auth is gone: the credential row is removed from the database
 * provider (or from Firebase when that provider is configured), and the
 * session cookie is cleared by us rather than by an external sign-out call.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(
          createError("AUTH_REQUIRED", "Authentication required"),
          requestId,
        ),
        { status: 401 },
      );
    }

    if (isDemoUserId(user.id)) {
      return NextResponse.json(
        formatErrorResponse(
          createError(
            "UNAUTHORIZED",
            "Account deletion is disabled in preview mode.",
          ),
          requestId,
        ),
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError(
            "INVALID_REQUEST",
            "Type DELETE to confirm account deletion.",
          ),
          requestId,
        ),
        { status: 400 },
      );
    }

    const admin = await createAdminClient();
    const userId = user.id;

    // 1. Soft-delete profile
    await admin
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", userId);

    // 2. Delete storage objects (best-effort)
    try {
      const { data: portfolio } = await admin
        .from("portfolios")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (portfolio) {
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
                (f) => `${folderPath}/${f.name}`,
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

    // 4. Delete the credential account + every session that could use it.
    if (isDatabaseAuth()) {
      await revokeAllSessions(userId);
      const removed = await deleteAccount(userId);
      if (!removed) {
        return NextResponse.json(
          formatErrorResponse(
            createError(
              "PARTIAL_DELETION",
              "Your data has been deleted, but the account record could not be removed. Please contact support.",
            ),
            requestId,
          ),
          { status: 200 },
        );
      }
    } else {
      // Firebase provider: delete the identity there (best-effort — the data
      // rows above are already gone).
      try {
        const { getAdminAuth } = await import("@/lib/firebase/admin");
        await getAdminAuth().deleteUser(userId);
      } catch {
        return NextResponse.json(
          formatErrorResponse(
            createError(
              "PARTIAL_DELETION",
              "Your data has been deleted, but account deactivation could not complete. Please contact support.",
            ),
            requestId,
          ),
          { status: 200 },
        );
      }
    }

    invalidateSessionProfileCache(userId);

    // 5. Clear the session cookie (no external sign-out call any more).
    const res = NextResponse.json({
      data: {
        success: true,
        message: "Your account and all data have been permanently deleted.",
      },
      error: null,
      requestId,
    });
    clearSessionCookie(res);
    return res;
  } catch {
    return NextResponse.json(
      formatErrorResponse(
        createError("INTERNAL_ERROR", "Something went wrong"),
        requestId,
      ),
      { status: 500 },
    );
  }
}
