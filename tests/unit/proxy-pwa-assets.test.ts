/**
 * Regression guard for HF-004: the auth proxy used to redirect `/sw.js` and
 * `/manifest.webmanifest` to /sign-in for signed-out visitors. The browser
 * refuses to register a service worker script behind a redirect, so the whole
 * offline layer silently never activated in production.
 *
 * These assertions are fast and run without a server; the real HTTP behaviour
 * is covered by tests/e2e/app-shell.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { config, PUBLIC_ROUTES } from "@/proxy";

describe("proxy keeps PWA assets reachable without a session", () => {
  const matcher = config.matcher.join(" ");

  it("does not run for the service worker script", () => {
    expect(matcher).toContain("sw.js");
  });

  it("does not run for the PWA manifest", () => {
    expect(matcher).toContain("manifest.webmanifest");
  });

  it("does not run for icons and static image assets", () => {
    expect(matcher).toMatch(/svg\|png/);
    expect(matcher).toContain("ico");
  });

  it("treats the offline fallback page as public", () => {
    expect(PUBLIC_ROUTES).toContain("/offline");
  });
});
