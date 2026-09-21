"use client";

/**
 * Dev-only network resilience instrumentation (audit fix).
 *
 * Wires `applyResilienceToFetch` into the window's global fetch so the
 * Network Resilience Panel's profiles (offline, slow 2G/3G, timeout,
 * drop-during-sync) actually affect real browser requests during local
 * testing. No-ops entirely when:
 *  - the build is production (double gate: NODE_ENV + localStorage flag);
 *  - the panel has never been enabled (profile "off" passes straight through).
 *
 * The wrapper only delays/drops requests — it never fabricates responses —
 * so no fake success can be produced through it.
 */

import { useEffect } from "react";
import { applyResilienceToFetch } from "@tests/support/network-resilience";

export function NetworkResilienceBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;
    const w = window as typeof window & { __hfResiliencePatched?: boolean };
    if (w.__hfResiliencePatched) return;
    w.__hfResiliencePatched = true;

    const originalFetch = window.fetch.bind(window);

    const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;

    const passthrough = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      originalFetch(input, init);

    const patched = applyResilienceToFetch(passthrough) as typeof window.fetch;

    window.fetch = (input, init) => {
      // Scope: same-origin app requests + this project's Supabase origin.
      // Everything else (browser extensions, other hosts) is untouched.
      try {
        const url =
          typeof input === "string"
            ? new URL(input, window.location.origin)
            : input instanceof URL
              ? input
              : new URL(input.url);
        const sameOrigin = url.origin === window.location.origin;
        const isProjectSupabase = supabaseOrigin !== null && url.origin === supabaseOrigin;
        if (!sameOrigin && !isProjectSupabase) return passthrough(input, init);
      } catch {
        /* fall through to the patched fetch */
      }
      return patched(input, init);
    };
  }, []);

  return null;
}
