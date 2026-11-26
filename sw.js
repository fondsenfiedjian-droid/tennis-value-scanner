const CACHE_NAME = "tennis-value-static-v144";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg?v=5", "./pfe.js", "./human-factor.js", "./edition-runtime.js"];

const ARCHIVE_ASSETS = self.location.hostname === "deploy-preview-172--tennis-value-scanner-developer.netlify.app"
  ? ["historical-archive.js", "archive-db.mjs", "archive-csv.mjs", "archive-zip.mjs", "archive-pipeline.mjs", "archive-worker.mjs"]
    .map(name => "/developer/" + name)
  : [];
const ACTIVE_CACHE = ARCHIVE_ASSETS.length ? "tennis-value-static-v145-archive-preview" : CACHE_NAME;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(ACTIVE_CACHE)
      .then(cache => cache.addAll([...APP_SHELL, ...ARCHIVE_ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("tennis-value-static-") && key !== ACTIVE_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept Developer Edition paths from the root Production worker.
  if (url.pathname.startsWith("/developer/") && !ARCHIVE_ASSETS.includes(url.pathname)) return;

  // Never cache API requests or non-GET requests.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ACTIVE_CACHE).then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then(cached => cached || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(ACTIVE_CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
