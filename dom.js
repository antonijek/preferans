// Zajednicke DOM pomocne funkcije za app.js i league-ui.js (odvojeno iz
// app.js 2026-10-20, da novi moduli ne kopiraju iste helpere).

export const $ = (id) => document.getElementById(id);

export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// Online seatDisplayName() vraca korisnikov registrovani email — nepouzdan
// unos. Svaki string koji se sa njim gradi pa ubacuje u innerHTML (el()
// helper, bid log) MORA proci kroz ovo, inace je otvoren XSS (neko se
// registruje sa "<img src=x onerror=...>" kao email).
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Viber deljenje (viber://) postoji samo na telefonu
export const IS_PHONE_UA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
