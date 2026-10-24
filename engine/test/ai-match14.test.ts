// Ispravke AI-ja iz analize korisnikove partije #14 (2026-10-24) — ruke su
// iz te partije.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choosePlayCard } from '../src/aiDiscardPlay.ts';
import { chooseFollow } from '../src/aiFollowKontra.ts';
import type { Card, Position, Suit } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));
type Play = { player: Position; card: Card };
const trick = (...plays: [number, string][]): Play[] => plays.map(([p, c]) => ({ player: p as Position, card: hand(c)[0]! }));

function play(h: string, trump: Suit, game: string, me: number, declarer: number, current: Play[], tricks: Play[][]) {
  return choosePlayCard({
    hand: hand(h), currentTrick: current, trump, declaredGame: game as never, winnerTricks: 0,
    isDeclarer: me === declarer, myPosition: me as Position, declarer: declarer as Position, tricks,
  })!.id;
}

// ruka 8: Bora (2) igra Herc, Antonije (0) pozvao Milana (1)
const r8 = [
  trick([2, 'A♥'], [0, '7♥'], [1, 'Q♥']), trick([2, 'J♥'], [0, '9♥'], [1, '7♦']), trick([2, '10♥'], [0, 'K♥'], [1, '9♦']),
  trick([0, 'A♣'], [1, '10♣'], [2, '9♣']),
];

test('ruka 8: nosilac sa 4 aduta bez K i D ne vuce adut, igra K karo', () => {
  assert.equal(play('Q♣ 9♣ A♥ J♥ 10♥ 8♥ A♠ Q♠ K♦ Q♦', '♥', 'Herc', 2, 2, [], []), 'K♦');
});

test('ruka 8: Milan na 7 tref stavlja K (najjaci, posle njega igra nosilac), pa na 10 pik K pik', () => {
  assert.equal(play('J♣ 9♠ 10♦ J♠ K♣ K♠', '♥', 'Herc', 1, 2, trick([0, '7♣']), r8), 'K♣');
  const later = [...r8, trick([0, '7♣'], [1, 'K♣'], [2, 'Q♣']), trick([2, 'A♠'], [0, '7♠'], [1, '9♠']),
    trick([2, 'K♦'], [0, 'A♦'], [1, '10♦'])];
  assert.equal(play('J♣ J♠ K♠', '♥', 'Herc', 1, 2, trick([0, '10♠']), later), 'K♠');
});

test('ruka 12: na partnerovog K tref mala, ne as ("zasto bih uzimao taj stih kad je vec nas")', () => {
  const t1 = [trick([1, 'A♦'], [2, 'K♦'], [0, '7♦'])];
  assert.equal(play('A♣ A♥ A♠ 8♥ 9♥ 7♠ 9♣ 9♠ J♣', '♥', 'Herc', 2, 0, trick([1, 'K♣']), t1), '9♣');
});

test('ruka 16: skart karo (nosilac ga sece), ne mala uz kralja', () => {
  const t = [
    trick([2, 'K♦'], [0, '7♦'], [1, 'A♦']), trick([1, 'A♣'], [2, 'J♣'], [0, '10♣']), trick([1, 'Q♣'], [2, 'Q♦'], [0, 'K♣']),
    trick([0, '8♦'], [1, '7♣'], [2, '9♦']),
  ];
  assert.equal(play('10♥ 10♦ K♥ 7♠ K♠ J♦', '♣', 'Tref', 2, 1, trick([1, '9♣']), t), '10♦');
  assert.equal(play('7♠ K♠ J♦', '♣', 'Tref', 2, 1, trick([1, 'J♥']), t), 'J♦');
});

test('ruka 14: Bora ne dolazi sa A,K,D,8 herc i K,9,7 pik (2 rezona, samo jedan sa 2 stiha)', () => {
  assert.equal(chooseFollow({ hand: hand('8♣ A♥ K♥ Q♥ 8♥ K♠ 9♠ 7♠ 10♦ 8♦'), declaredGame: 'Karo' }), 'NE_DODJEM');
  // ruka 10: K,9,7 tref, A,K pik i D,10,9 karo — 3 rezona, dodje
  assert.equal(chooseFollow({ hand: hand('K♣ 9♣ 7♣ Q♥ 8♥ A♠ K♠ Q♦ 10♦ 9♦'), declaredGame: 'Herc' }), 'DODJEM');
});
