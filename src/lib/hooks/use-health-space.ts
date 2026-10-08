"use client";

import { useEffect, useState, useCallback } from "react";

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
 * Resolves the signed-in user's health space through the authenticated
 * /api/health-space endpoint (Better Auth session; no browser database).
 * Returns truthful states; never throws and never exposes error internals.
 */
export function useHealthSpace(): HealthSpaceState {
  const [state, setState] = useState<HealthSpaceState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setState({ status: "loading" });

      try {
        const res = await fetch("/api/health-space", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          // Signed out or session expired — surface as failure with retry;
          // the proxy handles full re-auth redirect on navigation.
          setState({ status: "failure", retry: () => setTick((t) => t + 1) });
          return;
        }
        if (!res.ok) {
          setState({ status: "failure", retry: () => setTick((t) => t + 1) });
          return;
        }
        const data = (await res.json()) as {
          portfolio: Portfolio | null;
          hasConsent: boolean;
        };
        if (cancelled) return;

        if (!data.hasConsent) {
          setState({ status: "needs_consent" });
          return;
        }
        if (data.portfolio) {
          setState({ status: "ready", portfolio: data.portfolio });
          return;
        }
        setState({ status: "no_portfolio" });
      } catch {
        if (!cancelled) {
          setState({ status: "failure", retry: () => setTick((t) => t + 1) });
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return state;
}

export interface HealthOverview {
  documents: Array<{
    id: string;
    original_name: string;
    title: string | null;
    category: string | null;
    processing_status: string;
    requires_review: boolean;
    created_at: string;
  }>;
  runs: Array<{ id: string; goal: string; status: string; created_at: string }>;
  trends: Array<{
    normalizedTestName: string;
    normalizedUnit: string | null;
    latestValue: number;
    latestDate: string;
    changeDirection: string;
    graphableMeasurements: number;
  }>;
  pendingMeasurements: number;
}

/**
 * Fetches the health-space overview via the authenticated API.
 * Returns null on failure so callers can show retry states.
 */
export async function fetchHealthOverview(portfolioId: string): Promise<HealthOverview | null> {
  try {
    const res = await fetch(
      `/api/health-space?overview=1&portfolio=${encodeURIComponent(portfolioId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { overview?: HealthOverview };
    return data.overview ?? null;
  } catch {
    return null;
  }
}
