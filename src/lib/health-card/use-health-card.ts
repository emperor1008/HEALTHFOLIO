"use client";

/**
 * useHealthCard — offline-first access to the Offline Health Card (Phase 2).
 *
 * Contract:
 * 1. LOCAL FIRST: the encrypted snapshot is loaded and rendered before any
 *    network request — opening the card never waits on (or requires) an API.
 * 2. REFRESH WHEN POSSIBLE: when the session resolves and the browser is
 *    online, the card refreshes from GET /api/health-card and is re-encrypted
 *    locally. Reconnect (online event) and foreground (visibilitychange)
 *    trigger refreshes — same triggers the Part 1 sync engine uses. This is a
 *    read-through cache, NOT a second queue: nothing is ever written back
 *    except the explicit facts PATCH.
 * 3. HONEST FRESHNESS: `freshness` is computed from the local save time
 *    (stale after 24h) and shown as "Last updated …" — stale data is labeled,
 *    never blocked, never presented as current.
 * 4. OWNER BINDING: snapshots are bound to the Better Auth session user id
 *    (same binding the offline queue uses); another account on the same
 *    device cannot read them.
 * 5. CLEAR LOCAL: removes ciphertext AND key material from this device only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getOwnerBinding, setOwnerBinding } from "@/lib/offline/ownership";
import { getHealthCardStore } from "./storage";
import {
  HEALTH_CARD_SCHEMA_VERSION,
  classifySnapshotFreshness,
  parseOfflineHealthCard,
  type HealthCardFacts,
  type OfflineHealthCard,
  type SnapshotFreshness,
} from "./model";

export type HealthCardSyncState =
  | "none"
  | "synced"
  | "updating"
  | "waiting_for_connection"
  | "needs_attention";

export interface UseHealthCardResult {
  card: OfflineHealthCard | null;
  savedAt: string | null;
  freshness: SnapshotFreshness | null;
  /** True once the local (offline) load attempt has finished. */
  loadedLocal: boolean;
  online: boolean;
  syncState: HealthCardSyncState;
  /** True when the last server refresh failed (saved copy still shown). */
  refreshError: boolean;
  /** Fetch + encrypt the latest card. No-op offline (honest state). */
  refresh: () => Promise<boolean>;
  /** Persist edited facts (online only) and refresh the local snapshot. */
  saveFacts: (facts: HealthCardFacts) => Promise<boolean>;
  /** Remove the encrypted snapshot and key from THIS device only. */
  clearLocal: () => Promise<void>;
}

async function resolveSessionOwner(current: string | null): Promise<string | null> {
  if (current) return current;
  try {
    const res = await fetch("/api/auth/session-owner", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { userId: string | null };
    if (data.userId) setOwnerBinding(data.userId);
    return data.userId;
  } catch {
    return null; // offline before a binding exists — local card stays unreachable
  }
}

export function useHealthCard(): UseHealthCardResult {
  const [card, setCard] = useState<OfflineHealthCard | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<SnapshotFreshness | null>(null);
  const [loadedLocal, setLoadedLocal] = useState(false);
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [syncState, setSyncState] = useState<HealthCardSyncState>("none");
  const [refreshError, setRefreshError] = useState(false);

  const ownerRef = useRef<string | null>(getOwnerBinding());
  const cardOwnerRef = useRef<string | null>(null);
  const savedAtRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  /** Keep state and ref in lockstep so interval ticks can read without render reads. */
  const updateSavedAt = useCallback((value: string | null) => {
    savedAtRef.current = value;
    setSavedAt(value);
  }, []);

  /** Encrypt + persist a card locally and mirror it into state. */
  const persistCard = useCallback(async (owner: string, next: OfflineHealthCard): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    const stored = await getHealthCardStore().save({
      ownerId: owner,
      savedAt: nowIso,
      version: next.version,
      schemaVersion: HEALTH_CARD_SCHEMA_VERSION,
      card: next,
    });
    if (!mountedRef.current) return stored;
    cardOwnerRef.current = owner;
    setCard(next);
    updateSavedAt(stored ? nowIso : null);
    setFreshness(stored ? classifySnapshotFreshness(nowIso, Date.now()) : null);
    setSyncState(stored ? "synced" : "needs_attention");
    setRefreshError(false);
    return stored;
  }, [updateSavedAt]);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (busyRef.current) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncState("waiting_for_connection");
      return false;
    }
    busyRef.current = true;
    setSyncState("updating");
    try {
      const owner = await resolveSessionOwner(ownerRef.current);
      if (!owner) {
        if (mountedRef.current) {
          setSyncState("needs_attention");
          setRefreshError(true);
        }
        return false;
      }
      ownerRef.current = owner;
      // Account switched on this device: never show the previous account's
      // snapshot while the new owner's card loads (or fails to load).
      if (cardOwnerRef.current && cardOwnerRef.current !== owner && mountedRef.current) {
        setCard(null);
        updateSavedAt(null);
        setFreshness(null);
        cardOwnerRef.current = null;
      }

      const res = await fetch("/api/health-card", { cache: "no-store" });
      if (!res.ok) throw new Error("health_card_load_failed");
      const payload = (await res.json()) as { data?: { card?: unknown } };
      const next = parseOfflineHealthCard(payload.data?.card);
      if (!next) throw new Error("health_card_invalid_response");

      await persistCard(owner, next);
      return true;
    } catch {
      if (mountedRef.current) {
        setRefreshError(true);
        setSyncState(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "waiting_for_connection"
            : "needs_attention"
        );
      }
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [persistCard, updateSavedAt]);

  const saveFacts = useCallback(
    async (facts: HealthCardFacts): Promise<boolean> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return false;
      const owner = await resolveSessionOwner(ownerRef.current);
      if (!owner) return false;
      ownerRef.current = owner;
      try {
        const res = await fetch("/api/health-card", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(facts),
        });
        if (!res.ok) return false;
        const payload = (await res.json()) as { data?: { card?: unknown } };
        const next = parseOfflineHealthCard(payload.data?.card);
        if (!next) return false;
        await persistCard(owner, next);
        return true;
      } catch {
        return false;
      }
    },
    [persistCard]
  );

  const clearLocal = useCallback(async () => {
    await getHealthCardStore().clear();
    if (!mountedRef.current) return;
    cardOwnerRef.current = null;
    setCard(null);
    updateSavedAt(null);
    setFreshness(null);
    setSyncState("none");
    setRefreshError(false);
  }, [updateSavedAt]);

  // ── Mount: local snapshot first (NO network on the critical path) ───────
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      const owner = await resolveSessionOwner(ownerRef.current);
      if (cancelled) return;
      if (owner) ownerRef.current = owner;
      const snapshot = owner ? await getHealthCardStore().load(owner) : null;
      if (cancelled) return;
      if (snapshot) {
        cardOwnerRef.current = snapshot.ownerId;
        setCard(snapshot.card);
        updateSavedAt(snapshot.savedAt);
        setFreshness(classifySnapshotFreshness(snapshot.savedAt, Date.now()));
      }
      setLoadedLocal(true);
      // Then refresh in the background when there is a session + network.
      if (owner && typeof navigator !== "undefined" && navigator.onLine) {
        void refresh();
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [refresh, updateSavedAt]);

  // ── Reconnect + foreground refresh (same triggers as the sync engine) ───
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => {
      setOnline(false);
      setSyncState((prev) => (prev === "none" ? prev : "waiting_for_connection"));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    };
    const onInterval = () => {
      // Recompute staleness periodically while open (state callback, never render).
      if (savedAtRef.current) {
        setFreshness(classifySnapshotFreshness(savedAtRef.current, Date.now()));
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(onInterval, 60_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  return {
    card,
    savedAt,
    freshness,
    loadedLocal,
    online,
    syncState,
    refreshError,
    refresh,
    saveFacts,
    clearLocal,
  };
}
