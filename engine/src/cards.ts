// Operacije nad kartama — čiste funkcije

import { RANK_VALUE, SUITS, RANKS } from './constants.js';
import type { Card, Suit, Rank } from './types.js';

export function makeCard(suit: Suit, rank: Rank): Card {
  return { id: `${rank}${suit}`, suit, rank };
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function cardById(id: string): Card | null {
  const match = id.match(/^(7|8|9|10|J|Q|K|A)([♠♥♦♣])$/);
  if (!match) return null;
  return makeCard(match[2] as Suit, match[1] as Rank);
}

export function compareRank(a: Card, b: Card): number {
  return RANK_VALUE[a.rank]! - RANK_VALUE[b.rank]!;
}

export function compareSuitThenRank(a: Card, b: Card): number {
  if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  return compareRank(a, b);
}

// U adutskoj igri: viši rang pobjeđuje unutar iste boje ili aduta
// Van aduta: samo rang iste boje
export function cardCompare(a: Card, b: Card, trump: Suit | null, leadSuit: Suit): number {
  if (trump !== null) {
    if (a.suit === trump && b.suit !== trump) return 1;
    if (b.suit === trump && a.suit !== trump) return -1;
    if (a.suit === trump && b.suit === trump) return compareRank(a, b);
    if (a.suit === leadSuit && b.suit === leadSuit) return compareRank(a, b);
    return 0;
  }
  if (a.suit === leadSuit && b.suit === leadSuit) return compareRank(a, b);
  return 0;
}

// Vrednost karte za AI heuristike — adut ima prioritet
export function cardValue(c: Card, trump: Suit | null): number {
  if (trump !== null && c.suit === trump) return 100 + RANK_VALUE[c.rank]!;
  return RANK_VALUE[c.rank]!;
}

export function cardToString(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export function suitOf(c: Card): Suit {
  return c.suit;
}

export function isRedSuit(s: Suit): boolean {
  return s === '♥' || s === '♦';
}

export const ALL_RANKS: readonly Rank[] = RANKS;
