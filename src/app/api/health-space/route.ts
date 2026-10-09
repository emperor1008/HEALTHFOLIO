import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/user-context";
import { getSessionUser } from "@/lib/auth-session";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Authenticated health-space bootstrap + overview.
 *
 * Replaces the browser-side Supabase reads the dashboard used to make: the
 * session user comes from Better Auth, ownership is enforced by explicit
 * `user_id` filters resolved server-side, and no database client ever reaches
 * the browser.
 *
 * GET → { portfolio, hasConsent } | 401 | 503 (server unconfigured)
 * GET ?overview=1&portfolio=<id> → additionally returns the dashboard overview,
 *   with portfolio ownership verified before any read.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const rl = hit(`overview:${user.id}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return NextResponse.json({ code: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  const url = new URL(req.url);
  const wantsOverview = url.searchParams.get("overview") === "1";
  const portfolioParam = url.searchParams.get("portfolio");

  // Portfolio + consent status for the signed-in user.
  const [portfolioResult, consentResult] = await Promise.all([
    portfolioParam
      ? supabase
          .from("portfolios")
          .select("id, label, created_at")
          .eq("user_id", user.id)
          .eq("id", portfolioParam)
          .limit(1)
          .maybeSingle()
      : supabase
          .from("portfolios")
          .select("id, label, created_at")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
    supabase
      .from("consents")
      .select("id")
      .eq("user_id", user.id)
      .eq("consent_type", "ai_processing")
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle(),
  ]);

  if (portfolioResult.error) {
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }

  const payload: Record<string, unknown> = {
    portfolio: portfolioResult.data ?? null,
    hasConsent: Boolean(consentResult.data),
  };

  if (wantsOverview && portfolioResult.data) {
    const portfolioId = portfolioResult.data.id as string;
    const [docsResult, runsResult, trendsResult, pendingResult] = await Promise.all([
      supabase
        .from("documents")
        .select(
          "id, original_name, title, category, processing_status, requires_review, created_at"
        )
        .eq("portfolio_id", portfolioId)
        .eq("user_id", user.id)
        .is("invalidated_at", null)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("agent_runs")
        .select("id, goal, status, created_at")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("medical_measurements")
        .select(
          "id, normalized_test_name, normalized_unit, value_numeric, observed_at, report_issued_at, specimen_collected_at, verification_status, invalidated_at, document_id"
        )
        .eq("verification_status", "verified")
        .is("invalidated_at", null)
        .order("observed_at", { ascending: false, nullsFirst: false })
        .limit(400),
      supabase
        .from("medical_measurements")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending")
        .is("invalidated_at", null),
    ]);

    if (docsResult.error || runsResult.error || trendsResult.error || pendingResult.error) {
      return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
    }

    type Meas = {
      normalized_test_name: string;
      normalized_unit: string | null;
      value_numeric: number | null;
      observed_at: string | null;
      report_issued_at: string | null;
      specimen_collected_at: string | null;
    };
    const groups = new Map<string, Meas[]>();
    for (const m of (trendsResult.data ?? []) as Meas[]) {
      if (m.value_numeric === null) continue;
      const arr = groups.get(m.normalized_test_name);
      if (arr) arr.push(m);
      else groups.set(m.normalized_test_name, [m]);
    }

    const trends = Array.from(groups.entries())
      .map(([testName, meas]) => {
        const sorted = [...meas].sort((a, b) => {
          const da = getDate(a);
          const db = getDate(b);
          return new Date(da).getTime() - new Date(db).getTime();
        });
        const latest = sorted[sorted.length - 1];
        const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
        let direction = "insufficient_data";
        if (
          previous &&
          latest.value_numeric !== null &&
          previous.value_numeric !== null
        ) {
          const delta = latest.value_numeric - previous.value_numeric;
          direction = delta > 0 ? "increased" : delta < 0 ? "decreased" : "unchanged";
        }
        return {
          normalizedTestName: testName,
          normalizedUnit: latest.normalized_unit,
          latestValue: latest.value_numeric as number,
          latestDate: getDate(latest),
          changeDirection: direction,
          graphableMeasurements: sorted.length,
        };
      })
      .filter((t) => t.graphableMeasurements >= 2)
      .sort(
        (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
      )
      .slice(0, 3);

    payload.overview = {
      documents: docsResult.data ?? [],
      runs: runsResult.data ?? [],
      trends,
      pendingMeasurements: pendingResult.count ?? 0,
    };
  }

  return NextResponse.json(payload);
}

function getDate(m: {
  specimen_collected_at: string | null;
  observed_at: string | null;
  report_issued_at: string | null;
}): string {
  return m.specimen_collected_at || m.observed_at || m.report_issued_at || "";
}
