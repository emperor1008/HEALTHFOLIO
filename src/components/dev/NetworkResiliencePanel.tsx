"use client";

/**
 * Dev-only control panel for the Network Resilience Test Mode.
 * Renders NOTHING in production builds (guards both NODE_ENV and the panel's
 * own flag), never writes data, and clearly labels itself as a test tool.
 */

import { useEffect, useState } from "react";
import {
  RESILIENCE_PROFILES,
  readResilienceProfile,
  writeResilienceProfile,
  type ResilienceProfile,
} from "@/lib/dev/network-resilience";

export function NetworkResiliencePanel() {
  const [enabled, setEnabled] = useState(false);
  const [profile, setProfile] = useState<ResilienceProfile>("off");

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    setEnabled(true);
    setProfile(readResilienceProfile());
  }, []);

  if (!enabled) return null;

  return (
    <section
      aria-label="Network resilience test mode (development only)"
      className="fixed bottom-2 right-2 z-50 max-w-xs rounded-md border border-dashed border-terracotta bg-canvas p-3 text-xs shadow-lg"
    >
      <p className="font-semibold text-terracotta">
        ⚠ Test mode — development only
      </p>
      <label htmlFor="resilience-profile" className="mt-2 block font-medium text-forest-900">
        Network profile
      </label>
      <select
        id="resilience-profile"
        value={profile}
        onChange={(e) => {
          const next = e.target.value as ResilienceProfile;
          setProfile(next);
          writeResilienceProfile(next);
        }}
        className="mt-1 w-full rounded border border-border bg-white px-2 py-1.5 text-forest-900"
      >
        {Object.values(RESILIENCE_PROFILES).map((p) => (
          <option key={p.profile} value={p.profile}>
            {p.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-forest-700">
        {RESILIENCE_PROFILES[profile].description}
      </p>
      <p className="mt-1 text-forest-600">
        Simulates connection conditions only. It never fakes server success and
        queued actions follow their real retry path.
      </p>
    </section>
  );
}
