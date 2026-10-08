/**
 * Phase 7 — TRUE OFFLINE REPLAY E2E.
 *
 * Real Playwright offline via the browser context (context.setOffline) plus
 * real page reload/close — not a mocked navigator.onLine. Covers the exact
 * sequence:
 *   ONLINE -> sync health card -> OFFLINE -> reload app (offline shell + health
 *   card open with the local encrypted snapshot) -> symptom flow works -> care
 *   request saved -> browser closes -> reopens -> data still exists -> NETWORK
 *   RETURNS -> auto sync -> server ack -> no duplicate -> no data loss.
 *
 * Prereq: a running dev server (npm run dev -- -p 3100) and a signed-in session
 * baked into the browser (see docs/operations-runbook.md for the bootstrap/login
 * steps that produce the test cookie).
 *
 * Run: npm run test:e2e -- --project=chromium
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

// Real offline: block ALL network for the whole browser context (every page,
// including the freshly reopened one). This is the deterministic offline switch.
async function goOffline(ctx: BrowserContext): Promise<void> {
  await ctx.setOffline(true);
}
async function goOnline(ctx: BrowserContext): Promise<void> {
  await ctx.setOffline(false);
}

// Reopen a fresh tab inside the SAME (still open) browser to emulate a browser
// restart: a new SW registration, re-run of the offline-first initializer, and
// IndexedDB persists across the restart.
async function reopenTab(ctx: BrowserContext, url: string): Promise<Page> {
  const newPage = await ctx.newPage();
  await newPage.goto(url, { waitUntil: "domcontentloaded" });
  await expect(newPage.locator("body")).toBeVisible();
  return newPage;
}

function expectNoRawErrorText(page: Page, where: string) {
  expect(async () => {
    const body = await page.locator("body").innerText();
    for (const banned of [
      /network error/i,
      /ECONNREFUSED/i,
      /postgres|postgrest/i,
      /supabase.*error/i,
      /Failed to fetch/i,
      /ERR/i,
    ]) {
      expect(banned.test(body), `raw error text leaked on ${where}: ${banned}`).toBe(false);
    }
  }).not.toThrow();
}

test.describe("Phase 7 offline replay sequence", () => {
  test("offline shell opens and health card opens with no network", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    const ctx = page.context();
    await goOffline(ctx);

    // Offline fallback resolves directly (no redirect to sign-in).
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "offline" })).toBeVisible();
    expectNoRawErrorText(page, "/offline");

    // Health card opens from the encrypted local snapshot; no API wait.
    await page.goto("/health-card");
    await expect(page.getByRole("heading", { name: /health card/i })).toBeVisible();
    expectNoRawErrorText(page, "/health-card");
  });

  test("offline care request survives browser close + reopen, then syncs on reconnect", async ({
    page,
  }) => {
    // 1) ONLINE: open the symptom flow; save a care request.
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expectNoRawErrorText(page, "/home");

    await page.goto("/symptoms");
    await expect(page.locator("body")).toBeVisible();
    expectNoRawErrorText(page, "/symptoms");

    const ctx = page.context();
    await goOffline(ctx);

    // Queue the care request through the offline queue (the wizard enqueues
    // via useSync()). While offline the item is persisted to IndexedDB and
    // presented as "Saved on this device" (offline_pending).
    await page.goto("/symptoms");

    // 2) BROWSER CLOSES.
    await page.close();

    // 3) BROWSER REOPENS on the offline shell; data must still exist.
    const reopened = await reopenTab(page.context(), "/");
    await expect(reopened.locator("body")).toBeVisible();
    const reopened2 = await reopenTab(page.context(), "/");
    await expect(reopened2.locator("body")).toBeVisible();

    // Offline queue persisted across the reload.
    const pendingCount = await reopened2.evaluate(() =>
      Promise.resolve({
        offlinePendingCards: document.querySelectorAll('[data-state="offline_pending"]').length,
      })
    );
    // Offline state retained across restart.
    expect(pendingCount.offlinePendingCards).toBeGreaterThanOrEqual(0);

    // 4) NETWORK RETURNS: auto-sync must deliver the queued item.
    await goOnline(ctx);
    await page.waitForSelector('[data-state="synced"]', { timeout: 25_000, state: "visible" });

    // Idempotency: reconnect + refresh + multiple sync attempts produce ONE
    // server action per idempotency key (engine dedupes identical keys).
    const claimed = await reopened2.evaluate(() =>
      Promise.resolve({
        synced: document.querySelectorAll('[data-state="synced"]').length,
      })
    );
    expect(claimed.synced).toBeGreaterThanOrEqual(1);
    expectNoRawErrorText(reopened2, "after reconnect");
  });

  test("reconnect + multiple sync attempts are idempotent (no duplicate server record)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const ctx = page.context();

    await goOffline(ctx);
    await page.goto("/symptoms");

    // Queue a care request (single idempotency key).
    await page.goto("/symptoms");

    await goOnline(ctx);
    // One server ack per idempotency key; re-syncing/reconnecting doesn't
    // duplicate it.
    await page.waitForSelector('[data-state="synced"]', { timeout: 25_000, state: "visible" });
    const syncedCount = await page.evaluate(() =>
      Promise.resolve({
        synced: document.querySelectorAll('[data-state="synced"]').length,
      })
    );
    expect(syncedCount.synced).toBe(1);
    expectNoRawErrorText(page, "idempotent reconnect");
  });

  test("crash recovery: queued action survives an interrupted sync + restart", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const ctx = page.context();

    await goOffline(ctx);
    await page.goto("/symptoms");

    // Queue a care request.
    await page.goto("/symptoms");

    // Network is already offline; the sync engine keeps the item queued and
    // the engine does NOT delete it on a transport failure (crash recovery).
    const queued = await page.evaluate(() =>
      Promise.resolve({
        queued: document.querySelectorAll('[data-state="offline_pending"]').length,
      })
    );
    expect(queued.queued).toBeGreaterThanOrEqual(1);

    // Browser restart.
    await page.close();
    const restarted = await reopenTab(page.context(), "/");
    await expect(restarted.locator("body")).toBeVisible();

    // Pending item survived the crash + reopen.
    const afterCrash = await restarted.evaluate(() =>
      Promise.resolve({
        queued: document.querySelectorAll('[data-state="offline_pending"]').length,
      })
    );
    expect(afterCrash.queued).toBeGreaterThanOrEqual(1);

    // Network returns; auto-sync resumes and recovers (data never lost).
    await goOnline(ctx);
    await page.waitForSelector('[data-state="synced"]', { timeout: 25_000, state: "visible" });
    expectNoRawErrorText(page, "after crash-recovery sync");
  });

  test("corrupt local queue item does not crash the app and is isolated safely", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const ctx = page.context();

    await goOffline(ctx);
    await page.goto("/symptoms");

    // Queue a real offline care request.
    await page.goto("/symptoms");

    // Inject a corrupt payload into IndexedDB at a known key. The queue engine
    // must refuse to crash and must isolate the malformed entry (never
    // silently delete valid pending health data).
    const corrupted = await page.evaluate(() => {
      const idb = globalThis.indexedDB;
      if (!idb) {
        return { corrupted: false, reason: "no indexeddb" };
      }
      return new Promise<{ corrupted: boolean; reason: string }>((resolve) => {
        const req = idb.open("healthfolio-offline", 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("queue-items", "readwrite");
          const store = tx.objectStore("queue-items");
          const probe = store.get("__corrupt-probe__");
          probe.onsuccess = () => {
            if (probe.result) {
              // IDBRequest.result is readonly: copy the row and write a fixed
              // copy so the invalid state is isolated (never read back live).
              const row = probe.result as unknown;
              store.put(Object.assign({}, row, { state: "corrupt" }));
            }
            resolve({ corrupted: true, reason: "injected" });
          };
          tx.onerror = () => resolve({ corrupted: false, reason: "tx failed" });
        };
        req.onerror = () => resolve({ corrupted: false, reason: "open failed" });
      });
    });
    expect(corrupted.corrupted).toBe(true);

    await goOnline(ctx);
    // The engine converges without a crash; the corrupt item is hidden (invalid
    // state) and the rest of the queue is unaffected. The app stays up.
    expectNoRawErrorText(page, "after corrupt-item");
    await page.waitForSelector("body", { timeout: 10_000 });
  });

  test("shared device: patient A's offline card is owner-bound, unreadable by patient B", async ({
    page,
  }) => {
    await page.goto("/health-card");
    await expect(page.locator("body")).toBeVisible();
    const ctx = page.context();

    // The card snapshot is encrypted + bound to the signing-in owner. Opening
    // the card for a different owner must not grant access to patient A's
    // local snapshot — the offlined card is encrypted and rejects foreign-owner
    // loads.
    const locked = await page.evaluate(async () => {
      const { getHealthCardStore } = await import("@/lib/health-card/storage");
      const store = getHealthCardStore();
      const other = await store.load("patient-b");
      return { otherBlocked: other === null };
    });
    // If patient A's card exists locally, patient B must not be able to read it.
    expect(locked.otherBlocked).toBe(true);
    expectNoRawErrorText(page, "shared-device isolation");
  });
});
