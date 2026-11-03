// Položen telefon (korisnik 2026-11-03: „da sto i karte budu veći“): gornja linija (ko igra, talon) prelazi
// u levi pojas pored stola, a dugmad 💬 🏳️ ☰ stoje na dnu tog pojasa, tačno iznad karata (landscape.css).
// Elementi se premeštaju, ne dupliraju; na računaru i uspravnom telefonu sve ostaje kao ranije.
const LANDSCAPE = window.matchMedia('(max-height: 480px)');

/** Ugovor i talon: u levom pojasu na položenom telefonu, inače u gornjoj liniji (redosled ostaje isti). */
export function placeStatusBanners() {
  const target = document.getElementById(LANDSCAPE.matches ? 'leftSidePanel' : 'statusBar');
  for (const id of ['talonBanner', 'contractBanner']) {
    const banner = document.getElementById(id);
    if (banner.parentElement !== target) target.prepend(banner);
  }
}

/** Kraći natpis na položenom telefonu („Pozovi Bora“ umesto „Pozovi 🤖 Bora“); koji se vidi bira landscape.css. */
export function phoneShort(full, short) {
  return `<span class="text-full">${full}</span><span class="text-short">${short}</span>`;
}

// Visina reda sa kartama u --hand-h, da dugmad u levom pojasu stoje odmah iznad njega.
function trackHandHeight() {
  const panel = document.querySelector('.bottom-panel');
  if (!panel) return;
  const set = () => document.documentElement.style.setProperty('--hand-h', `${panel.offsetHeight}px`);
  new ResizeObserver(set).observe(panel);
  set();
}

/** onChange: ponovno crtanje kad se telefon okrene (levi pojas se sakriva kad je prazan). */
export function initLandscapeLayout(onChange) {
  trackHandHeight();
  LANDSCAPE.addEventListener('change', () => {
    placeStatusBanners();
    onChange();
  });
}
