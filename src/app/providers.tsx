"use client";

/**
 * Client providers for the app. Mounted once in the root layout so every
 * route (app pages, offline fallback page) shares language + sync state.
 */

import { LanguageProvider } from "@/lib/i18n/language-context";
import { SyncProvider } from "@/lib/offline/sync-provider";
import { PwaRegistration } from "@/components/pwa/PwaRegistration";
import { NetworkResilienceBridge } from "@/components/dev/NetworkResilienceBridge";
import { NetworkResiliencePanel } from "@/components/dev/NetworkResiliencePanel";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SyncProvider>
      <LanguageProvider>
        {children}
        <PwaRegistration />
        <NetworkResilienceBridge />
        {/* Dev-only resilience controls; renders nothing in production builds. */}
        <NetworkResiliencePanel />
      </LanguageProvider>
    </SyncProvider>
  );
}
