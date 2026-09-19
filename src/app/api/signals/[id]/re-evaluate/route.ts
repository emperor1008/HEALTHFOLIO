import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-helpers";
import { runSignalMonitorForMeasurement } from "@/lib/signals/service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Calm, generic user-facing messages — no internal details. */
const GENERIC_ERROR =
  "We could not update this signal. Your health records were not changed.";

const recentRuns = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 6000;

/**
 * POST /api/signals/[id]/re-evaluate
 * Safely re-runs the deterministic monitor for the signal's latest
 * measurement. Idempotent: an unchanged series produces no new rows.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: GENERIC_ERROR } },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "no_session", message: GENERIC_ERROR } },
        { status: 401 }
      );
    }

    // Ownership check: the signal must belong to this session's user.
    const { data: signal, error: signalError } = await supabase
      .from("health_signals")
      .select("id, latest_measurement_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (signalError || !signal) {
      return NextResponse.json(
        { error: { code: "not_found", message: GENERIC_ERROR } },
        { status: 404 }
      );
    }

    // Duplicate-protect concurrent re-evaluation clicks.
    const dedupId = `${user.id}:${id}`;
    const lastAt = recentRuns.get(dedupId);
    const now = Date.now();
    if (lastAt && now - lastAt < DUPLICATE_WINDOW_MS) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    recentRuns.set(dedupId, now);
    if (recentRuns.size > 500) {
      for (const [key, ts] of Array.from(recentRuns.entries())) {
        if (now - ts > DUPLICATE_WINDOW_MS) recentRuns.delete(key);
      }
    }

    const result = await runSignalMonitorForMeasurement(
      supabase,
      user.id,
      signal.latest_measurement_id
    );

    if (result.status === "failed") {
      return NextResponse.json(
        { error: { code: "monitor_failed", message: GENERIC_ERROR } },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error("[signals] re-evaluate error:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { error: { code: "reevaluate_failed", message: GENERIC_ERROR } },
      { status: 500 }
    );
  }
}
