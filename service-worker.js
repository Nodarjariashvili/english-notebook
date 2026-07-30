var CACHE_NAME = "notebook-cache-v12";
var CACHED_FILES = [
  "./",
  "./index.html",
  "./ჩემი-ინგლისურის-რვეული.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* cache each file independently -- cache.addAll() is all-or-nothing, so
         a single failed/blocked resource would abort the whole install and
         leave an old service worker (and old cached HTML) stuck in control. */
      return Promise.all(CACHED_FILES.map(function (url) {
        return cache.add(url).catch(function (err) {
          console.error("SW install: failed to cache", url, err);
        });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; /* never touch cross-origin (Anthropic/OpenAI/Supabase/CDN) */
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
