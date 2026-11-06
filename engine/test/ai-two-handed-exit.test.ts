// Udvoje (drugi pratilac nije dosao), pratilac vodi prvi, a sve boje cekaju nosioca (K,10 / makaze / dama bez J).
// Korisnikovi odgovori 2026-11-06 na tri ruke: dama treca pre makaza, makaze kecom pre kralja.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twoHandedQueenSuit } from '../src/aiLeads.ts';
import { hand, rules, search } from './positions.ts';
import type { Position18 } from './positions.ts';

const deal = (mine: string, declarer: string, other: string): Position18 => ({
  game: 'Pik', declarer: 0, follow: [null, 'NE_DODJEM', 'DODJEM'], discard: '7♥ 9♥', leader: 2,
  hands: [declarer, other, mine], tricks: [],
});

const QUEEN = deal(
  '9♠ 7♠ K♥ 10♥ A♦ Q♦ 7♦ Q♣ 10♣ 8♣',
  'A♠ K♠ Q♠ J♠ 10♠ A♥ Q♥ K♦ A♣ K♣',
  '8♠ J♥ 8♥ J♦ 10♦ 9♦ 8♦ J♣ 9♣ 7♣',
);
const ACE_FOURTH = deal(
  '9♠ 8♠ 7♠ K♥ 10♥ 8♥ A♦ Q♦ 8♦ 7♦',
  'A♠ K♠ Q♠ J♠ 10♠ A♥ Q♥ A♣ K♣ Q♣',
  'J♥ K♦ J♦ 10♦ 9♦ J♣ 10♣ 9♣ 8♣ 7♣',
);
const ACE_THIRD = deal(
  '10♠ 9♠ 8♠ 7♠ K♥ 10♥ 8♥ A♦ Q♦ 7♦',
  'A♠ K♠ Q♠ J♠ A♥ Q♥ A♣ K♣ Q♣ J♣',
  'J♥ K♦ J♦ 10♦ 9♦ 8♦ 10♣ 9♣ 8♣ 7♣',
);

test('udvoje: ♥K,10 ♦A,D,7 ♣D,10,8 — izlazi D tref, ne A karo', () => {
  assert.equal(rules(QUEEN), 'Q♣');
  assert.equal(search(QUEEN), 'Q♣');
});

test('udvoje: ♥K,10,8 ♦A,D,8,7 — izlazi A karo, ne K herc', () => {
  assert.equal(rules(ACE_FOURTH), 'A♦');
  assert.equal(search(ACE_FOURTH, 100), 'A♦');
});

test('udvoje: ♥K,10,8 ♦A,D,7 (makaze trece) — izlazi A karo, ne K herc', () => {
  assert.equal(rules(ACE_THIRD), 'A♦');
  assert.equal(search(ACE_THIRD, 100), 'A♦');
});

test('dama druga (D,10) i dama sa J nisu "dama treca"', () => {
  assert.equal(twoHandedQueenSuit(hand('Q♣ 10♣ K♥ 10♥'), '♠'), null);
  assert.equal(twoHandedQueenSuit(hand('Q♣ J♣ 8♣ K♥ 10♥'), '♠'), null);
  assert.equal(twoHandedQueenSuit(hand('Q♣ 10♣ 8♣ Q♠ 9♠ 8♠'), '♠'), '♣');
});
