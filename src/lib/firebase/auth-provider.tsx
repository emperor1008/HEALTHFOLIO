"use client";

/**
 * FirebaseAuthProvider — auth-state provider (P1 Section C, spec §6).
 *
 * Keeps the HttpOnly `__session` cookie fresh: whenever the Firebase ID
 * token changes (initial restore, sign-in, ~hourly refresh), the token is
 * re-exchanged for a 7d session cookie through POST /api/auth/session. The
 * exchange is debounced so a burst of token events collapses into one
 * request, and it is skipped when signed out — the sign-out route owns
 * cookie clearing (sign-out must never re-mint a cookie).
 *
 * Mounted once in src/app/providers.tsx beside SyncProvider.
 */
import { useEffect } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";
import { isFirebaseClientConfigured } from "@/lib/firebase/config";

/** Debounce window for ID-token → session-cookie re-exchanges. */
const EXCHANGE_DEBOUNCE_MS = 1500;

async function exchangeSession(user: User): Promise<void> {
  try {
    const idToken = await user.getIdToken();
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    // Offline / rate-limited: retried on the next token event. A stale
    // cookie only means optimistic proxy gating until then — route handlers
    // verify it cryptographically anyway.
  }
}

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      return; // no web config: honest signed-out state, never a crash
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = onIdTokenChanged(getClientAuth(), (user) => {
        if (disposed) return;
        // Any user change invalidates a pending exchange — notably a sign-out
        // must cancel the timer so no cookie is minted after the clear.
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (!user) return;
        timer = setTimeout(() => {
          timer = null;
          void exchangeSession(user);
        }, EXCHANGE_DEBOUNCE_MS);
      });
    } catch {
      return; // config problem must never crash the tree
    }

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  return <>{children}</>;
}
