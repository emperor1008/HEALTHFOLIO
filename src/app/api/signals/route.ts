import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "Health signals are temporarily unavailable. Try again.";

const listQuerySchema = z.object({
  status: z.enum(["draft", "acknowledged", "saved_for_later", "dismissed", "archived"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/signals
 * Lists the current session's Health Signals with server-side filtering and
 * pagination. Ownership is enforced by RLS plus an explicit user_id filter.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: GENERIC_ERROR } },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ signals: [], total: 0, hasMore: false });
    }

    let query = supabase
      .from("health_signals")
      .select(
        "id, latest_measurement_id, baseline_measurement_id, normalized_test_key, display_name, signal_type, lifecycle_status, payload, evidence, reason_code, rule_version, created_at, updated_at",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);

    if (parsed.data.status) {
      query = query.eq("lifecycle_status", parsed.data.status);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[signals] list failed:", error.code || "unknown");
      return NextResponse.json(
        { error: { code: "list_failed", message: GENERIC_ERROR } },
        { status: 500 }
      );
    }

    const total = count ?? data.length;
    return NextResponse.json({
      signals: data,
      total,
      hasMore: parsed.data.offset + data.length < total,
    });
  } catch (err) {
    console.error("[signals] list error:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { error: { code: "list_failed", message: GENERIC_ERROR } },
      { status: 500 }
    );
  }
}
