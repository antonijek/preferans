// Ispravke AI-ja iz korisnikove analize partije #21 (2026-11-02): Antonije (0), Milan (1), Bora (2).
// Pozicije su prepisane iz zapisa partije; karte u ruci su one koje su igracu ostale u tom trenutku.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseFollow } from '../src/aiFollowKontra.ts';
import { estimatedMaxLevel } from '../src/aiHandEval.ts';
import { hand, rules, search } from './positions.ts';
import type { Position18 } from './positions.ts';

test('ruka 9: Milan sa A,D tref (2 sigurna) i K pik dolazi na Tref', () => {
  assert.equal(chooseFollow({ hand: hand('A♣ Q♣ Q♥ J♥ K♠ J♠ 8♠ J♦ 10♦ 7♦'), declaredGame: 'Tref' }), 'DODJEM');
});

test('ruka 11: Milan sa 2 asa i J,10,8 karo uz singl tref dolazi na Karo', () => {
  assert.equal(chooseFollow({ hand: hand('Q♣ A♥ 10♥ 9♥ A♠ 10♠ 7♠ J♦ 10♦ 8♦'), declaredGame: 'Karo' }), 'DODJEM');
});

test('ruke 23 i 24: A,K u jednoj boji je dosta za dolazak na Sans', () => {
  assert.equal(chooseFollow({ hand: hand('10♣ 8♣ 7♣ K♥ J♠ 9♠ A♦ K♦ 9♦ 8♦'), declaredGame: 'Sans' }), 'DODJEM');
  assert.equal(chooseFollow({ hand: hand('Q♣ J♣ A♥ K♥ 7♥ Q♠ 10♠ 8♠ Q♦ 8♦'), declaredGame: 'Sans' }), 'DODJEM');
});

// Ruka 22: Bora Herc, Antonije dosao i pozvao Milana; posle 4. stiha Milanu je ostao suv A herc
const H22: Position18 = {
  game: 'Herc', declarer: 2, follow: ['DODJEM', 'DODJEM', null], discard: '9♣ J♠',
  hands: ['A♣ Q♣ 8♣ J♥ 10♠ K♦', 'A♥ K♠ Q♠ J♣ 10♣ 7♣', 'K♣ K♥ Q♥ J♦ 9♦ 7♦'],
  tricks: ['0A♠ 17♠ 29♥', '2A♦ 08♦ 17♥', '19♠ 210♥ 08♠', '2Q♦ 010♦ 18♥'],
};

test('ruka 22: Milan igra poslednji adut A herc, ne D pik', () => {
  assert.equal(rules(H22), 'A♥');
  assert.equal(search(H22), 'A♥');
});

// Ruka 2: Antonije Herc, Milan dosao i pozvao Boru; posle 7. stiha Milanu je ostao suv A herc
const H2: Position18 = {
  game: 'Herc', declarer: 0, follow: [null, 'DODJEM', 'DODJEM'], discard: '9♣ Q♣',
  hands: ['A♣ Q♥ J♥', 'K♣ J♣ A♥', '10♣ 8♣ Q♦'],
  tricks: ['2K♦ 0A♦ 17♦', '0A♠ 18♠ 2K♠', '010♥ 1K♥ 29♥', '1J♦ 28♦ 08♥', '0Q♠ 19♠ 29♦', '0J♠ 110♠ 210♦', '07♠ 17♥ 27♣'],
};

test('ruka 2: Milan igra poslednji adut A herc, ne K tref', () => {
  assert.equal(rules(H2), 'A♥');
  assert.equal(search(H2), 'A♥');
});

// Ruka 7: Milan Igra-Pik vodi 9 tref; Bora (A,7 tref) je drugi, posle njega Antonije sa D tref
const H7: Position18 = {
  game: 'Igra-Pik', declarer: 1, follow: ['DODJEM', null, 'DODJEM'], talon: '8♣ K♦',
  hands: ['Q♣ K♥ 10♥ 9♥ 8♥ 7♥ 10♠ 8♠ 8♦ 7♦', 'K♣ J♣ 10♣ K♠ Q♠ J♠ 7♠ A♦ 9♦', 'A♣ 7♣ A♥ Q♥ J♥ A♠ 9♠ Q♦ J♦ 10♦'],
  tricks: [], current: '19♣',
};

test('ruka 7: Bora na 9 tref ne stavlja asa, nego 7 tref', () => {
  assert.equal(rules(H7), '7♣');
  assert.equal(search(H7), '7♣');
});

// Ruka 36: Bora Igra-Karo, igraju udvoje (Milan dosao); Milan uzeo A karo pa K herc
const H36: Position18 = {
  game: 'Igra-Karo', declarer: 2, follow: ['NE_DODJEM', 'DODJEM', null], talon: 'J♥ A♣',
  hands: ['Q♣ 9♣ 7♣ A♥ 10♥ 9♥ 7♥ 10♠ 7♠ 9♦', 'K♣ J♣ 10♣ Q♥ Q♠ J♠ 9♠ 7♦', '8♣ A♠ K♠ 8♠ Q♦ J♦ 10♦ 8♦'],
  tricks: ['2K♦ 1A♦', '1K♥ 28♥'],
};

test('ruka 36: posle K herc Milan nastavlja herc (D), ne otvara 9 pik', () => {
  assert.equal(rules(H36), 'Q♥');
  assert.equal(search(H36), 'Q♥');
});

// Ruka 17: Bora Igra-Herc protiv Antonija; Antonije vise nema adut, Bori su ostali 8 herc i A,D tref
const H17: Position18 = {
  game: 'Igra-Herc', declarer: 2, follow: ['DODJEM', 'NE_DODJEM', null], talon: '9♣ A♦',
  hands: ['Q♦ 10♦ 8♦', 'K♣ 10♣ 7♣ 9♥ K♠ 10♠ K♦ J♦ 9♦ 7♦', '8♥ A♣ Q♣'],
  tricks: ['2K♥ 0A♥', '0A♠ 27♠', '0Q♠ 29♠', '0J♠ 27♥', '2Q♥ 08♠', '2J♥ 08♣', '210♥ 0J♣'],
};

test('ruka 17: Bora prvo igra adut, pa tek onda A tref', () => {
  assert.equal(rules(H17), '8♥');
  assert.equal(search(H17), '8♥');
});

test('ruka 21: tref A,D,J,10 i karo D,9,8,7 — do Trefa samo kad prvi baca kartu', () => {
  const milan = hand('A♣ Q♣ J♣ 10♣ J♥ 7♠ Q♦ 9♦ 8♦ 7♦');
  assert.equal(estimatedMaxLevel(milan, true), 5);
  assert.ok(estimatedMaxLevel(milan, false) < 5);
});

// Ruka 19: Milan Igra-Tref protiv Antonija; posle 3 aduta Antonije nema adut, Milan ima 9,7 tref, A,7 pik, D,9,7 herc
const H19: Position18 = {
  game: 'Igra-Tref', declarer: 1, follow: ['DODJEM', null, 'NE_DODJEM'], talon: 'Q♦ J♦',
  hands: ['A♥ K♥ J♥ K♠ 10♠ A♦ 9♦', '9♣ 7♣ Q♥ 9♥ 7♥ A♠ 7♠', '10♣ 10♥ Q♠ J♠ 9♠ 8♠ K♦ 10♦ 8♦ 7♦'],
  tricks: ['1A♣ 08♣', '1K♣ 0J♣', '1Q♣ 08♥'],
};

test('ruka 19: Milan ne igra A pik iz A,7 ("igranje pika je nepotrebno"), nego herc', () => {
  assert.equal(rules(H19).slice(-1), '♥');
  assert.equal(search(H19).slice(-1), '♥');
});

// Ruka 31: Milan Igra-Tref protiv Antonija; Milanu je ostao J tref, a od tudjih aduta jos samo 9 tref
const H31: Position18 = {
  game: 'Igra-Tref', declarer: 1, follow: ['DODJEM', null, 'NE_DODJEM'], talon: 'Q♥ A♦',
  hands: ['10♥ 9♥ 7♥ J♠ 9♠ J♦', 'J♣ A♠ Q♠ 10♠ 8♠ K♦', '9♣ J♥ 8♥ K♠ 7♠ Q♦ 10♦ 9♦ 8♦ 7♦'],
  tricks: ['0A♥ 18♣', '1K♣ 0A♣', '0K♥ 110♣', '1Q♣ 07♣'],
};

test('ruka 31: Milan ne izvlaci poslednji adut J tref, nego igra A pik', () => {
  assert.equal(rules(H31), 'A♠');
  assert.equal(search(H31), 'A♠');
});
