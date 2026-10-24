// Ispravke AI-ja iz analize korisnikove partije #13 (2026-10-24) — ruke su
// iz te partije.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBetlSafe } from '../src/aiHandEval.ts';
import { chooseBidAction } from '../src/aiBidding.ts';
import type { Card, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));

test('betl: Bora sa D,10,9,8 herc i 10,7 pik ne licitira (ruka 32)', () => {
  const bora = hand('7♣ Q♥ 10♥ 9♥ 8♥ 10♠ 7♠ J♦ 9♦ 7♦');
  assert.equal(isBetlSafe(bora), false);
  const action = chooseBidAction({
    hand: bora, currentBid: 0, bidStartPlayer: 2 as Position, currentBidder: 2 as Position,
    passedPlayers: new Set(), playerBidLevel: 0, bids: [],
  });
  assert.equal(action.type, 'PASS');
});

test('betl: sigurne boje po korisnikovom pravilu', () => {
  for (const s of [
    '7♥', '8♥', '7♥ 8♥', '7♥ 9♥',
    '7♥ 8♥ 9♥', '7♥ 8♥ 10♥', '7♥ 8♥ J♥', '7♥ 9♥ 10♥', '7♥ 9♥ J♥',
    '7♥ 8♥ 9♥ K♥ A♥', '7♥ 9♥ 10♥ Q♥', '7♥ 9♥ J♥ Q♥ K♥ A♥',
  ]) {
    assert.equal(isBetlSafe(hand(s)), true, s);
  }
});

test('betl: nesigurne boje po korisnikovom pravilu', () => {
  for (const s of [
    '9♥', 'K♥', '8♥ 9♥', '7♥ 10♥', '7♥ K♥', '8♥ 9♥ 10♥',
    '7♥ 10♥ J♥', '7♥ 8♥ Q♥', 'Q♥ 10♥ 9♥ 8♥', '8♥ 9♥ 10♥ K♥ A♥',
  ]) {
    assert.equal(isBetlSafe(hand(s)), false, s);
  }
});
