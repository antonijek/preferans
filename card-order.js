// Redosled i slike karata — zajednicko za igru (app.js) i pregled partije
// (replay.js); izdvojeno iz app.js 2026-10-20.

export const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// Raspored ruke: tref, herc, pik, karo — unutar boje od A (najjace) do 7
export const HAND_SUIT_ORDER = ['♣', '♥', '♠', '♦'];
const SUIT_TO_FILE_LETTER = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };

export const rankValue = (r) => RANK_ORDER.indexOf(r);
export const isRed = (s) => s === '♥' || s === '♦';
export const cardImageSrc = (c) => `/icons/cards/${c.rank}${SUIT_TO_FILE_LETTER[c.suit]}.svg`;

export const sortHand = (cards) => cards.slice().sort((a, b) => {
  const suitDiff = HAND_SUIT_ORDER.indexOf(a.suit) - HAND_SUIT_ORDER.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return rankValue(b.rank) - rankValue(a.rank);
});
