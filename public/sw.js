/**
 * Healthfolio service worker (Part 1).
 *
 * Caching policy — deliberately conservative for a medical app:
 *
 *  PRECACHE (cache-first):      the offline page, manifest, app icon.
 *  NAVIGATIONS (network-first): pages, with the offline page as fallback.
 *  STATIC ASSETS (stale-while-revalidate): /_next/static/*, fonts, images
 *                               in /branding — non-sensitive, versioned URLs.
 *  NEVER CACHED:                /api/*, Supabase URLs, anything with
 *                               Authorization headers, documents/extractions.
 *
 * Protected medical API responses are NEVER cached: on a shared device the
 * cache is per-origin and could expose one patient's data to the next user.
 */

const VERSION = "hf-sw-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/branding/healthfolio-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/branding/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

function isNeverCache(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/documents") ||
    url.pathname.startsWith("/extract")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache or intercept cross-origin or protected requests.
  if (url.origin !== self.location.origin) return;
  if (isNeverCache(url)) return;

  // 1. Navigations: network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response;
        })
        .catch(() =>
          caches.match(OFFLINE_URL).then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 2. Versioned static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Everything else (same-origin, GET, non-static): network only.
});
