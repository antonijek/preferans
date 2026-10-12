// Service worker SAMO za obaveštenja adminu (admin panel → "Uključi
// obaveštenja"). Registruje se sa scope-om /push/ — ne kontroliše nijednu
// stranicu igre i ništa ne kešira. Korisnikov zahtev (2026-10-12), isti
// obrazac kao Lora (D:\lora\push-sw.js).

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* prazna ili pokvarena poruka */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Preferans', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    data: { url: d.url || '/' },
    tag: 'preferans-igrac',
    renotify: true,
  }));
});

// dodir na obaveštenje: otvori Preferans (ovaj worker ne kontroliše
// stranice igre, pa ne može da ih preusmeri — uvek otvara novu karticu)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(new URL(e.notification.data?.url || '/', self.location.origin).href));
});
