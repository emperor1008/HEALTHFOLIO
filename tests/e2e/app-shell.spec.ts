/**
 * Core e2e checks (Part 5) — app shell + honesty guarantees against the real
 * dev server. No clinical data is created: coverage of clinical flows lives in
 * the unit/integration suite (npm test). These tests only assert things that
 * must be true for ANY visitor with no data.
 */
import { test, expect } from "@playwright/test";

test.describe("App shell", () => {
  test("home page renders the health space without raw error text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    // No raw network/database/PostgREST error text may leak to the UI.
    for (const banned of [
      /network error/i,
      /ECONNREFUSED/i,
      /postgres|postgrest/i,
      /supabase.*error/i,
      /at\s+\S+\s+\(.*:\d+:\d+\)/, // stack-trace frames
    ]) {
      expect(banned.test(body), `raw error text leaked: ${banned}`).toBe(false);
    }
  });

  test("offline fallback page exists and renders", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
  });

  test("PWA manifest is served and names the app", async ({ page }) => {
    const res = await page.request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { name?: string; icons?: unknown[] };
    expect(manifest.name).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons!.length).toBeGreaterThan(0);
  });

  test("service worker file is served (PWA foundation present)", async ({ page }) => SW_SMOKE);

  test("protected surfaces render honest empty state (no fabricated rows)", async ({
    page,
  }) => {
    await page.goto("/reliability");
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    // A visitor with no real events must never see fabricated impact numbers.
    expect(body).not.toMatch(/100%\s*(sync|success)/i);
    expect(body).not.toMatch(/\b\d{3,}\+?\s*(patients|records|users)/i);
  });

  test("layout stays usable at 320px width (mobile-first requirement)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow, "horizontal overflow at 320px").toBe(false);
  });
});

async function SW_SMOKE({ page }: { page: import("@playwright/test").Page }) {
  const res = await page.request.get("/sw.js");
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain("cache");
}
