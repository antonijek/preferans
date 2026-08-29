// PREFERANS Service Worker — cache strategija
const CACHE_NAME = 'preferans-v4';
const ESSENTIAL = [
  './',
  './preferans.html',
  './app.js',
  './manifest.json',
  './icon.svg',
  './engine/dist/game.js',
  './engine/dist/ai.js',
  './engine/dist/constants.js',
  './engine/dist/cards.js',
  './engine/dist/deal.js',
  './engine/dist/scoring.js',
  './engine/dist/trick.js',
  './engine/dist/deck.js',
  './engine/dist/bidding.js',
  './engine/dist/contracts.js',
  './engine/dist/refe.js',
  './engine/dist/types.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ESSENTIAL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Network-first, fallback na cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Keširaj uspešne odgovore
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});