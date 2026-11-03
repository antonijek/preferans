// Položen telefon (korisnik 2026-11-03: „da sto i karte budu veći“): gornja linija (ko igra, talon) prelazi
// u levi pojas pored stola, a 💬 i 🏳️ ulaze u meni ☰, koji stoji sam dole desno pored karata (landscape.css).
// Elementi se premeštaju, ne dupliraju; na računaru i uspravnom telefonu sve ostaje kao ranije.
const LANDSCAPE = window.matchMedia('(max-height: 480px)');

/** Ugovor i talon: u levom pojasu na položenom telefonu, inače u gornjoj liniji (redosled ostaje isti).
 *  Poslednji štih: na položenom telefonu gore na stolu (u levom pojasu ne staje u jedan red), inače u levom panelu. */
export function placeStatusBanners() {
  const target = document.getElementById(LANDSCAPE.matches ? 'leftSidePanel' : 'statusBar');
  for (const id of ['talonBanner', 'contractBanner']) {
    const banner = document.getElementById(id);
    if (banner.parentElement !== target) target.prepend(banner);
  }
  const lastTrick = document.getElementById('lastTrickBanner');
  const trickTarget = document.getElementById(LANDSCAPE.matches ? 'tableFelt' : 'leftSidePanel');
  if (lastTrick.parentElement !== trickTarget) trickTarget.append(lastTrick);
}

// 💬 i 🏳️ kao prve stavke menija ☰ na položenom telefonu, inače u traci ispred ☰ (redosled ostaje isti).
function placeMenuButtons() {
  const chat = document.getElementById('chatToggleBtn');
  const flag = document.querySelector('.match-menu-wrap');
  if (LANDSCAPE.matches) {
    document.getElementById('gameMenuItems').prepend(chat, flag);
  } else {
    document.querySelector('.game-menu-wrap').before(chat, flag);
  }
}

/** Kraći natpis na položenom telefonu („Pozovi Bora“ umesto „Pozovi 🤖 Bora“); koji se vidi bira landscape.css. */
export function phoneShort(full, short) {
  return `<span class="text-full">${full}</span><span class="text-short">${short}</span>`;
}

/** onChange: ponovno crtanje kad se telefon okrene (levi pojas se sakriva kad je prazan). */
export function initLandscapeLayout(onChange) {
  placeMenuButtons();
  LANDSCAPE.addEventListener('change', () => {
    placeStatusBanners();
    placeMenuButtons();
    onChange();
  });
}
