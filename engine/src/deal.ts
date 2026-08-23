// Deljenje karata po RULES.md sekcija 2.2:
// 1. 5 karata → P1 (desno od dilera)
// 2. 5 karata → P2
// 3. 5 karata → P3
// 4. 2 karte → TALON
// 5. 5 karata → P1
// 6. 5 karata → P2
// 7. 5 karata → P3

import { makeDeck, shuffle } from './deck.js';
import { CARDS_PER_PLAYER, TALON_SIZE, TRICKS_PER_HAND } from './constants.js';
import type { Card, Position } from './types.js';

export interface DealResult {
  hands: [Card[], Card[], Card[]];
  talon: Card[];
}

export function deal(rng: () => number = Math.random): DealResult {
  const deck = shuffle(makeDeck(), rng);
  const hands: [Card[], Card[], Card[]] = [[], [], []];
  let idx = 0;

  // Prvi krug: 5 karata svakom
  for (let i = 0; i < 5; i++) {
    for (let p = 0; p < 3; p++) {
      hands[p]!.push(deck[idx++]!);
    }
  }
  // Talon: 2 karte
  const talon = [deck[idx++]!, deck[idx++]!];
  // Drugi krug: 5 karata svakom
  for (let i = 0; i < 5; i++) {
    for (let p = 0; p < 3; p++) {
      hands[p]!.push(deck[idx++]!);
    }
  }

  return { hands, talon };
}

export function validateDeal(result: DealResult): boolean {
  // Svaki igrač ima 10 karata
  for (const h of result.hands) {
    if (h.length !== CARDS_PER_PLAYER) return false;
  }
  // Talon ima 2 karte
  if (result.talon.length !== TALON_SIZE) return false;
  // Ukupno 32 karte
  const all = [...result.hands[0], ...result.hands[1], ...result.hands[2], ...result.talon];
  if (all.length !== 32) return false;
  // Sve različite
  const ids = new Set(all.map(c => c.id));
  return ids.size === 32;
}

export function totalTricksExpected(): number {
  return TRICKS_PER_HAND;
}

export { CARDS_PER_PLAYER, TALON_SIZE };
