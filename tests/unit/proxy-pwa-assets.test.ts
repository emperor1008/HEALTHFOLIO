/**
 * Regression guard for HF-004: the auth proxy used to redirect `/sw.js` and
 * `/manifest.webmanifest` to /sign-in for signed-out visitors. The browser
 * refuses to register a service worker script behind a redirect, so the whole
 * offline layer silently never activated in production.
 *
 * Also guards the P1 cookie rename: the proxy gates on the Firebase
 * `__session` cookie (presence only), so signed-in simulations must set that
 * exact cookie name — and redirects must keep their query-string contract.
 *
 * These assertions are fast and run without a server; the real HTTP behaviour
 * is covered by tests/e2e/app-shell.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, PUBLIC_ROUTES, proxy } from "@/proxy";
import { SESSION_COOKIE } from "@/lib/firebase/session-cookie";

function pageRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
}

function locationOf(res: Response): URL {
  return new URL(res.headers.get("location") ?? "http://localhost:3000/", "http://localhost:3000");
}

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

describe("proxy gates pages on the __session cookie", () => {
  it("uses the Firebase session cookie name", () => {
    expect(SESSION_COOKIE).toBe("__session");
  });

  it("redirects a signed-out visitor to sign-in, preserving the target", async () => {
    const res = await proxy(pageRequest("/dashboard"));
    const location = locationOf(res);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("redirect")).toBe("/dashboard");
  });

  it("lets a signed-in request through — cookie presence is enough", async () => {
    const res = await proxy(pageRequest("/dashboard", `${SESSION_COOKIE}=anything`));
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets signed-out visitors reach the auth pages", async () => {
    const res = await proxy(pageRequest("/sign-in"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("bounces a signed-in visitor away from the sign-in page", async () => {
    const res = await proxy(pageRequest("/sign-in", `${SESSION_COOKIE}=anything`));
    expect(locationOf(res).pathname).toBe("/dashboard");
  });

  it("keeps API routes out of the redirect gate", async () => {
    const res = await proxy(pageRequest("/api/auth/session"));
    expect(res.headers.get("location")).toBeNull();
  });
});
