import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-helpers";
import { auditSignalEvent } from "@/lib/signals/service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generic, calm user-facing messages — never raw DB/PGRST details. */
const GENERIC_ERROR = "We could not update this signal. Your health records were not changed.";

const actionSchema = z.object({
  signalId: z.string().uuid(),
  action: z.enum(["acknowledge", "dismiss", "save_for_later", "archive"]),
  requestId: z.string().max(64).optional(),
});

/** In-process duplicate protection for identical actions in a short window. */
const recentActions = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 4000;

/**
 * POST /api/signals/actions
 * Applies one lifecycle transition via the atomic review_health_signal RPC
 * (ownership check + transition validation + audit write happen atomically
 * inside the database). Measurements are never modified.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "no_session", message: GENERIC_ERROR } },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "invalid_request", message: GENERIC_ERROR } },
        { status: 400 }
      );
    }

    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: GENERIC_ERROR } },
        { status: 400 }
      );
    }

    // Duplicate-protect identical user+signal+action calls in a short window.
    const dedupId = `${user.id}:${parsed.data.signalId}:${parsed.data.action}`;
    const lastAt = recentActions.get(dedupId);
    const now = Date.now();
    if (lastAt && now - lastAt < DUPLICATE_WINDOW_MS) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    recentActions.set(dedupId, now);
    if (recentActions.size > 1000) {
      for (const [key, ts] of Array.from(recentActions.entries())) {
        if (now - ts > DUPLICATE_WINDOW_MS) recentActions.delete(key);
      }
    }

    const { data, error } = await supabase.rpc("review_health_signal", {
      p_signal_id: parsed.data.signalId,
      p_action: parsed.data.action,
      p_request_id: parsed.data.requestId ?? null,
    });

    if (error) {
      console.error("[signals] action rpc failed:", error.code || "unknown");
      return NextResponse.json(
        { error: { code: "action_failed", message: GENERIC_ERROR } },
        { status: 500 }
      );
    }

    const result = data as { success?: boolean; errorCode?: string } | null;
    if (!result?.success) {
      const code = result?.errorCode ?? "unknown";
      return NextResponse.json(
        {
          error: {
            code,
            message:
              code === "TRANSITION_INVALID"
                ? "This signal was already updated. Refresh to see its current state."
                : GENERIC_ERROR,
          },
        },
        { status: code === "TRANSITION_INVALID" ? 409 : 404 }
      );
    }

    await auditSignalEvent(supabase, user.id, {
      action: `signal_${parsed.data.action}_api`,
      signalId: parsed.data.signalId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[signals] action error:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { error: { code: "action_failed", message: GENERIC_ERROR } },
      { status: 500 }
    );
  }
}
