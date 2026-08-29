import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trickWinner, isCardLegal, getLegalCards } from '../src/trick.ts';
import { makeCard } from '../src/cards.ts';
import type { TrickCard } from '../src/types.ts';

const A = makeCard('♠', 'A');
const K = makeCard('♠', 'K');
const Q = makeCard('♠', 'Q');
const seven = makeCard('♠', '7');
const ten = makeCard('♥', '10');
const nine = makeCard('♥', '9');
const three = makeCard('♦', '3');

function tc(player: number, card: ReturnType<typeof makeCard>): TrickCard {
  return { player: player as 0 | 1 | 2, card };
}

test('trickWinner: pik adut, najjači adut pobjeđuje', () => {
  const trick = [tc(0, A), tc(1, K), tc(2, Q)];
  assert.equal(trickWinner(trick, '♠'), 0);
});

test('trickWinner: pik adut, herc ne pobjeđuje', () => {
  const trick = [tc(0, ten), tc(1, A), tc(2, K)];
  assert.equal(trickWinner(trick, '♠'), 1);
});

test('trickWinner: bez aduta, viši rang iste boje pobjeđuje', () => {
  const A_h = makeCard('♥', 'A');
  const K_h = makeCard('♥', 'K');
  const trick = [tc(0, ten), tc(1, K_h), tc(2, A_h)];
  assert.equal(trickWinner(trick, null), 2);
});

test('trickWinner: različite boje bez aduta — vodi prvi', () => {
  const trick = [tc(0, A), tc(1, K)];
  assert.equal(trickWinner(trick, null), 0);
});

test('isCardLegal: vodi može bilo koju', () => {
  const hand = [A, ten];
  assert.equal(isCardLegal(ten, hand, [], '♠'), true);
  assert.equal(isCardLegal(A, hand, [], '♠'), true);
});

test('isCardLegal: mora pratiti boju ako ima', () => {
  const hand = [A, ten, nine];
  const trick = [tc(0, A)];
  assert.equal(isCardLegal(A, hand, trick, '♠'), true);
  assert.equal(isCardLegal(ten, hand, trick, '♠'), false);
});

test('isCardLegal: bez lead boje, u adutskoj igri — sve legalno (sve aduti)', () => {
  const hand = [A, K]; // oba pik (adut)
  const trick = [tc(0, nine)]; // herc vođen, nema ga u ruci
  assert.equal(isCardLegal(A, hand, trick, '♠'), true);
  assert.equal(isCardLegal(K, hand, trick, '♠'), true);
});

test('isCardLegal TEST B: HERC adut, nema Pik — samo HERC legalno', () => {
  // B ima: HERC 10 (adut), KARO 3, TREF K — nema Pik, ima adut
  const hand = [ten, three, makeCard('♣', 'K')]; // 10=herc (adut), 3=karo, K=tref
  const trick = [tc(0, A)]; // pik vođen
  // HERC 10 je JEDINI legalan (mora adut)
  assert.equal(isCardLegal(ten, hand, trick, '♥'), true);
  assert.equal(isCardLegal(three, hand, trick, '♥'), false);
  assert.equal(isCardLegal(makeCard('♣', 'K'), hand, trick, '♥'), false);
});

test('isCardLegal TEST B2: KARO vođena, B ima KARO — samo KARO legalno', () => {
  // B ima: KARO 3, HERC 10 (adut), TREF K
  const hand = [three, ten, makeCard('♣', 'K')];
  const trick = [tc(0, three)]; // karo vođen
  // KARO 3 je JEDINI legalan (mora pratiti Karo)
  assert.equal(isCardLegal(three, hand, trick, '♥'), true);
  assert.equal(isCardLegal(ten, hand, trick, '♥'), false);
  assert.equal(isCardLegal(makeCard('♣', 'K'), hand, trick, '♥'), false);
});

test('isCardLegal TEST B3: nema Pik ni Herc — sve legalno', () => {
  // B ima: KARO 3, TREF K
  const hand = [three, makeCard('♣', 'K')]; // 3=karo, K=tref
  const trick = [tc(0, A)]; // pik vođen
  assert.equal(isCardLegal(three, hand, trick, '♥'), true);
  assert.equal(isCardLegal(makeCard('♣', 'K'), hand, trick, '♥'), true);
});

test('isCardLegal: bez lead boje, kad ima i adut i neadut — SAMO adut legalan (po ispravnom pravilu)', () => {
  const hand = [A, three]; // A je pik (adut), 3 je karo (neadut)
  const trick = [tc(0, nine)]; // herc vođen, nema ga u ruci
  // Po ispravnom pravilu: nema Pik, ima Pik (adut), MORA adut
  assert.equal(isCardLegal(A, hand, trick, '♠'), true); // adut OK
  assert.equal(isCardLegal(three, hand, trick, '♠'), false); // neadut NE
});

test('isCardLegal: bez lead boje, u betlu/sansu može bilo koju', () => {
  const hand = [A, K];
  const trick = [tc(0, nine)];
  assert.equal(isCardLegal(A, hand, trick, null), true);
  assert.equal(isCardLegal(K, hand, trick, null), true);
});

test('isCardLegal: u sansu/betlu, sa lead bojom u ruci — MORA pratiti', () => {
  const hand = [A, ten]; // ten je herc, lead je herc
  const trick = [tc(0, nine)]; // herc vođen
  assert.equal(isCardLegal(ten, hand, trick, null), true); // mora herc
  assert.equal(isCardLegal(A, hand, trick, null), false); // pik ne može
});

test('getLegalCards: filtrira nelegalne', () => {
  const hand = [A, ten, nine];
  const trick = [tc(0, A)];
  const legal = getLegalCards(hand, trick, '♠');
  assert.equal(legal.length, 1);
  assert.equal(legal[0], A);
});

test('trickWinner: svi pik, A pobjeđuje (najjači)', () => {
  const trick = [tc(0, A), tc(1, K), tc(2, seven)];
  assert.equal(trickWinner(trick, '♠'), 0);
});

test('trickWinner: 7 pik pobjeđuje herc (adut vs neadut)', () => {
  const trick = [tc(0, ten), tc(1, K), tc(2, seven)];
  assert.equal(trickWinner(trick, '♠'), 1); // K je jači adut od 7
});
