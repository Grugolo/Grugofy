const CACHE = "grugofy-v1";

const FILES = [
  "/Jukebox/",
  "/Jukebox",
  "/Jukebox/style.css",
  "/Jukebox/js/main.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});


