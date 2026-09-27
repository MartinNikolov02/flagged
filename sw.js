// Bump this version string any time you change any cached file, so
// visitors actually get the new version instead of a stale cached copy.
const CACHE_NAME = "flagged-cache-v5";

const PRECACHE_URLS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/countries.js",
  "js/firebase-config.js",
  "js/multiplayer.js",
  "js/quiz-ui.js",
  "js/singleplayer.js",
  "js/utils.js",
  "assets/flagged-logo.png",
  "assets/world-bg-desktop.jpg",
  "assets/world-bg-mobile.jpg",
  "assets/bg-music.mp3",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-192-maskable.png",
  "assets/icon-512-maskable.png",
  "manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Cache-first for same-origin files (your game's own assets), so the game
// still loads offline. Anything cross-origin (Firebase, Google Fonts, the
// flag-icons CDN) is left alone and goes straight to the network, since
// caching those isn't reliable and multiplayer needs a live connection
// anyway.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
