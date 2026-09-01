// ── service-worker.js ───────────────────────────────────────────
// Cache minimale per uso offline-friendly, MA network-first per i
// file che cambiano spesso durante lo sviluppo (JS/HTML/CSS): niente
// più "il sito non si aggiorna mai" dopo un deploy.
//
// Incrementa CACHE_VERSION ad ogni release per forzare la pulizia
// della cache vecchia sui dispositivi degli utenti.

const CACHE_VERSION = 'grugofy-v2';

// Percorsi RELATIVI alla posizione del service worker: funzionano sia
// se il sito è servito da /, /Jukebox/, /Grugofy/ o qualsiasi altro
// path di GitHub Pages, senza dover hardcodare il nome del repo.
const PRECACHE_FILES = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
];

/* ── Install: precache dei file statici essenziali ───────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_FILES))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: elimina tutte le cache di versioni precedenti ─────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first per JS/HTML (sempre aggiornati), ────────
   cache-first per il resto (immagini, font, ecc. se aggiunti in futuro) */
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const isCodeFile = url.endsWith('.js') || url.endsWith('.html') || url.endsWith('.css') || url.endsWith('/');

  if (isCodeFile) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Aggiorna la cache in background con la versione fresca
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // offline: fallback alla cache
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
