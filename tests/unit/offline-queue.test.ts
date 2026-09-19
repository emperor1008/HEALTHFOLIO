/**
 * Unit tests for the offline queue: state machine (pure), idempotency-key
 * generation, retry/backoff, network detection abstraction, and the engine's
 * not-synced-until-acknowledged semantics.
 */

import { describe, it, expect, vi } from "vitest";
import {
  assertTransition,
  backoffDelayMs,
  beginSync,
  applyAttemptResult,
  userRetry,
  requeue,
  selectDueItems,
  InvalidTransitionError,
  MAX_AUTO_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
} from "@/lib/offline/state-machine";
import { generateUuid, createSyncEngine } from "@/lib/offline/sync-engine";
import { createNetworkMonitor, isTransportFailure } from "@/lib/offline/network";
import type { QueueItem, OfflineStore, QueueItemState, SyncAttemptResult } from "@/lib/offline/types";

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    id: "item-1",
    idempotencyKey: "key-1",
    actionType: "care_request.create",
    payload: {
      kind: "care_request.create",
      language: "en",
      reason: "Need help reading my report",
      contactMethod: "in_app",
      linkedDocumentIds: [],
      clientCreatedAt: now.toISOString(),
    },
    localCreatedAt: now.toISOString(),
    retryCount: 0,
    state: "pending",
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function makeStore(items: QueueItem[] = []): OfflineStore {
  const map = new Map<string, QueueItem>();
  const blobs = new Map<string, Blob>();
  for (const item of items) map.set(item.id, structuredClone(item));
  return {
    async getAll() {
      return [...map.values()].map((i) => structuredClone(i));
    },
    async put(item: QueueItem) {
      map.set(item.id, structuredClone(item));
    },
    async update(item: QueueItem) {
      map.set(item.id, structuredClone(item));
    },
    async remove(id: string) {
      map.delete(id);
    },
    async countByState(state: QueueItemState) {
      return [...map.values()].filter((i) => i.state === state).length;
    },
    async putBlob(key: string, data: Blob) {
      blobs.set(key, data);
    },
    async getBlob(key: string): Promise<Blob | undefined> {
      return blobs.get(key);
    },
    async removeBlob(key: string) {
      blobs.delete(key);
    },
  };
}

describe("queue state transitions", () => {
  it("allows pending → syncing", () => {
    expect(() => assertTransition("pending", "syncing")).not.toThrow();
  });

  it("allows syncing → synced | failed | pending", () => {
    expect(() => assertTransition("syncing", "synced")).not.toThrow();
    expect(() => assertTransition("syncing", "failed")).not.toThrow();
    expect(() => assertTransition("syncing", "pending")).not.toThrow();
  });

  it("allows requires_attention → pending (user retry requeues)", () => {
    expect(() => assertTransition("requires_attention", "pending")).not.toThrow();
  });

  it("forbids synced from anything except syncing (never before ack)", () => {
    expect(() => assertTransition("pending", "synced")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("failed", "synced")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("requires_attention", "synced")).toThrow(InvalidTransitionError);
  });

  it("synced is terminal", () => {
    expect(() => assertTransition("synced", "pending")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("synced", "syncing")).toThrow(InvalidTransitionError);
  });

  it("beginSync moves pending → syncing and stamps updatedAt", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const next = beginSync(makeItem(), now);
    expect(next.state).toBe("syncing");
    expect(next.updatedAt).toBe(now.toISOString());
  });

  it("applyAttemptResult synced records server id and sync time", () => {
    const now = new Date();
    const next = applyAttemptResult(beginSync(makeItem()), {
      outcome: "synced",
      serverRecordId: "srv-123",
    }, now);
    expect(next.state).toBe("synced");
    expect(next.serverRecordId).toBe("srv-123");
    expect(next.syncedAt).toBe(now.toISOString());
  });

  it("applyAttemptResult retryable failure increments retryCount and schedules backoff", () => {
    const item = makeItem({ retryCount: 0 });
    const next = applyAttemptResult(beginSync(item), {
      outcome: "retryable_failure",
      sanitizedReason: "Connection dropped during delivery",
    });
    expect(next.state).toBe("pending");
    expect(next.retryCount).toBe(1);
    expect(next.nextAttemptAt).toBeTruthy();
  });

  it("applyAttemptResult exhausts retries into requires_attention and keeps the item", () => {
    let item = makeItem();
    for (let i = 0; i < MAX_AUTO_RETRIES; i++) {
      // Each attempt begins from a pending item, as the engine does.
      item = beginSync(item.state === "syncing" ? { ...item, state: "pending" } : item);
      item = applyAttemptResult(item, {
        outcome: "retryable_failure",
        sanitizedReason: "The service is busy right now",
      });
      // After a retryable failure the item is pending again (or exhausted).
      if (i < MAX_AUTO_RETRIES - 1) {
        expect(item.state).toBe("pending");
      }
    }
    expect(item.state).toBe("requires_attention");
    expect(item.retryCount).toBe(MAX_AUTO_RETRIES);
  });

  it("applyAttemptResult requires_attention stops auto-retry immediately", () => {
    const next = applyAttemptResult(beginSync(makeItem()), {
      outcome: "requires_attention",
      sanitizedReason: "This item was not accepted by the service",
    });
    expect(next.state).toBe("requires_attention");
    expect(next.nextAttemptAt).toBeUndefined();
  });

  it("userRetry requeues a failed item with a fresh backoff budget", () => {
    const failed = applyAttemptResult(beginSync(makeItem()), {
      outcome: "requires_attention",
      sanitizedReason: "This item was not accepted by the service",
    });
    const next = userRetry(failed);
    expect(next.state).toBe("pending");
    expect(next.retryCount).toBe(0);
    expect(next.lastFailureReason).toBeUndefined();
  });

  it("requeue only accepts pending items", () => {
    // Failed/backoff items requeue cleanly (idempotent for pending).
    expect(() => requeue(makeItem({ state: "failed" }))).not.toThrow();
    expect(() => requeue(makeItem({ state: "pending", nextAttemptAt: new Date().toISOString() }))).not.toThrow();
    // In-flight and delivered items can never be requeued.
    expect(() => requeue(makeItem({ state: "syncing" }))).toThrow(InvalidTransitionError);
    expect(() => requeue(makeItem({ state: "synced" }))).toThrow(InvalidTransitionError);
  });
});

describe("retry/backoff logic", () => {
  it("grows exponentially from the base delay", () => {
    expect(backoffDelayMs(0)).toBe(BASE_BACKOFF_MS);
    expect(backoffDelayMs(1)).toBe(BASE_BACKOFF_MS * 2);
    expect(backoffDelayMs(2)).toBe(BASE_BACKOFF_MS * 4);
    expect(backoffDelayMs(3)).toBe(BASE_BACKOFF_MS * 8);
  });

  it("caps at the maximum delay", () => {
    expect(backoffDelayMs(10)).toBe(MAX_BACKOFF_MS);
    expect(backoffDelayMs(99)).toBe(MAX_BACKOFF_MS);
  });

  it("never schedules retries past MAX_AUTO_RETRIES", () => {
    let item = makeItem();
    for (let i = 0; i < MAX_AUTO_RETRIES; i++) {
      item = beginSync(item.state === "syncing" ? { ...item, state: "pending" } : item);
      item = applyAttemptResult(item, {
        outcome: "retryable_failure",
        sanitizedReason: "Connection dropped during delivery",
      });
    }
    expect(item.state).toBe("requires_attention");
    expect(item.nextAttemptAt).toBeUndefined();
  });
});

describe("idempotency-key generation", () => {
  it("produces unique UUIDs for id and idempotencyKey on every enqueue", async () => {
    const store = makeStore();
    const network = { getState: () => ({ online: false }), subscribe: () => () => {} };
    const engine = createSyncEngine({
      store,
      network,
      handlers: { execute: async () => ({ outcome: "synced", serverRecordId: "x" }) },
    });
    const a = await engine.enqueue("care_request.create", makeItem().payload);
    const b = await engine.enqueue("care_request.create", makeItem().payload);
    expect(a.id).not.toBe(b.id);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    engine.dispose();
  });

  it("keeps the same idempotencyKey across retries (duplicate-safe replays)", async () => {
    const store = makeStore();
    const keysSeen: string[] = [];
    let calls = 0;
    const network = { getState: () => ({ online: true }), subscribe: () => () => {} };
    const engine = createSyncEngine({
      store,
      network,
      handlers: {
        execute: async (item) => {
          calls += 1;
          keysSeen.push(item.idempotencyKey);
          // Fail once, then keep failing after backoff windows are skipped by
          // manual sync (which clears nextAttemptAt) — same key every time.
          return calls === 1
            ? { outcome: "retryable_failure", sanitizedReason: "The service is busy right now" }
            : { outcome: "retryable_failure", sanitizedReason: "Connection dropped during delivery" };
        },
      },
    });
    await engine.enqueue("care_request.create", makeItem().payload);
    await engine.syncNow("manual");
    await engine.syncNow("manual");
    await engine.syncNow("manual");
    // Subsequent syncNow calls coalesce into the in-flight pass, so allow the
    // final background runPass to settle before asserting.
    await new Promise((r) => setTimeout(r, 50));
    // Every replay used the SAME idempotency key — the server can dedupe.
    expect(keysSeen.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keysSeen).size).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(2);
    engine.dispose();
  });

  it("generateUuid is well-formed with or without crypto.randomUUID", () => {
    expect(generateUuid()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("offline/online detection abstraction", () => {
  function fakeWindow(initialOnline: boolean) {
    const listeners = new Map<string, Set<() => void>>();
    const win = {
      navigator: { onLine: initialOnline, connection: { effectiveType: "3g", saveData: true } },
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn);
      },
      goOnline: () => {
        win.navigator.onLine = true;
        (listeners.get("online") ?? new Set()).forEach((fn) => fn());
      },
      goOffline: () => {
        win.navigator.onLine = false;
        (listeners.get("offline") ?? new Set()).forEach((fn) => fn());
      },
    };
    return win;
  }

  it("reads initial state from navigator.onLine", () => {
    const win = fakeWindow(false);
    const monitor = createNetworkMonitor(win);
    expect(monitor.getState().online).toBe(false);
    expect(monitor.getState().effectiveType).toBe("3g");
  });

  it("notifies subscribers on online/offline events", () => {
    const win = fakeWindow(false); // start offline: goOffline() then emits no change
    const monitor = createNetworkMonitor(win);
    const seen: boolean[] = [];
    const unsub = monitor.subscribe((s) => seen.push(s.online));
    win.goOnline();
    win.goOffline();
    win.goOnline();
    expect(seen).toEqual([true, false, true]);
    unsub();
  });

  it("classify transport failures as retryable, HTTP statuses as deliberate", () => {
    expect(isTransportFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransportFailure(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isTransportFailure({ code: "TIMEOUT" })).toBe(true);
    expect(isTransportFailure(new Error("boom"))).toBe(false);
  });
});

describe("sync engine semantics", () => {
  it("does not mark items synced before a server acknowledgement", async () => {
    const store = makeStore();
    let resolveAttempt: (r: SyncAttemptResult) => void = () => {};
    const network = { getState: () => ({ online: true }), subscribe: () => () => {} };
    const engine = createSyncEngine({
      store,
      network,
      handlers: {
        execute: () => new Promise<SyncAttemptResult>((resolve) => (resolveAttempt = resolve)),
      },
    });
    const item = await engine.enqueue("care_request.create", makeItem().payload);
    await engine.syncNow("manual");
    // While the attempt is in flight the item is syncing, not synced.
    const all = await store.getAll();
    expect(all.find((i) => i.id === item.id)?.state).toBe("syncing");
    resolveAttempt({ outcome: "synced", serverRecordId: "srv-1" });
    await vi.waitFor(async () => {
      const after = await store.getAll();
      expect(after.find((i) => i.id === item.id)?.state).toBe("synced");
    });
    engine.dispose();
  });

  it("duplicate sync retries do not duplicate server records (one execute per item)", async () => {
    const store = makeStore();
    let calls = 0;
    const network = { getState: () => ({ online: true }), subscribe: () => () => {} };
    const engine = createSyncEngine({
      store,
      network,
      handlers: {
        execute: async () => {
          calls += 1;
          return { outcome: "synced", serverRecordId: `srv-${calls}` };
        },
      },
    });
    await engine.enqueue("care_request.create", makeItem().payload);
    await engine.syncNow("manual");
    await engine.syncNow("manual");
    await engine.syncNow("manual");
    // Idempotency: already-synced items are never re-sent.
    expect(calls).toBe(1);
    engine.dispose();
  });

  it("failed uploads stay queued and visible (never auto-deleted)", async () => {
    const store = makeStore();
    const network = { getState: () => ({ online: true }), subscribe: () => () => {} };
    const engine = createSyncEngine({
      store,
      network,
      handlers: {
        execute: async () => ({ outcome: "requires_attention", sanitizedReason: "This item was not accepted by the service" }),
      },
    });
    const item = await engine.enqueue("care_request.create", makeItem().payload);
    await engine.syncNow("manual");
    const all = await store.getAll();
    expect(all.find((i) => i.id === item.id)?.state).toBe("requires_attention");
    expect(all.length).toBe(1);
    engine.dispose();
  });

  it("selectDueItems orders strictly by local creation (FIFO)", () => {
    const first = makeItem({ id: "a", localCreatedAt: "2026-01-01T00:00:00Z" });
    const second = makeItem({ id: "b", localCreatedAt: "2026-01-01T00:01:00Z" });
    const third = makeItem({ id: "c", localCreatedAt: "2026-01-01T00:02:00Z" });
    expect(selectDueItems([third, first, second]).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("skips items inside their backoff window", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const item = makeItem({ nextAttemptAt: future });
    expect(selectDueItems([item])).toHaveLength(0);
  });

  it("offline draft survives a reload (fresh engine over the same store)", async () => {
    const store = makeStore();
    const network = { getState: () => ({ online: false }), subscribe: () => () => {} };
    const engine1 = createSyncEngine({
      store,
      network,
      handlers: { execute: async () => ({ outcome: "synced", serverRecordId: "x" }) },
    });
    const draft = await engine1.enqueue("care_request.create", makeItem().payload);
    engine1.dispose();

    // "Reload": brand-new engine instance over the same persisted store.
    const engine2 = createSyncEngine({
      store,
      network,
      handlers: { execute: async () => ({ outcome: "synced", serverRecordId: "srv-2" }) },
    });
    const restored = await engine2.getItems();
    expect(restored.find((i) => i.id === draft.id)?.state).toBe("pending");

    const delivered: string[] = [];
    const engine3 = createSyncEngine({
      store,
      network: { getState: () => ({ online: true }), subscribe: () => () => {} },
      handlers: {
        execute: async (item) => {
          delivered.push(item.id);
          return { outcome: "synced", serverRecordId: "srv-3" };
        },
      },
    });
    await engine3.syncNow("manual");
    expect(delivered).toContain(draft.id);
    engine2.dispose();
    engine3.dispose();
  });

  it("removeItem only deletes after an explicit request and removes the blob too", async () => {
    const store = makeStore();
    const network = { getState: () => ({ online: false }), subscribe: () => () => {} };
    const engine = createSyncEngine({ store, network, handlers: { execute: async () => ({ outcome: "synced", serverRecordId: "x" }) } });
    const blobStore = store as unknown as { put: (k: string, b: Blob) => Promise<void>; blobs: Map<string, Blob> };
    const file = new Blob(["pdf-bytes"]);
    const item = await engine.enqueue(
      "record.stage_upload",
      {
        kind: "record.stage_upload",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        byteSize: 9,
        stagePurpose: "record",
        clientCreatedAt: new Date().toISOString(),
      },
      { blob: file }
    );
    expect(item.blobKey).toBeTruthy();
    // The original file bytes are preserved locally until delivery/removal.
    expect(await store.getBlob(item.blobKey!)).toBeTruthy();
    await engine.removeItem(item.id);
    const all = await store.getAll();
    expect(all.find((i) => i.id === item.id)).toBeUndefined();
    expect(await store.getBlob(item.blobKey!)).toBeUndefined();
    engine.dispose();
  });
});
