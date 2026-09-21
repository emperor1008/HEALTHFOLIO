"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";

export interface Portfolio {
  id: string;
  label: string;
  created_at?: string;
}

export type HealthSpaceState =
  | { status: "loading" }
  | { status: "needs_consent" }
  | { status: "no_portfolio" }
  | { status: "failure"; retry: () => void }
  | { status: "ready"; portfolio: Portfolio };

/**
 * Resolves the anonymous session and the user's portfolio.
 * Returns truthful states; never throws and never exposes error internals.
 */
export function useHealthSpace(): HealthSpaceState {
  const [state, setState] = useState<HealthSpaceState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setState({ status: "loading" });

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setState({
          status: "failure",
          retry: () => setTick((t) => t + 1),
        });
        return;
      }

      // Fetch portfolio and consent status in parallel
      const [portfolioResult, consentResult] = await Promise.all([
        supabase
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

      if (cancelled) return;

      if (portfolioResult.error) {
        setState({
          status: "failure",
          retry: () => setTick((t) => t + 1),
        });
        return;
      }

      if (consentResult.error || !consentResult.data) {
        setState({ status: "needs_consent" });
        return;
      }

      if (portfolioResult.data) {
        setState({ status: "ready", portfolio: portfolioResult.data });
        return;
      }

      setState({ status: "no_portfolio" });
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return state;
}

/**
 * Fetches the health-space overview in parallel: documents, agent runs,
 * latest measurements, and pending review counts.
 * Returns null on failure so callers can show retry states.
 */
export async function fetchHealthOverview(portfolioId: string): Promise<{
  documents: Array<{
    id: string;
    original_name: string;
    title: string | null;
    category: string | null;
    processing_status: string;
    requires_review: boolean;
    created_at: string;
  }>;
  runs: Array<{
    id: string;
    goal: string;
    status: string;
    created_at: string;
  }>;
  trends: Array<{
    normalizedTestName: string;
    normalizedUnit: string | null;
    latestValue: number;
    latestDate: string;
    changeDirection: string;
    graphableMeasurements: number;
  }>;
  pendingMeasurements: number;
} | null> {
  const supabase = await createClient();

  const [docsResult, runsResult, trendsResult, pendingResult] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, original_name, title, category, processing_status, requires_review, created_at"
      )
      .eq("portfolio_id", portfolioId)
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
    return null;
  }

  // Group measurements per test and derive compact trend previews
  type Meas = (typeof trendsResult.data)[number];
  const groups = new Map<string, Meas[]>();
  for (const m of trendsResult.data || []) {
    if (m.value_numeric === null) continue;
    const key = m.normalized_test_name;
    const arr = groups.get(key);
    if (arr) {
      arr.push(m);
    } else {
      groups.set(key, [m]);
    }
  }

  const trends = Array.from(groups.entries())
    .map(([testName, meas]) => {
      const sorted = [...meas].sort(
        (a, b) =>
          new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime()
      );
      const latest = sorted[sorted.length - 1];
      const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
      let direction = "insufficient_data";
      if (previous && latest.value_numeric !== null && previous.value_numeric !== null) {
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

  return {
    documents: docsResult.data || [],
    runs: runsResult.data || [],
    trends,
    pendingMeasurements: pendingResult.count || 0,
  };
}

function getDate(m: {
  specimen_collected_at: string | null;
  observed_at: string | null;
  report_issued_at: string | null;
}): string {
  return m.specimen_collected_at || m.observed_at || m.report_issued_at || "";
}
