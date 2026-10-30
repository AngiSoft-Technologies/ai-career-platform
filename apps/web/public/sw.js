/* Job Radar service worker: offline shell plus runtime caching.
 *
 * The data layer lives in `lib/api.ts` (localStorage read cache + outbox),
 * because API calls are cross-origin and a service worker may not intercept
 * them. This worker owns only the app shell and static assets.
 *
 * Two rules learned the hard way:
 *   1. `cache.addAll` is atomic — one 404 discards every asset, so the whole
 *      shell silently never installs. Assets are cached individually.
 *   2. Never cache a request that carries an Authorization header, and never
 *      touch `/api/auth/*`: cached authenticated responses are readable by the
 *      next account that signs in on the same browser.
 */

const VERSION = "jr-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;

const SHELL_ASSETS = [
  "/",
  "/dashboard",
  "/opportunities",
  "/matches",
  "/applications",
  "/documents",
  "/followups",
  "/profile",
  "/settings",
  "/site.webmanifest",
  "/favicon.ico",
];

const PRECACHE = [...SHELL_ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individual puts: a missing route must not discard the rest.
      await Promise.allSettled(
        PRECACHE.map(async (asset) => {
          try {
            const response = await fetch(asset, { cache: "no-store" });
            if (response.ok) await cache.put(asset, response);
          } catch {
            // Offline during install, or the route does not exist.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|ico|webp)$/.test(url.pathname)
  );
}

function isAuthPath(url) {
  return url.pathname.startsWith("/api/auth/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Mutations are never served from a cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isAuthPath(url)) return;

  // Authenticated responses must never enter Cache Storage.
  if (request.headers.get("authorization")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches
                .open(STATIC_CACHE)
                .then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/dashboard");
          if (shell) return shell;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") {
    void self.skipWaiting();
  }
});
