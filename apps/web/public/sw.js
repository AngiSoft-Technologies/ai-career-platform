/* Job Radar service worker: offline shell, cached reads, queued background sync. */

const VERSION = "jr-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const WRITE_QUEUE = "jr-write-queue";

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
  "/manifest.webmanifest",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/v1/") || url.pathname.startsWith("/api/v1/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|ico|webp)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ??
              new Response(
                JSON.stringify({ error: "offline", offline: true }),
                { status: 503, headers: { "Content-Type": "application/json" } },
              ),
          ),
        ),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.mode === "navigate") {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached ?? caches.match("/dashboard"),
        ),
      ),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "jr-write-queue") {
    event.waitUntil(flushWriteQueue());
  }
});

async function flushWriteQueue() {
  const cache = await caches.open(WRITE_QUEUE);
  const requests = await cache.keys();
  for (const request of requests) {
    try {
      const response = await fetch(request.clone());
      if (response.ok) await cache.delete(request);
    } catch {
      break;
    }
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") {
    void self.skipWaiting();
  }
});
