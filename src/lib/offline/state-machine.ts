/**
 * Pure queue state machine. No I/O — fully unit-testable.
 *
 * Legal transitions:
 *   pending            → syncing | failed
 *   syncing            → synced | failed | pending (transient failure, retry scheduled)
 *   failed             → syncing | pending | requires_attention
 *   requires_attention → syncing (only via explicit user retry)
 *
 * `synced` is terminal and only ever reached from a confirmed server ack.
 */

import type { QueueItem, QueueItemState, SyncAttemptResult } from "./types";

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  constructor(from: QueueItemState, to: QueueItemState) {
    super(`Cannot transition queue item from "${from}" to "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

export const MAX_AUTO_RETRIES = 5;
/** Bounded exponential backoff: 5s, 10s, 20s, 40s, 80s — capped at 2 minutes. */
export const BASE_BACKOFF_MS = 5_000;
export const MAX_BACKOFF_MS = 120_000;

const LEGAL_TRANSITIONS: Record<QueueItemState, readonly QueueItemState[]> = {
  pending: ["syncing", "failed"],
  // "requires_attention" from syncing: the server definitively rejected the
  // item mid-attempt — it must never stay stuck in "syncing".
  syncing: ["synced", "failed", "pending", "requires_attention"],
  failed: ["syncing", "pending", "requires_attention"],
  requires_attention: ["syncing", "pending"],
  synced: [],
};

export function canTransition(from: QueueItemState, to: QueueItemState): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: QueueItemState, to: QueueItemState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Backoff for the nth retry (0-based): base * 2^n, capped. Deterministic. */
export function backoffDelayMs(retryCount: number): number {
  const exponent = Math.max(0, Math.min(retryCount, 16));
  return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

function nowIso(now: Date): string {
  return now.toISOString();
}

/** Mark an item as being synced (picked up by the sync engine). */
export function beginSync(item: QueueItem, now: Date = new Date()): QueueItem {
  assertTransition(item.state, "syncing");
  return { ...item, state: "syncing", updatedAt: nowIso(now) };
}

/** Apply the result of one sync attempt to an item, producing the next state. */
export function applyAttemptResult(
  item: QueueItem,
  result: SyncAttemptResult,
  now: Date = new Date()
): QueueItem {
  switch (result.outcome) {
    case "synced": {
      assertTransition(item.state, "synced");
      return {
        ...item,
        state: "synced",
        serverRecordId: result.serverRecordId,
        syncedAt: nowIso(now),
        lastFailureReason: undefined,
        nextAttemptAt: undefined,
        updatedAt: nowIso(now),
      };
    }
    case "retryable_failure": {
      const nextRetryCount = item.retryCount + 1;
      const exhausted = nextRetryCount >= MAX_AUTO_RETRIES;
      const target: QueueItemState = exhausted ? "requires_attention" : "pending";
      assertTransition(item.state, target);
      return {
        ...item,
        state: target,
        retryCount: nextRetryCount,
        lastFailureReason: result.sanitizedReason,
        nextAttemptAt: exhausted ? undefined : new Date(now.getTime() + backoffDelayMs(nextRetryCount - 1)).toISOString(),
        updatedAt: nowIso(now),
      };
    }
    case "requires_attention": {
      // Definitive failure (e.g. rejected payload): stop auto-retrying.
      assertTransition(item.state, "requires_attention");
      return {
        ...item,
        state: "requires_attention",
        lastFailureReason: result.sanitizedReason,
        nextAttemptAt: undefined,
        updatedAt: nowIso(now),
      };
    }
  }
}

/**
 * Explicit user retry — allowed from failed/requires_attention; resets backoff.
 * Returns the item to `pending` so the next sync pass can pick it up via
 * selectDueItems (which only selects pending items).
 */
export function userRetry(item: QueueItem, now: Date = new Date()): QueueItem {
  assertTransition(item.state, "pending");
  return {
    ...item,
    state: "pending",
    retryCount: 0,
    nextAttemptAt: undefined,
    lastFailureReason: undefined,
    updatedAt: nowIso(now),
  };
}

/**
 * Put a failed/exhausted (or backoff-waiting) item back into the normal
 * pending rotation (manual sync). Idempotent for pending items; in-flight
 * (syncing) and already-delivered (synced) items can never be requeued.
 */
export function requeue(item: QueueItem, now: Date = new Date()): QueueItem {
  if (item.state === "syncing" || item.state === "synced") {
    throw new InvalidTransitionError(item.state, "pending");
  }
  return { ...item, state: "pending", nextAttemptAt: undefined, updatedAt: nowIso(now) };
}

/**
 * Items eligible for syncing right now, in FIFO local-creation order.
 * Only `pending` items are synced; `failed`/`requires_attention` items wait
 * for explicit user action. A pending item with a future `nextAttemptAt` is
 * still in its backoff window and is skipped — UNLESS `ignoreBackoff` is set,
 * which a user-initiated "Sync now" pass uses to override waiting
 * (the user explicitly asked; making them wait out a backoff feels broken).
 */
export function selectDueItems(
  items: QueueItem[],
  now: Date = new Date(),
  options: { ignoreBackoff?: boolean } = {},
): QueueItem[] {
  return items
    .filter((item) => item.state === "pending")
    .filter((item) => {
      if (options.ignoreBackoff) return true;
      if (!item.nextAttemptAt) return true;
      return new Date(item.nextAttemptAt).getTime() <= now.getTime();
    })
    .sort((a, b) => a.localCreatedAt.localeCompare(b.localCreatedAt));
}
