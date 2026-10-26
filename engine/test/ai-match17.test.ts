// Ispravke AI-ja iz analize korisnikove partije #17 (2026-10-26).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIgraWorthy } from '../src/aiHandEval.ts';
import { chooseBidAction, chooseDeclareGame } from '../src/aiBidding.ts';
import { IGRA_GAMES } from '../src/constants.ts';
import type { Card, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));
const SIDE = 'A♠ K♠ Q♠';

test('igra: Milan sa karo K,D,10,8 i pik A,K,D ne kaze igra kad ne baca prvi (ruka 5)', () => {
  const milan = hand(`9♣ 10♥ 9♥ ${SIDE} K♦ Q♦ 10♦ 8♦`);
  assert.equal(isIgraWorthy(milan, false), false);
  const action = chooseBidAction({
    hand: milan, currentBid: 0, bidStartPlayer: 0 as Position, currentBidder: 1 as Position,
    passedPlayers: new Set([0 as Position]), playerBidLevel: 0, bids: [{ player: 0 as Position, type: 'pass' }],
  });
  assert.notEqual(action.type, 'IGRA');
});

test('igra: 4 aduta po korisnikovim odgovorima (pik A,K,D uz svaki karo)', () => {
  const kdj10 = hand(`9♣ 10♥ 9♥ ${SIDE} K♦ Q♦ J♦ 10♦`);
  assert.equal(isIgraWorthy(kdj10, true), true, 'K,D,J,10 kad nosilac prvi baca');
  assert.equal(isIgraWorthy(kdj10, false), false, 'K,D,J,10 kad prvi baca pratilac');
  assert.equal(chooseDeclareGame(kdj10, 0, IGRA_GAMES, true), 'Igra-Karo');
  const aq108 = hand(`9♣ 10♥ 9♥ ${SIDE} A♦ Q♦ 10♦ 8♦`);
  assert.equal(isIgraWorthy(aq108, true), false, 'A,D,10,8: los polaz');
  assert.equal(isIgraWorthy(aq108, false), false);
  for (const [name, s] of [
    ['K,D,10,8,7', `9♣ 10♥ ${SIDE} K♦ Q♦ 10♦ 8♦ 7♦`],
    ['A,K,10,8', `9♣ 10♥ 9♥ ${SIDE} A♦ K♦ 10♦ 8♦`],
  ]) {
    assert.equal(isIgraWorthy(hand(s), true), true, `${name} sigurna igra`);
    assert.equal(isIgraWorthy(hand(s), false), true, `${name} sigurna igra`);
  }
});
