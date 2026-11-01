// Ispravke AI-ja iz korisnikove analize partije #19 (2026-11-01): Antonije (0), Milan (1), Bora (2).
// Pozicije su prepisane iz zapisa partije; karte u ruci su one koje su igracu ostale u tom trenutku.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rules, search } from './positions.ts';
import type { Position18 } from './positions.ts';

// Ruka 5: Milan Herc (kontra), A,K,J,8 herc; dama je kod Antonija, koji igra poslednji
const H5: Position18 = {
  game: 'Herc', declarer: 1, follow: ['DODJEM', null, 'DODJEM'], discard: '10♣ K♣',
  hands: ['A♣ Q♥ 10♥ 7♥ A♠ K♠ J♠ J♦ 9♦ 7♦', 'A♥ K♥ J♥ 8♥ Q♠ 10♠ 8♠ K♦ Q♦ 10♦', 'Q♣ J♣ 9♣ 8♣ 7♣ 9♥ 9♠ 7♠ A♦ 8♦'],
  tricks: [],
};

test('ruka 5: Milan ne vodi J herc uz A i K, nego As jednom ("Asem")', () => {
  assert.equal(rules(H5), 'A♥');
  for (let i = 0; i < 3; i++) assert.equal(search(H5), 'A♥');
});

test('ruka 5: na J herc Antonije uzima damom (adut na adut, ne najmanji)', () => {
  assert.equal(rules({ ...H5, current: '1J♥ 29♥' }), 'Q♥');
});

test('ruka 5: posle 10 karo napolju su samo 10 i 7 herc — Milan uzima adute A i K', () => {
  const h: Position18 = {
    ...H5,
    hands: ['10♥ 7♥ K♠ J♦', 'A♥ K♥ Q♠ Q♦', 'J♣ 9♣ 8♣ 7♣'],
    tricks: ['1J♥ 29♥ 0Q♥', '0A♠ 110♠ 27♠', '07♦ 1K♦ 2A♦', '2Q♣ 0A♣ 18♥', '18♠ 29♠ 0J♠', '09♦ 110♦ 28♦'],
  };
  assert.ok(['A♥', 'K♥'].includes(rules(h)));
  assert.ok(['A♥', 'K♥'].includes(search(h)));
});

// Ruka 7: Milan Tref, posle secenja u 1. stihu ostao mu je suv A tref; napolju K,J tref (Antonije) i 10 tref (Bora)
const H7: Position18 = {
  game: 'Tref', declarer: 1, follow: ['DODJEM', null, 'DODJEM'], discard: '8♥ 7♠',
  hands: ['K♣ J♣ K♥ J♥ 10♥', 'A♥ Q♥ A♣ J♦ 9♦', '10♣ 9♥ 7♥ J♠ 10♦'],
  tricks: ['2A♠ 09♠ 17♣', '1K♦ 2A♦ 07♦', '28♠ 0Q♠ 18♣', '1Q♦ 28♦ 09♣', '0K♠ 1Q♣ 210♠'],
};

test('ruka 7: suv A tref Milan igra odmah, ne cuva ga za secenje', () => {
  assert.equal(rules(H7), 'A♣');
  assert.equal(search(H7), 'A♣');
});

test('ruka 7: posle A tref Milan igra karo, ne otvara makaze A,D herc', () => {
  const h: Position18 = {
    ...H7,
    hands: ['K♣ K♥ J♥ 10♥', 'A♥ Q♥ J♦ 9♦', '9♥ 7♥ J♠ 10♦'],
    tricks: [...H7.tricks, '1A♣ 210♣ 0J♣'],
  };
  assert.equal(rules(h).slice(-1), '♦');
  assert.equal(search(h).slice(-1), '♦');
});
