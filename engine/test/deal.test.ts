import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, validateDeal, totalTricksExpected } from '../src/deal.ts';
import { CARDS_PER_PLAYER, TALON_SIZE, TRICKS_PER_HAND } from '../src/constants.ts';
import { makeDeck, isValidDeck } from '../src/deck.ts';

// Deterministički RNG za testove (LCG)
function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test('deal: svaki igrač dobija tačno 10 karata', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = deal(makeRng(seed));
    for (const h of r.hands) {
      assert.equal(h.length, CARDS_PER_PLAYER, `seed ${seed}`);
    }
  }
});

test('deal: talon ima tačno 2 karte', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = deal(makeRng(seed));
    assert.equal(r.talon.length, TALON_SIZE, `seed ${seed}`);
  }
});

test('deal: 32 karte raspoređeno, sve različite', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const r = deal(makeRng(seed));
    assert.equal(validateDeal(r), true, `seed ${seed}`);
  }
});

test('deal: nema preklapanja između ruku i talona', () => {
  const r = deal(makeRng(42));
  const all = [
    ...r.hands[0], ...r.hands[1], ...r.hands[2], ...r.talon,
  ].map(c => c.id);
  const set = new Set(all);
  assert.equal(set.size, 32);
});

test('deal: deterministički sa istim seed-om', () => {
  const r1 = deal(makeRng(7));
  const r2 = deal(makeRng(7));
  assert.deepEqual(r1.hands, r2.hands);
  assert.deepEqual(r1.talon, r2.talon);
});

test('deal: različiti seed-ovi daju različite karte (verovatno)', () => {
  let diffs = 0;
  for (let s = 1; s <= 10; s++) {
    const r1 = deal(makeRng(s));
    const r2 = deal(makeRng(s + 1));
    const ids1 = r1.hands.flat().map(c => c.id).join(',');
    const ids2 = r2.hands.flat().map(c => c.id).join(',');
    if (ids1 !== ids2) diffs++;
  }
  assert.equal(diffs, 10);
});

test('makeDeck: 32 karte, sve različite', () => {
  const d = makeDeck();
  assert.equal(d.length, 32);
  assert.equal(isValidDeck(d), true);
});

test('makeDeck: sadrži sve boje i rangove', () => {
  const d = makeDeck();
  const suits = new Set(d.map(c => c.suit));
  assert.equal(suits.size, 4);
  const ranks = new Set(d.map(c => c.rank));
  assert.equal(ranks.size, 8);
});

test('TRICKS_PER_HAND = 10', () => {
  assert.equal(totalTricksExpected(), TRICKS_PER_HAND);
  assert.equal(TRICKS_PER_HAND, 10);
});
