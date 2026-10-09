/**
 * Encrypted local snapshot storage for the Offline Health Card (Phase 2).
 *
 * - The card payload is ALWAYS written encrypted (AES-GCM via crypto.ts);
 *   plaintext card content never reaches storage.
 * - Only metadata (owner id, save time, content version) stays outside the
 *   ciphertext — enough to bind the snapshot to the current session and to
 *   show staleness WITHOUT decrypting.
 * - Owner binding: a snapshot saved by one account is invisible to another
 *   account on a shared device (load() takes the expected owner id).
 * - Drivers: IndexedDB in the browser, in-memory where IndexedDB does not
 *   exist (SSR/test) — the same split the Part 1 queue uses.
 */

import {
  clearCardKey,
  encryptJson,
  decryptJson,
  getOrCreateCardKey,
  healthCardIds,
  healthCardDb,
  type EncryptedPayload,
} from "./crypto";
import {
  HEALTH_CARD_SCHEMA_VERSION,
  parseOfflineHealthCard,
  type HealthCardSnapshot,
  type HealthCardSnapshotMeta,
} from "./model";

interface StoredEnvelope {
  id: string;
  ownerId: string;
  savedAt: string;
  version: string;
  schemaVersion: number;
  payload: EncryptedPayload;
}

/** Raw envelope access (one implementation detail shared by both drivers). */
export interface HealthCardRawStore {
  get(): Promise<StoredEnvelope | undefined>;
  put(envelope: StoredEnvelope): Promise<void>;
  remove(): Promise<void>;
}

export function createMemoryRawStore(): HealthCardRawStore {
  let row: StoredEnvelope | undefined;
  return {
    async get() {
      return row;
    },
    async put(envelope) {
      row = envelope;
    },
    async remove() {
      row = undefined;
    },
  };
}

export function createIdbRawStore(): HealthCardRawStore {
  return {
    async get() {
      const db = await openDb();
      try {
        const tx = db.transaction("card-snapshot", "readonly");
        const row = await requestToPromise(
          tx.objectStore("card-snapshot").get(healthCardIds.SNAPSHOT_ID) as IDBRequest<StoredEnvelope | undefined>
        );
        return row;
      } finally {
        db.close();
      }
    },
    async put(envelope) {
      const db = await openDb();
      try {
        const tx = db.transaction("card-snapshot", "readwrite");
        await requestToPromise(tx.objectStore("card-snapshot").put(envelope));
        await transactionDone(tx);
      } finally {
        db.close();
      }
    },
    async remove() {
      const db = await openDb();
      try {
        const tx = db.transaction("card-snapshot", "readwrite");
        await requestToPromise(tx.objectStore("card-snapshot").delete(healthCardIds.SNAPSHOT_ID));
        await transactionDone(tx);
      } finally {
        db.close();
      }
    },
  };
}

// IndexedDB plumbing (mirrors the Part 1 queue store) ──────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("healthfolio-health-card", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("card-key")) db.createObjectStore("card-key", { keyPath: "id" });
      if (!db.objectStoreNames.contains("card-snapshot")) {
        db.createObjectStore("card-snapshot", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("health-card db open failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("health-card request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("health-card tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("health-card tx aborted"));
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface HealthCardStore {
  /** Load + decrypt the snapshot for OWNER. Null when absent/foreign/corrupt. */
  load(ownerId: string): Promise<HealthCardSnapshot | null>;
  /** Encrypt + persist the snapshot. Returns false when crypto is unavailable
   *  (the card is then NOT stored — never stored in plaintext). */
  save(snapshot: HealthCardSnapshot): Promise<boolean>;
  /** Remove ciphertext AND key material. */
  clear(): Promise<void>;
}

export function createHealthCardStore(raw: HealthCardRawStore): HealthCardStore {
  return {
    async load(ownerId) {
      if (!ownerId) return null;
      let row: StoredEnvelope | undefined;
      try {
        row = await raw.get();
      } catch {
        return null;
      }
      if (!row || row.ownerId !== ownerId) return null; // owner binding
      if (row.schemaVersion !== HEALTH_CARD_SCHEMA_VERSION) {
        // Shape changed since this snapshot was written: drop it honestly.
        await raw.remove().catch(() => undefined);
        return null;
      }
      try {
        const key = await getOrCreateCardKey();
        if (!key) return null;
        const decrypted = await decryptJson<unknown>(key, row.payload);
        const card = parseOfflineHealthCard(decrypted);
        if (!card) return null; // corrupt/tampered → unavailable, never partial
        const meta: HealthCardSnapshotMeta = {
          ownerId: row.ownerId,
          savedAt: row.savedAt,
          version: row.version,
          schemaVersion: row.schemaVersion,
        };
        return { ...meta, card };
      } catch {
        return null;
      }
    },

    async save(snapshot) {
      try {
        const key = await getOrCreateCardKey();
        if (!key) return false; // no Web Crypto → refuse to store plaintext
        const payload = await encryptJson(key, snapshot.card);
        const envelope: StoredEnvelope = {
          id: healthCardIds.SNAPSHOT_ID,
          ownerId: snapshot.ownerId,
          savedAt: snapshot.savedAt,
          version: snapshot.version,
          schemaVersion: snapshot.schemaVersion,
          payload,
        };
        await raw.put(envelope);
        return true;
      } catch {
        return false;
      }
    },

    async clear() {
      try {
        await raw.remove();
      } catch {
        // best-effort
      }
      await clearCardKey();
    },
  };
}

let sharedStore: HealthCardStore | undefined;

/** Singleton for app usage. IndexedDB in browsers; memory elsewhere. */
export function getHealthCardStore(): HealthCardStore {
  if (!sharedStore) {
    sharedStore = createHealthCardStore(
      healthCardDb.hasIndexedDb ? createIdbRawStore() : createMemoryRawStore()
    );
  }
  return sharedStore;
}

/** Test helper: reset the singleton (and swap in a memory-backed store). */
export function resetHealthCardStoreForTests(raw?: HealthCardRawStore): void {
  sharedStore = raw ? createHealthCardStore(raw) : undefined;
}
