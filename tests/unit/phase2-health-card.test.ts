/**
 * Phase 2 — Offline Health Card: encryption, storage, freshness, hook.
 *
 * Proves:
 * - AES-GCM roundtrip with the per-device non-extractable key; wrong key /
 *   tampered ciphertext ⇒ unavailable (never partial data);
 * - plaintext NEVER reaches storage (ciphertext-only envelope);
 * - owner binding: another account on the same device cannot read the
 *   snapshot; schema-version change drops it honestly; clear removes both
 *   ciphertext and key;
 * - save REFUSES to store when Web Crypto is unavailable (no plaintext);
 * - freshness: stale after 24h, labeled not blocked;
 * - hook: local snapshot opens with NO network while offline; a refresh
 *   failure keeps the saved copy and reports honestly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  encryptJson,
  decryptJson,
  getOrCreateCardKey,
  clearCardKey,
} from "@/lib/health-card/crypto";
import {
  createMemoryRawStore,
  createHealthCardStore,
  getHealthCardStore,
  resetHealthCardStoreForTests,
} from "@/lib/health-card/storage";
import {
  HEALTH_CARD_SCHEMA_VERSION,
  classifySnapshotFreshness,
  cardContentDiffers,
  parseOfflineHealthCard,
  type HealthCardSnapshot,
  type OfflineHealthCard,
} from "@/lib/health-card/model";
import { useHealthCard } from "@/lib/health-card/use-health-card";
import { setOwnerBinding } from "@/lib/offline/ownership";

const CARD: OfflineHealthCard = {
  schemaVersion: HEALTH_CARD_SCHEMA_VERSION,
  version: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  profile: { displayName: "Asha Kumar", preferredLanguage: "hi" },
  allergies: ["Penicillin"],
  conditions: ["Asthma"],
  medications: ["Metformin"],
  recentCare: [],
};

function snapshot(overrides: Partial<HealthCardSnapshot> = {}): HealthCardSnapshot {
  return {
    ownerId: "u1",
    savedAt: new Date().toISOString(),
    version: CARD.version,
    schemaVersion: HEALTH_CARD_SCHEMA_VERSION,
    card: CARD,
    ...overrides,
  };
}

const fetchMock = vi.fn();
const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("offline in test"));
  window.localStorage.clear();
  resetHealthCardStoreForTests(createMemoryRawStore());
  void clearCardKey();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetHealthCardStoreForTests(createMemoryRawStore());
  if (originalOnLineDescriptor) {
    Object.defineProperty(window.navigator, "onLine", originalOnLineDescriptor);
  } else {
    setOnLine(true);
  }
});

// ── Encryption ─────────────────────────────────────────────────────────────

describe("health-card crypto", () => {
  it("round-trips JSON through AES-GCM with a non-extractable key", async () => {
    const key = await getOrCreateCardKey();
    expect(key).not.toBeNull();
    expect(key?.extractable).toBe(false);

    const payload = await encryptJson(key as CryptoKey, CARD);
    expect(payload.iv).toBeTruthy();
    expect(payload.ciphertext).toBeTruthy();
    expect(payload.ciphertext).not.toContain("Penicillin");

    const back = await decryptJson<OfflineHealthCard>(key as CryptoKey, payload);
    expect(back).toEqual(CARD);
  });

  it("uses a fresh IV per encryption", async () => {
    const key = (await getOrCreateCardKey()) as CryptoKey;
    const a = await encryptJson(key, CARD);
    const b = await encryptJson(key, CARD);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects decryption with a different key", async () => {
    const keyA = (await getOrCreateCardKey()) as CryptoKey;
    await clearCardKey();
    const keyB = (await getOrCreateCardKey()) as CryptoKey;
    const payload = await encryptJson(keyA, CARD);
    await expect(decryptJson(keyB, payload)).rejects.toThrow();
  });

  it("rejects tampered ciphertext", async () => {
    const key = (await getOrCreateCardKey()) as CryptoKey;
    const payload = await encryptJson(key, CARD);
    const raw = Uint8Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0));
    raw[0] ^= 0xff;
    const tampered = btoa(String.fromCharCode(...raw));
    await expect(
      decryptJson(key, { iv: payload.iv, ciphertext: tampered })
    ).rejects.toThrow();
  });
});

// ── Store: owner binding, migration-drop, clear ────────────────────────────

describe("health-card encrypted store", () => {
  it("stores ciphertext only and round-trips for the owner", async () => {
    const raw = createMemoryRawStore();
    const store = createHealthCardStore(raw);

    expect(await store.save(snapshot())).toBe(true);

    const row = await raw.get();
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain("Penicillin");
    expect(JSON.stringify(row)).not.toContain("Asha Kumar");
    expect(row?.ownerId).toBe("u1");
    expect(row?.payload).toHaveProperty("iv");
    expect(row?.payload).toHaveProperty("ciphertext");

    const loaded = await store.load("u1");
    expect(loaded?.card).toEqual(CARD);
    expect(loaded?.ownerId).toBe("u1");
  });

  it("another account on the same device cannot read the snapshot", async () => {
    const store = createHealthCardStore(createMemoryRawStore());
    await store.save(snapshot({ ownerId: "u1" }));
    expect(await store.load("u2")).toBeNull();
    expect(await store.load("")).toBeNull();
    expect(await store.load("u1")).not.toBeNull();
  });

  it("drops a snapshot written by an older schema version (honestly)", async () => {
    const raw = createMemoryRawStore();
    const store = createHealthCardStore(raw);
    await store.save(snapshot({ schemaVersion: 999 }));

    expect(await store.load("u1")).toBeNull();
    expect(await raw.get()).toBeUndefined(); // dropped, not reused
  });

  it("corrupt/tampered payload degrades to null, never partial data", async () => {
    const raw = createMemoryRawStore();
    const store = createHealthCardStore(raw);
    await store.save(snapshot());
    const row = await raw.get();
    if (row) {
      row.payload = {
        ...row.payload,
        ciphertext: btoa("garbage-not-ciphertext"),
      };
      await raw.put(row);
    }
    expect(await store.load("u1")).toBeNull();
  });

  it("clear removes ciphertext AND key material", async () => {
    const raw = createMemoryRawStore();
    const store = createHealthCardStore(raw);
    await store.save(snapshot());
    expect(await raw.get()).toBeTruthy();

    await store.clear();
    expect(await raw.get()).toBeUndefined();
    expect(await store.load("u1")).toBeNull();
  });

  it("refuses to save when Web Crypto is unavailable (no plaintext ever)", async () => {
    const raw = createMemoryRawStore();
    const store = createHealthCardStore(raw);
    // Simulate a browser/context without SubtleCrypto.
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a });

    const ok = await store.save(snapshot());
    expect(ok).toBe(false);
    expect(await raw.get()).toBeUndefined(); // nothing written at all
  });
});

// ── Model: freshness + parsing ─────────────────────────────────────────────

describe("health-card model", () => {
  const now = Date.parse("2026-10-02T12:00:00.000Z");

  it("classifies fresh vs stale snapshots (24h)", () => {
    expect(classifySnapshotFreshness("2026-10-02T11:00:00.000Z", now)).toBe("current");
    expect(classifySnapshotFreshness("2026-10-02T11:59:00.000Z", now)).toBe("current");
    expect(classifySnapshotFreshness("2026-10-01T11:59:00.000Z", now)).toBe("stale");
    expect(classifySnapshotFreshness("not-a-date", now)).toBe("stale");
  });

  it("detects content changes via version", () => {
    const a = { ...CARD, version: "v1" };
    const b = { ...CARD, version: "v2" };
    expect(cardContentDiffers({ ...a }, a)).toBe(false); // same version
    expect(cardContentDiffers(a, b)).toBe(true);
    expect(cardContentDiffers({ ...a, version: "v9" }, b)).toBe(true);
    expect(cardContentDiffers(null, b)).toBe(true);
  });

  it("rejects corrupt or foreign card payloads", () => {
    expect(parseOfflineHealthCard(CARD)).toEqual(CARD);
    expect(parseOfflineHealthCard({ ...CARD, allergies: "nope" })).toBeNull();
    expect(parseOfflineHealthCard(null)).toBeNull();
    expect(parseOfflineHealthCard({})).toBeNull();
  });
});

// ── Hook: offline-first behavior ───────────────────────────────────────────

describe("useHealthCard (offline-first)", () => {
  it("opens from the local snapshot with NO network while offline", async () => {
    setOwnerBinding("u1");
    await getHealthCardStore().save(snapshot());
    setOnLine(false);

    const { result } = renderHook(() => useHealthCard());
    await waitFor(() => expect(result.current.loadedLocal).toBe(true));

    expect(result.current.card?.profile.displayName).toBe("Asha Kumar");
    expect(result.current.freshness).toBe("current");
    expect(fetchMock).not.toHaveBeenCalled(); // no network on open
  });

  it("never shows another account's snapshot", async () => {
    setOwnerBinding("u2"); // session is u2…
    await getHealthCardStore().save(snapshot({ ownerId: "u1" })); // …card belongs to u1

    const { result } = renderHook(() => useHealthCard());
    await waitFor(() => expect(result.current.loadedLocal).toBe(true));

    expect(result.current.card).toBeNull();
  });

  it("keeps the saved copy and reports honestly when refresh fails", async () => {
    setOwnerBinding("u1");
    await getHealthCardStore().save(snapshot());
    setOnLine(true);
    fetchMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useHealthCard());
    await waitFor(() => expect(result.current.refreshError).toBe(true));

    // Saved copy still visible — never blanked by a failed refresh.
    expect(result.current.card?.profile.displayName).toBe("Asha Kumar");
    expect(result.current.syncState).toBe("needs_attention");
  });

  it("stale snapshot is labeled, not blocked", async () => {
    setOwnerBinding("u1");
    await getHealthCardStore().save(
      snapshot({ savedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString() })
    );
    fetchMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useHealthCard());
    await waitFor(() => expect(result.current.loadedLocal).toBe(true));
    expect(result.current.freshness).toBe("stale");
    expect(result.current.card).not.toBeNull(); // still usable offline
  });
});
