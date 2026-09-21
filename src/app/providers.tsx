"use client";

/**
 * Client providers for the app. Mounted once in the root layout so every
 * route (app pages, offline fallback page) shares language + sync state.
 *
 * No development/test UI is mounted here: the network-resilience harness
 * lives only in test code (tests/unit/network-resilience-harness.ts) and is
 * never part of the running application. Network handling is fully automatic
 * via the SyncProvider (reconnect, focus/foreground, bounded backoff).
 */

import { LanguageProvider } from "@/lib/i18n/language-context";
import { SyncProvider } from "@/lib/offline/sync-provider";
import { PwaRegistration } from "@/components/pwa/PwaRegistration";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SyncProvider>
      <LanguageProvider>
        {children}
        <PwaRegistration />
      </LanguageProvider>
    </SyncProvider>
  );
}
