/**
 * Auth-scoped offline queue ownership.
 *
 * Requirement: queue items must never attach to "the next random user who
 * signs in on the same device". Every queue item is stamped with the user id
 * of the session that created it (or a safe pre-auth local marker), and only
 * items matching the CURRENT session's user id are ever synchronized.
 *
 * - `ownerId` is provided by SyncProvider from the Better Auth session.
 * - Items with no owner yet (created before the session resolved) get a
 *   `pre-auth` marker and are NOT synced until the same user session claims
 *   them explicitly (claimOnwershipForUser) — which only the UI does right
 *   after the user confirms intent while signed in.
 * - On sign-out the provider decides: keep drafts locally bound to that user
 *   (encrypted-at-rest app storage), or purge them. Nothing is silently lost.
 */
import type { QueueItem } from "@/lib/offline/types";

const OWNER_STORAGE_KEY = "healthfolio.queue.owner";

/** Safe pre-auth marker: an opaque random label, never a future user id. */
export function preAuthMarker(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pre-auth:${crypto.randomUUID()}`;
  }
  return `pre-auth:${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The user id whose queue items this browser session manages. */
export function getOwnerBinding(): string | null {
  try {
    return window.localStorage.getItem(OWNER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setOwnerBinding(userId: string | null): void {
  try {
    if (userId) {
      window.localStorage.setItem(OWNER_STORAGE_KEY, userId);
    } else {
      window.localStorage.removeItem(OWNER_STORAGE_KEY);
    }
  } catch {
    // Private-mode storage: binding lives only for this page lifecycle.
  }
}

/**
 * Whether an item may be synced under the current session.
 * - owned by the session user → yes
 * - owned by someone else / other pre-auth marker → never
 */
export function canSyncItem(item: QueueItem, ownerId: string | null): boolean {
  if (!ownerId) return false;
  if (!item.ownerId) return false; // unclaimed pre-auth items stay local
  return item.ownerId === ownerId;
}

/**
 * Sign-out policy hook: default keeps drafts bound to the signing-out user
 * (they remain in IndexedDB but can never sync to a different account).
 */
export function bindItemsToOwner(
  items: QueueItem[],
  ownerId: string | null
): QueueItem[] {
  const stamp = ownerId ?? preAuthMarker();
  return items.map((item) => ({ ...item, ownerId: item.ownerId ?? stamp }));
}
