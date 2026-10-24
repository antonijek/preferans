// Ispravke AI-ja iz korisnikove partije #15 (2026-10-24) — ruke su iz te partije.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseDeclareGame } from '../src/aiBidding.ts';
import { choosePlayCard } from '../src/aiDiscardPlay.ts';
import { chooseFollow } from '../src/aiFollowKontra.ts';
import { IGRA_GAMES } from '../src/constants.ts';
import type { Card, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));
type Play = { player: Position; card: Card };
const trick = (...plays: [number, string][]): Play[] => plays.map(([p, c]) => ({ player: p as Position, card: hand(c)[0]! }));

test('ruka 11: herc A,K,D,J,8 (siguran i vredniji), ne karo A,J,10,7', () => {
  assert.equal(chooseDeclareGame(hand('Q♣ A♥ K♥ Q♥ J♥ 8♥ A♦ J♦ 10♦ 7♦'), 2), 'Herc');
});

test('ruka 12: Igra-Sans sa 6 sigurnih iz ruke, ne Igra-Herc', () => {
  assert.equal(chooseDeclareGame(hand('A♣ A♥ K♥ 10♥ 7♥ A♠ K♠ 8♠ A♦ 9♦'), 0, IGRA_GAMES), 'Igra-Sans');
});

test('ruka 13: Milan dolazi sa K,10,7 herc, A,J,10 pik i K,J,10,9 karo (3 rezona)', () => {
  assert.equal(chooseFollow({ hand: hand('K♥ 10♥ 7♥ A♠ J♠ 10♠ K♦ J♦ 10♦ 9♦'), declaredGame: 'Tref' }), 'DODJEM');
  // Bora sa trecim K aduta: "zamalo" — ne dolazi
  assert.equal(chooseFollow({ hand: hand('K♣ 9♣ 7♣ Q♥ J♥ 8♥ K♠ Q♠ Q♦ 7♦'), declaredGame: 'Tref' }), 'NE_DODJEM');
});

test('ruka 11 (karo): kad aduta vise nema, nosilac prvo uzima svoju D herc', () => {
  const t = [
    trick([0, '10♠'], [1, '7♦'], [2, '9♠']), trick([1, 'A♦'], [2, '9♦'], [0, '8♦']), trick([1, 'A♥'], [2, '7♥'], [0, '9♥']),
    trick([1, 'K♥'], [2, 'Q♠'], [0, '10♥']), trick([1, '8♥'], [2, '7♣'], [0, 'Q♦']), trick([0, 'K♦'], [1, '10♦'], [2, '10♣']),
    trick([0, '7♠'], [1, 'J♦'], [2, 'K♠']), trick([1, 'J♥'], [2, 'J♣'], [0, '8♣']),
  ];
  const c = choosePlayCard({
    hand: hand('Q♣ Q♥'), currentTrick: [], trump: '♦', declaredGame: 'Karo', winnerTricks: 6,
    isDeclarer: true, myPosition: 1 as Position, declarer: 1 as Position, tricks: t,
  });
  assert.equal(c!.id, 'Q♥');
});

test('4 aduta bez K i D: ne krece iz aduta, ali poslednji adut vuce kad moze', () => {
  // ostao je jos samo K herc kod protivnika, a nosilac ima A i 8
  const t = [trick([0, 'J♥'], [1, 'Q♥'], [2, '7♥']), trick([0, '10♥'], [1, '9♥'], [2, '8♣'])];
  const c = choosePlayCard({
    hand: hand('A♥ 8♥ K♦ Q♦ A♠ 9♠ 7♣ 9♣'), currentTrick: [], trump: '♥', declaredGame: 'Herc', winnerTricks: 2,
    isDeclarer: true, myPosition: 0 as Position, declarer: 0 as Position, tricks: t,
  });
  assert.equal(c!.id, 'A♥');
});
