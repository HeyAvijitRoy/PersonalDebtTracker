// Bump this on every deploy that changes cached assets; the activate
// handler purges any cache that doesn't match, so old shells can't linger.
const CACHE_NAME = "debt-tracker-v9";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./src/account-crypto.mjs",
  "./src/account-model.mjs",
  "./src/account-tools.mjs",
  "./src/backup.mjs",
  "./src/event-model.mjs",
  "./src/firestore-adapter.mjs",
  "./src/history.mjs",
  "./src/lock-gate.mjs",
  "./src/metadata-transport.mjs",
  "./src/money.mjs",
  "./src/observations.mjs",
  "./src/outbox.mjs",
  "./src/planning-ui.mjs",
  "./src/planning.mjs",
  "./src/preferences.mjs",
  "./src/progress-ui.mjs",
  "./src/progress.mjs",
  "./src/session-scope.mjs",
  "./src/tracking-store.mjs",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // a single missing asset must not block activation
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs. Always serve the latest deployed code;
// fall back to the cache only when offline. This prevents a stale or broken
// cached shell from trapping returning visitors on an old version.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Runtime config must never be served stale — let it go straight to network.
  if (req.url.includes("env.js")) return;

  // Cache only public application assets, never arbitrary same-origin responses,
  // configuration, backups, tests, or future financial-data endpoints.
  const assetPaths = APP_SHELL.map(asset => new URL(asset, self.registration.scope).pathname);
  if (!assetPaths.includes(new URL(req.url).pathname)) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
