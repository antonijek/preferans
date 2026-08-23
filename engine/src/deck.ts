// Špil — factory + shuffle

import { SUITS, ALL_RANKS } from './constants.js';
import { makeCard } from './cards.js';
import type { Card } from './types.js';

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of ALL_RANKS) {
      deck.push(makeCard(suit, rank));
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function isValidDeck(deck: Card[]): boolean {
  if (deck.length !== 32) return false;
  const seen = new Set<string>();
  for (const c of deck) {
    const key = `${c.rank}${c.suit}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
