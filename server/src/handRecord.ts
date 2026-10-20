// Pocetne ruke sve trojice, sastavljene na kraju ruke iz stanja igre — za
// pregled partije (korisnikov zahtev 2026-10-20: "da vidis svaku ruku
// rekonstruisanu"). Engine ne pamti pocetno deljenje, a na kraju ruke ima
// sve delove: odigrane karte (stihovi), karte koje su ostale u ruci (ruka
// zavrsena pre 10. stiha, npr. niko ne dolazi) i skart nosioca. Nosilac koji
// je uzeo talon: ruka = odigrano + ostalo + skart − talon.

import type { GameState, Position } from '../../engine/dist/types.js';

export interface PlainCard {
  suit: string;
  rank: string;
}

const key = (c: PlainCard) => `${c.rank}${c.suit}`;
const plain = (c: PlainCard): PlainCard => ({ suit: c.suit, rank: c.rank });

export function initialHands(s: GameState): [PlainCard[], PlainCard[], PlainCard[]] {
  const out: [PlainCard[], PlainCard[], PlainCard[]] = [[], [], []];
  for (const p of [0, 1, 2] as Position[]) {
    const cards = new Map<string, PlainCard>();
    const add = (c: PlainCard) => cards.set(key(c), plain(c));
    for (const trick of [...s.tricks, s.currentTrick]) for (const tc of trick) if (tc.player === p) add(tc.card);
    for (const c of s.players[p]!.hand) add(c);
    if (p === s.winner && s.discard.length > 0) {
      for (const c of s.discard) add(c);
      for (const c of s.lastTalon) cards.delete(key(c));
    }
    out[p] = [...cards.values()];
  }
  return out;
}
