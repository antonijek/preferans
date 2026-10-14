// Service worker SAMO za obaveštenja (admin: "neko čeka partiju"; od
// 2026-10-14 i igrači: "tvoj potez", "neko je seo za tvoj sto", revanš).
// Registruje se sa scope-om /push/ — ne kontroliše nijednu stranicu igre i
// ništa ne kešira. Isti obrazac kao Lora (D:\lora\push-sw.js).

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* prazna ili pokvarena poruka */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Preferans', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    data: { url: d.url || '/' },
    tag: d.tag || 'preferans-igrac',
    renotify: true,
  }));
});

// dodir na obaveštenje: ako je Preferans već otvoren, samo ga prikaži
// (igrač se vraća za isti sto); inače otvori novu karticu
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', self.location.origin);
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const isGame = (u) => /^\/(preferans\.html)?$/.test(new URL(u).pathname);
    const open = wins.find((w) => new URL(w.url).pathname === target.pathname || (target.pathname === '/' && isGame(w.url)));
    if (open) return open.focus();
    return self.clients.openWindow(target.href);
  })());
});
