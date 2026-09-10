// Service worker za PWA instalaciju/offline. Bump CACHE_NAME verziju kad se
// menja lista fajlova ispod (npr. nov fajl u engine/dist/) da stari klijenti
// dobiju svez keš umesto da ostanu zaglavljeni na stara verziju zauvek.
// BAG (uzivo prijavljen 2026-09-10, "MATCH_OVER katastrofa" — klijent je
// prikazivao davno zastarelu verziju koda uprkos vise deploy-eva i uprkos
// Cache-Control:no-cache HTTP zaglavlju): ta HTTP zaglavlja NE diraju vec
// INSTALIRAN service worker — SW proverava sopstveni fajl za izmene retko i
// nezavisno od servera, pa je ostajao "zaglavljen" na v5 logici (ukljucujuci
// eventualni mrezni hiccup -> cache.match() fallback na STARI keš ispod te
// verzije) nedeljama uprkos dosledno svezim HTTP odgovorima. JEDINI pouzdan
// nacin da se stari klijenti odmah prebace: promeniti SADRZAJ ovog fajla
// (bump verzije), sto tera browser da primeti razliku i instalira NOVI SW.
// UBUDUCE: bump-ovati OVDE pri SVAKOM deploy-u koji dira app.js/preferans.html.
const CACHE_NAME = 'preferans-v6';
const SHELL_FILES = [
  '/',
  '/preferans.html',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/engine/dist/game.js',
  '/engine/dist/types.js',
  '/engine/dist/constants.js',
  '/engine/dist/cards.js',
  '/engine/dist/deck.js',
  '/engine/dist/deal.js',
  '/engine/dist/trick.js',
  '/engine/dist/scoring.js',
  '/engine/dist/refe.js',
  '/engine/dist/ai.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Network-first (ne cache-first) za app shell — ovo je aktivno razvijana
// app (cesti deploy-evi), pa online korisnik uvek treba najsvezije, ne
// keširanu verziju; keš je SAMO fallback kad mreze nema. API (/api/*) i
// Socket.IO (/socket.io/*) MORAJU uvek ici na mrezu bez presretanja uopste
// (online mod je uzivo/real-time). Sve ostalo (Google Fonts, itd.) prolazi
// normalno kroz mrezu, van ovog service worker-a — offline podrska je
// namerno samo za lokalne (3ai/1v2/3human) modove koji ne zahtevaju server.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  if (!SHELL_FILES.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
