// Izgled karata, bira igrač dugmetom 🎴 i pamti se na uređaju: ilustrovane francuske (2026-09-26), tekstualne
// (neki su navikli na stare) i mađarice (2026-11-04, kao u Lori; tražio igrač Miodrag: „za nas koji smo navikli
// sa njima da igramo“). Igra je ista, menjaju se samo slike. Mađarice: icons/cards-hu iz Lore (list = pik,
// srce = herc, bundeva = karo, žir = tref; dolnjak = J, gornjak = Q).
import { cardImageSrc, suitFileLetter } from './card-order.js';

const STYLES = ['illustrated', 'hu', 'text'];
const STYLE_LABEL = {
  illustrated: 'Karte: francuske',
  hu: 'Karte: mađarice (list, srce, bundeva, žir)',
  text: 'Karte: tekstualne',
};

export function getCardStyle() {
  try {
    const s = localStorage.getItem('cardStyle');
    return STYLES.includes(s) ? s : 'illustrated';
  } catch {
    return 'illustrated';
  }
}

/** Sledeći izgled (francuske → mađarice → tekstualne → francuske); vraća natpis za obaveštenje. */
export function nextCardStyle() {
  const next = STYLES[(STYLES.indexOf(getCardStyle()) + 1) % STYLES.length];
  try {
    localStorage.setItem('cardStyle', next);
  } catch (err) {
    console.warn('Izgled karata nije zapamćen:', err);
  }
  return STYLE_LABEL[next];
}

export function cardFaceSrc(c) {
  return getCardStyle() === 'hu' ? `/icons/cards-hu/${c.rank}${suitFileLetter(c.suit)}.webp` : cardImageSrc(c);
}

export function cardBackSrc() {
  const style = getCardStyle();
  if (style === 'hu') return '/icons/cards-hu/back.webp';
  return style === 'text' ? '/icons/cards/back-blue.svg' : '/icons/cards/back-red.svg';
}
