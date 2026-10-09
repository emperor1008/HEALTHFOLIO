/**
 * Local encryption for the Offline Health Card (Phase 2).
 *
 * Design (standard Web Crypto only — no invented cryptography):
 *
 *   KEY MATERIAL                          ENCRYPTED DATA
 *   ─────────────────────────────         ─────────────────────────────
 *   AES-GCM-256, non-extractable,         { iv, ciphertext } stored in a
 *   generated per-device, stored in       SEPARATE object store; plaintext
 *   a separate IndexedDB object store.    never touches storage.
 *
 * - The key is created with extractable: false, so it can never be exported
 *   (even by same-origin script reading IndexedDB).
 * - Each encryption uses a fresh random 96-bit IV (GCM standard).
 * - Key and ciphertext live in different stores: reading the snapshot store
 *   alone yields only ciphertext.
 * - Clearing the card removes BOTH the ciphertext and the key.
 *
 * Honest limitation (documented, not hidden): the key is protected against
 * casual/backup extraction and cross-origin attackers, NOT against malicious
 * same-origin JavaScript running in this origin (a successful XSS could read
 * the key while the page is open). Web Crypto gives no stronger local
 * guarantee in a browser context.
 */

const DB_NAME = "healthfolio-health-card";
const DB_VERSION = 1;
export const KEY_STORE = "card-key";
export const SNAPSHOT_STORE = "card-snapshot";
const KEY_ID = "device-key";
const SNAPSHOT_ID = "current";

export interface EncryptedPayload {
  /** Base64 raw IV (12 bytes). */
  iv: string;
  /** Base64 AES-GCM ciphertext. */
  ciphertext: string;
}

const GCM_IV_BYTES = 12;
const KEY_BITS = 256;

/** True in a real browser with IndexedDB; false during SSR/jsdom. */
const hasIndexedDb: boolean = typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("health-card db open failed"));
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
    const result = await fn(tx.objectStore(storeName));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("health-card tx failed"));
      tx.onabort = () => reject(tx.error ?? new Error("health-card tx aborted"));
    });
    return result;
  } finally {
    db.close();
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("health-card request failed"));
  });
}

// ── Key material (separate store; non-extractable) ─────────────────────────

/** Fallback when IndexedDB is unavailable (SSR / test environments). */
let memoryKey: CryptoKey | null = null;

export function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WEB_CRYPTO_UNAVAILABLE");
  return c.subtle;
}

/**
 * Get the per-device card key, generating it on first use.
 * Returns null only when Web Crypto itself is unavailable — the caller must
 * then refuse to store health data rather than store it in plaintext.
 */
export async function getOrCreateCardKey(): Promise<CryptoKey | null> {
  try {
    const subtleCrypto = subtle();
    if (!hasIndexedDb) {
      if (!memoryKey) {
        memoryKey = await subtleCrypto.generateKey(
          { name: "AES-GCM", length: KEY_BITS },
          false, // non-extractable
          ["encrypt", "decrypt"]
        );
      }
      return memoryKey;
    }
    const existing = await withStore(KEY_STORE, "readonly", (store) =>
      requestToPromise(store.get(KEY_ID) as IDBRequest<{ id: string; key: CryptoKey } | undefined>)
    );
    if (existing?.key) return existing.key;
    const key = await subtleCrypto.generateKey(
      { name: "AES-GCM", length: KEY_BITS },
      false,
      ["encrypt", "decrypt"]
    );
    await withStore(KEY_STORE, "readwrite", (store) =>
      requestToPromise(store.put({ id: KEY_ID, key }))
    );
    return key;
  } catch {
    return null;
  }
}

/** Delete the device key (part of "clear local card"). */
export async function clearCardKey(): Promise<void> {
  memoryKey = null;
  if (!hasIndexedDb) return;
  try {
    await withStore(KEY_STORE, "readwrite", (store) => requestToPromise(store.delete(KEY_ID)));
  } catch {
    // best-effort: the snapshot removal is handled by the storage module
  }
}

// ── Envelope helpers ───────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypt a JSON-serializable value with AES-GCM (fresh IV per call). */
export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

/**
 * Decrypt an envelope back into JSON. Throws on tampering/wrong key —
 * callers map that to "no snapshot", never to partial data.
 */
export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const plaintext = await subtle().decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export const healthCardIds = { SNAPSHOT_ID, KEY_ID } as const;
export const healthCardDb = { hasIndexedDb } as const;
