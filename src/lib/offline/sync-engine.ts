/**
 * Offline queue sync engine.
 *
 * Runs queued actions one at a time (strictly sequential to preserve order),
 * with server-side idempotency so replays never create duplicates. Never
 * marks an item "synced" until the server acknowledges the created record.
 */

import type { NetworkMonitor } from "./network";
import type { OfflineStore, QueueItem, QueueActionPayload, SyncAttemptResult } from "./types";
import { applyAttemptResult, beginSync, selectDueItems, userRetry } from "./state-machine";
import { isTransportFailure } from "./network";

/** Display-safe failure reasons. Never contain raw network/DB error text. */
export const FAILURE_REASONS = {
  offline: "Waiting for a connection",
  connection_dropped: "Connection dropped during delivery",
  server_busy: "The service is busy right now",
  rejected: "This item was not accepted by the service",
  auth_expired: "Please open the app to refresh your secure session",
} as const;

export type FailureReasonKey = keyof typeof FAILURE_REASONS;

export interface SyncHandlers {
  /** Execute one queued action against the real backend. Must be idempotent. */
  execute(
    item: QueueItem,
    ctx: { getBlob: (key: string) => Promise<Blob | undefined> }
  ): Promise<SyncAttemptResult>;
}

export interface SyncEngineEvents {
  /** Fired after any item state changed and was persisted. */
  onQueueChanged?: (items: QueueItem[]) => void;
  /** Fired when a full sync pass begins. */
  onSyncStart?: () => void;
  /** Fired when a full sync pass finishes. */
  onSyncEnd?: (summary: { attempted: number; synced: number; failed: number }) => void;
}

export interface SyncEngine {
  /** Queue a new action; returns the persisted queue item. */
  enqueue(
    actionType: QueueActionPayload["kind"] & string,
    payload: QueueActionPayload,
    options?: { blob?: Blob }
  ): Promise<QueueItem>;
  /** Run one sync pass over due items. Safe to call concurrently (coalesced). */
  syncNow(reason: "auto" | "manual" | "foreground"): Promise<void>;
  /** Explicit user retry for a failed item. */
  retryItem(id: string): Promise<void>;
  /** Remove a local draft and its blob after user confirmation. */
  removeItem(id: string): Promise<void>;
  /** Read all items (for UI). */
  getItems(): Promise<QueueItem[]>;
  /** Subscribe to queue changes. */
  subscribe(listener: (items: QueueItem[]) => void): () => void;
  /** Current sync activity flag. */
  isSyncing(): boolean;
  dispose(): void;
}

interface EngineDeps {
  store: OfflineStore;
  network: NetworkMonitor;
  handlers: SyncHandlers;
  events?: SyncEngineEvents;
}

/** Generate UUIDs with a fallback for older browsers. */
export function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const { store, network, handlers, events } = deps;
  const listeners = new Set<(items: QueueItem[]) => void>();

  let syncing = false;
  let syncRequested = false; // coalesce concurrent syncNow calls
  let disposed = false;
  const unsubscribers: Array<() => void> = [];

  async function emitChange(): Promise<void> {
    const items = await store.getAll();
    for (const listener of listeners) listener(items);
    events?.onQueueChanged?.(items);
  }

  async function persist(next: QueueItem): Promise<void> {
    await store.update(next);
    await emitChange();
  }

  async function runItem(item: QueueItem): Promise<{ outcome: "synced" | "failed" }> {
    const started = beginSync(item, new Date());
    await persist(started);

    let result: SyncAttemptResult;
    try {
      result = await handlers.execute(started, {
        getBlob: (key) => store.getBlob(key),
      });
    } catch (error) {
      if (isTransportFailure(error)) {
        result = {
          outcome: "retryable_failure",
          sanitizedReason: FAILURE_REASONS.connection_dropped,
        };
      } else {
        // Unknown execution error: fail safe — never lose the item.
        result = {
          outcome: "retryable_failure",
          sanitizedReason: FAILURE_REASONS.server_busy,
        };
      }
    }

    const next = applyAttemptResult(started, result, new Date());
    await persist(next);

    // Privacy-safe metrics: action type + outcome only, never payload data.
    try {
      const modName = "@/lib/metrics/service";
      const mod = (await import(modName)) as {
        recordMetric: (input: unknown) => void;
      };
      const startedMs = new Date(started.updatedAt).getTime();
      if (next.state === "synced") {
        mod.recordMetric({
          event: "queue_item_synced",
          durationMs: Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : null,
          metadata: { actionType: item.actionType },
        });
      } else if (next.state === "requires_attention") {
        mod.recordMetric({
          event: "queue_item_failed",
          metadata: { actionType: item.actionType, retryCount: next.retryCount },
        });
      }
    } catch {
      // metrics are best-effort only
    }

    return { outcome: next.state === "synced" ? "synced" : "failed" };
  }

  async function runPass(reason: "auto" | "manual" | "foreground"): Promise<void> {
    if (disposed) return;
    if (syncing) {
      syncRequested = true;
      return;
    }
    syncing = true;
    events?.onSyncStart?.();

    try {
      // Drain until nothing is due (covers items enqueued mid-pass), but
      // re-check network state before each item so a mid-pass drop stops us.
      // A manual pass overrides backoff windows: the user explicitly asked to
      // sync now, so waiting out an exponential backoff would feel broken.
      const ignoreBackoff = reason === "manual";
      for (;;) {
        if (!network.getState().online && reason !== "manual") break;
        const all = await store.getAll();
        const due = selectDueItems(all, new Date(), { ignoreBackoff });
        if (due.length === 0) break;
        await runItem(due[0]);
      }
    } finally {
      syncing = false;
      const all = await store.getAll();
      const failed = all.filter(
        (i) => i.state === "failed" || i.state === "requires_attention"
      ).length;
      const syncedThisPass = all.filter((i) => i.state === "synced" && i.syncedAt).length;
      events?.onSyncEnd?.({
        attempted: syncedThisPass + failed,
        synced: syncedThisPass,
        failed,
      });
      await emitChange();
      if (syncRequested) {
        syncRequested = false;
        void runPass(reason);
      }
    }
  }

  const engine: SyncEngine = {
    async enqueue(actionType, payload, options) {
      const now = new Date();
      const item: QueueItem = {
        id: generateUuid(),
        idempotencyKey: generateUuid(),
        actionType,
        payload,
        localCreatedAt: now.toISOString(),
        retryCount: 0,
        state: "pending",
        updatedAt: now.toISOString(),
        blobKey: options?.blob ? `blob-${generateUuid()}` : undefined,
      };
      if (options?.blob && item.blobKey) {
        await store.put(item);
        await store.putBlob(item.blobKey, options.blob);
      } else {
        await store.put(item);
      }
      await emitChange();

      // Metrics: queue_item_created (action type only — no payload data).
      // Uses a runtime indirection so the server-only metrics module is never
      // statically traced into the client bundle.
      try {
        const modName = "@/lib/metrics/service";
        const mod = (await import(/* webpackIgnore: false */ modName)) as {
          recordMetric: (input: unknown) => void;
        };
        mod.recordMetric({ event: "queue_item_created", metadata: { actionType } });
      } catch {
        /* best-effort; metrics must never break queue flow */
      }
      // Attempt immediate delivery when online.
      if (network.getState().online) {
        void engine.syncNow("auto");
      }
      return item;
    },

    async syncNow(reason) {
      // Manual sync also picks up failed/exhausted items by requeueing them,
      // and overrides any pending item's backoff window (the user asked for
      // it now — waiting out an exponential backoff would feel broken).
      if (reason === "manual") {
        const all = await store.getAll();
        for (const item of all) {
          if (item.state === "failed" || item.state === "requires_attention") {
            await store.update(requeueUserRetry(item));
          } else if (item.state === "pending" && item.nextAttemptAt) {
            await store.update({ ...item, nextAttemptAt: undefined, updatedAt: new Date().toISOString() });
          }
        }
        await emitChange();
      }
      await runPass(reason);
    },

    async retryItem(id) {
      const all = await store.getAll();
      const item = all.find((i) => i.id === id);
      if (!item) return;
      const next = userRetry(item, new Date());
      await persist(next);
      await engine.syncNow("manual");
    },

    async removeItem(id) {
      const all = await store.getAll();
      const item = all.find((i) => i.id === id);
      if (!item) return;
      if (item.blobKey) await store.removeBlob(item.blobKey);
      await store.remove(id);
      await emitChange();
    },

    async getItems() {
      return store.getAll();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    isSyncing() {
      return syncing;
    },

    dispose() {
      disposed = true;
      listeners.clear();
      for (const unsub of unsubscribers) unsub();
    },
  };

  // Wire lifecycle triggers: reconnect, foreground/focus, backoff tick.
  unsubscribers.push(
    network.subscribe((state) => {
      if (state.online && !disposed) void engine.syncNow("auto");
    })
  );

  const onVisible = () => {
    if (document.visibilityState === "visible" && !disposed) {
      void engine.syncNow("foreground");
    }
  };
  const onFocus = () => {
    if (!disposed) void engine.syncNow("foreground");
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    unsubscribers.push(() => document.removeEventListener("visibilitychange", onVisible));
    unsubscribers.push(() => window.removeEventListener("focus", onFocus));
  }

  return engine;

  /** Map a failed/exhausted item back to pending for a manual pass. */
  function requeueUserRetry(item: QueueItem): QueueItem {
    return {
      ...item,
      state: "pending",
      nextAttemptAt: undefined,
      updatedAt: new Date().toISOString(),
    };
  }
}
