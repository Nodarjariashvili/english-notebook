var CACHE_NAME = "notebook-cache-v30";
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

/* ---------- quiz push notifications ----------
   The send-quiz-push Edge Function sends { title, body, url }. Tapping the
   notification brings the app to the front on its daily quiz: an already
   open window is told to switch to the quiz, otherwise a new one is opened
   at the #quiz address. */
self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "ინგლისურის ტესტი", {
      body: data.body || "ტესტი გელოდება.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "daily-quiz",
      data: { url: data.url || "./index.html#quiz" }
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = new URL((event.notification.data && event.notification.data.url) || "./index.html#quiz", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      if (windows.length) {
        windows[0].postMessage({ type: "open-quiz" });
        return windows[0].focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
