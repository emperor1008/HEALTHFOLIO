/**
 * Queue storage drivers. Production uses IndexedDB (survives refresh,
 * tab close, browser restart). Tests use an equivalent in-memory driver.
 */

import type { BlobStorage, OfflineStore, QueueItem, QueueItemState } from "./types";

const DB_NAME = "healthfolio-offline";
const DB_VERSION = 1;
const ITEMS_STORE = "queue-items";
const BLOBS_STORE = "queue-blobs";

/** True in a real browser with IndexedDB available; false during SSR. */
const isBrowser: boolean =
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

/** Open the database, creating/upgrading stores as needed. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        const items = db.createObjectStore(ITEMS_STORE, { keyPath: "id" });
        items.createIndex("state", "state", { unique: false });
        items.createIndex("localCreatedAt", "localCreatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = await fn(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
    return result;
  } finally {
    db.close();
  }
}

/** Real IndexedDB implementation of the queue + blob storage. */
export function createIndexedDbStore(): OfflineStore {
  const items = {
    async getAll(): Promise<QueueItem[]> {
      const rows = await withStore(ITEMS_STORE, "readonly", (store) =>
        requestToPromise(store.getAll() as IDBRequest<QueueItem[]>)
      );
      return rows;
    },
    async put(item: QueueItem): Promise<void> {
      await withStore(ITEMS_STORE, "readwrite", (store) => requestToPromise(store.put(item)));
    },
    async update(item: QueueItem): Promise<void> {
      await withStore(ITEMS_STORE, "readwrite", (store) => requestToPromise(store.put(item)));
    },
    async remove(id: string): Promise<void> {
      await withStore(ITEMS_STORE, "readwrite", (store) => requestToPromise(store.delete(id)));
    },
    async countByState(state: QueueItemState): Promise<number> {
      const rows = await withStore(ITEMS_STORE, "readonly", (store) =>
        requestToPromise(store.getAll() as IDBRequest<QueueItem[]>)
      );
      return rows.filter((row) => row.state === state).length;
    },
  };

  const blobs: BlobStorage = {
    async putBlob(key: string, data: Blob): Promise<void> {
      await withStore(BLOBS_STORE, "readwrite", (store) =>
        requestToPromise(store.put({ key, data }))
      );
    },
    async getBlob(key: string): Promise<Blob | undefined> {
      const row = await withStore(BLOBS_STORE, "readonly", (store) =>
        requestToPromise(store.get(key) as IDBRequest<{ key: string; data: Blob } | undefined>)
      );
      return row?.data;
    },
    async removeBlob(key: string): Promise<void> {
      await withStore(BLOBS_STORE, "readwrite", (store) => requestToPromise(store.delete(key)));
    },
  };

  return { ...items, ...blobs };
}

/** Pure in-memory implementation — used by unit tests. */
export function createMemoryStore(): OfflineStore {
  const items = new Map<string, QueueItem>();
  const blobs = new Map<string, Blob>();

  return {
    async getAll() {
      return [...items.values()].map((item) => structuredClone(item));
    },
    async put(item: QueueItem) {
      if (items.has(item.id)) {
        throw new Error(`Queue item already exists: ${item.id}`);
      }
      items.set(item.id, structuredClone(item));
    },
    async update(item: QueueItem) {
      if (!items.has(item.id)) {
        throw new Error(`Queue item not found: ${item.id}`);
      }
      items.set(item.id, structuredClone(item));
    },
    async remove(id: string) {
      items.delete(id);
    },
    async countByState(state: QueueItemState) {
      let count = 0;
      for (const item of items.values()) if (item.state === state) count += 1;
      return count;
    },
    async putBlob(key: string, data: Blob) {
      blobs.set(key, data);
    },
    async getBlob(key: string) {
      return blobs.get(key);
    },
    async removeBlob(key: string) {
      blobs.delete(key);
    },
  };
}

/** Singleton for app usage (browser only; SSR-safe lazy init). */
let sharedStore: OfflineStore | undefined;

export function getOfflineStore(): OfflineStore {
  if (!sharedStore) {
    sharedStore = isBrowser ? createIndexedDbStore() : createMemoryStore();
  }
  return sharedStore;
}

/** Test helper: reset the singleton. */
export function resetOfflineStoreForTests(): void {
  sharedStore = undefined;
}
