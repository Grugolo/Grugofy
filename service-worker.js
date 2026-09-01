const CACHE = "grugofy-v1";

const FILES = [
  "/Grugofy/",
  "/Grugofy",
  "/Grugofy/style.css",
  "/Grugofy/js/main.js"
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


