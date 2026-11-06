// Ispravke AI-ja iz analize partije #22 (2026-11-05): Antonije (0), Milan (1), Bora (2).
// Pozicije su prepisane iz zapisa partije; karte u ruci su one koje su igracu ostale u tom trenutku.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseDeclareGame, igraAllowed } from '../src/aiBidding.ts';
import { IGRA_GAMES } from '../src/constants.ts';
import { hand, rules, search } from './positions.ts';
import type { Position18 } from './positions.ts';

// Ruka 10: Bora Tref, Antonije dosao i pozvao Milana; u 5. stihu Antonije vodi 10 karo, Milan sece 10 tref
const H10: Position18 = {
  game: 'Tref', declarer: 2, follow: ['DODJEM', 'DODJEM', null], discard: '7♦ J♠',
  hands: ['9♥ 8♣ 7♠ 10♠ Q♠', '8♥ 8♠ 10♥ 9♠ K♠', '7♣ Q♥ Q♣ J♣ A♥ A♠'],
  tricks: ['17♥ 2J♥ 0K♥', '0K♦ 18♦ 2A♦', '2K♣ 0A♣ 19♣', '0Q♦ 19♦ 2J♦'], current: '010♦ 110♣',
};

test('ruka 10: Bora nosi Milanovu 10 tref sa J tref, ne baca 7 tref ispod nje', () => {
  assert.equal(rules(H10), 'J♣');
  assert.equal(search(H10), 'J♣');
});

// Ruka 16: Antonije Tref, Milan nije dosao (igra se udvoje); Bora uzeo stih sa A karo
const H16: Position18 = {
  game: 'Tref', declarer: 0, follow: [null, 'NE_DODJEM', 'DODJEM'], discard: 'J♥ 8♦',
  hands: ['8♠ A♥ Q♥ K♦ Q♣ 10♣ 9♣', 'A♠ Q♠ J♠ 9♠ 7♠ 9♥ 8♥ 7♥ 9♦ J♣', 'K♥ 10♥ Q♦ 10♦ 7♦ 8♣ 7♣'],
  tricks: ['210♠ 0K♠', '0K♣ 2A♣', '2A♦ 0J♦'],
};

test('ruka 16: Bora posle A karo nastavlja D karo, ne otvara K herc', () => {
  assert.equal(rules(H16), 'Q♦');
  assert.equal(search(H16), 'Q♦');
});

// Ruka 22: Bora Igra-Tref, Antonije nije dosao (igra se udvoje); Bora vuce adute, Milan je ostao bez aduta
const H22: Position18 = {
  game: 'Igra-Tref', declarer: 2, follow: ['NE_DODJEM', 'DODJEM', null], talon: '8♠ 10♥',
  hands: ['A♠ Q♠ J♠ 7♠ K♥ 9♥ 9♦ 8♦ 7♦ K♣', 'K♠ 9♠ A♥ J♥ K♦ Q♦ J♦', '10♠ Q♥ 8♥ A♦ 10♦ 7♣'],
  tricks: ['2A♣ 19♣', '2Q♣ 110♣', '2J♣ 17♥'], current: '28♣',
};

test('ruka 22: Milan baca J karo, ne ostavlja suvog A herc (ni suvog K pik)', () => {
  assert.equal(rules(H22), 'J♦');
  assert.equal(search(H22), 'J♦');
});

test('ruka 18: Bora sa ♠A,K,D,J,10,9 i ♣A,K,D,10 proglasava Igra-Tref, ne Igra-Pik (i kad ne baca prvi)', () => {
  const bora = hand('A♠ K♠ Q♠ J♠ 10♠ 9♠ A♣ K♣ Q♣ 10♣');
  assert.equal(chooseDeclareGame(bora, 0, IGRA_GAMES, false), 'Igra-Tref');
  assert.equal(chooseDeclareGame(bora, 0, IGRA_GAMES, true), 'Igra-Tref');
});

test('ruka 1: Bora sa ♠K,D,J,8,7 i ♦K,D,9 ne kaze igra (4 stiha u adutu + 1 = 5, nema 6)', () => {
  assert.equal(igraAllowed(hand('K♠ Q♠ J♠ 8♠ 7♠ 8♥ K♦ Q♦ 9♦ 7♣'), false, true), false);
});
