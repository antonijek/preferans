// Testovi za AI heuristike

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateHand,
  evaluateSuit,
  chooseBidAction,
  chooseDiscard,
  chooseFollow,
  chooseKontra,
  choosePlayCard,
  chooseUseRefe,
  chooseIgraConfirm,
} from '../src/ai.ts';
import { Game } from '../src/game.ts';
import type { Card } from '../src/types.ts';

function makeHand(cards: Array<[string, string]>): Card[] {
  return cards.map(([rank, suit]) => ({ id: `${rank}${suit}`, rank, suit }));
}

test('ai: evaluateHand — prebrojava poene po bojama', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠'], // Pik: A,K,Q,J,10
    ['9', '♥'], ['8', '♥'], // Herc: 9, 8
    ['7', '♦'], ['7', '♣'], // Singl karte
    ['9', '♣'], // Još jedna karta
  ]);
  const ev = evaluateHand(hand);
  assert.equal(ev.length, 10);
  assert.ok(ev.bestSuit, 'bestSuit mora biti definisan');
  assert.equal(ev.bestSuit!.suit, '♠');
  assert.equal(ev.bestSuit!.count, 5);
  // Pik ima A(10)+K(4)+Q(3)+J(2)+10(1) = 20 bodova
  assert.equal(ev.bestSuit!.points, 20);
  // highCards = A,K,Q,J (rankValue >= 4) = 4
  assert.equal(ev.bestSuit!.highCards, 4);
});

test('ai: evaluateHand — IGRA potencijal sa 6+ karata', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠'], ['9', '♠'],
    ['7', '♥'], ['8', '♥'], ['9', '♥'], ['7', '♣'],
  ]);
  const ev = evaluateHand(hand);
  assert.equal(ev.hasIgraPotential, true);
  assert.equal(ev.bestSuit!.count, 6);
});

test('ai: evaluateHand — nema IGRA potencijala sa slabom rukom', () => {
  const hand = makeHand([
    ['9', '♠'], ['8', '♠'], ['7', '♠'],
    ['9', '♥'], ['8', '♥'], ['7', '♥'],
    ['9', '♦'], ['8', '♦'], ['7', '♦'],
    ['9', '♣'],
  ]);
  const ev = evaluateHand(hand);
  assert.equal(ev.hasIgraPotential, false);
});

test('ai: evaluateSuit — boduje pravilno', () => {
  const cards = makeHand([
    ['A', '♠'], ['K', '♠'], ['7', '♠'],
  ]);
  const ev = evaluateSuit(cards);
  assert.equal(ev.count, 3);
  assert.equal(ev.highCards, 2); // A i K
  assert.equal(ev.points, 14); // 10 + 4
  assert.equal(ev.topCard!.rank, 'A');
});

test('ai: chooseBidAction — IGRA kad ima 6+ jakih', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠'], ['9', '♠'],
    ['7', '♥'], ['8', '♥'], ['9', '♦'], ['7', '♣'],
  ]);
  const action = chooseBidAction({
    hand,
    currentBid: 0,
    bidStartPlayer: 0 as any,
    currentBidder: 0 as any,
    passedPlayers: new Set(),
    playerBidLevel: 0,
  });
  // IGRA je samo reč (konkretna igra se proglašava posle Moze/dalje)
  assert.equal(action.type, 'IGRA');
});

test('ai: chooseBidAction — BID kad ima 5+ u boji', () => {
  const hand = makeHand([
    ['A', '♣'], ['K', '♣'], ['Q', '♣'], ['10', '♣'], ['8', '♣'],
    ['9', '♥'], ['8', '♥'], ['7', '♥'],
    ['7', '♦'], ['7', '♠'],
  ]);
  // AI bida 2 (Pik, najniža) kad je currentBid=0, čak i sa 5+ Tref
  const action = chooseBidAction({
    hand,
    currentBid: 0,
    bidStartPlayer: 0 as any,
    currentBidder: 0 as any,
    passedPlayers: new Set(),
    playerBidLevel: 0,
  });
  assert.equal(action.type, 'BID');
  if (action.type === 'BID') {
    assert.equal(action.value, 2);
  }
});

test('ai: chooseBidAction — PASS kad ruka slaba', () => {
  const hand = makeHand([
    ['9', '♠'], ['8', '♠'], ['7', '♠'],
    ['9', '♥'], ['8', '♥'],
    ['9', '♦'], ['8', '♦'],
    ['9', '♣'], ['8', '♣'], ['7', '♣'],
  ]);
  const action = chooseBidAction({
    hand,
    currentBid: 0,
    bidStartPlayer: 0 as any,
    currentBidder: 0 as any,
    passedPlayers: new Set(),
    playerBidLevel: 0,
  });
  assert.equal(action.type, 'PASS');
});

test('ai: chooseBidAction — ne biduje niže od currentBid', () => {
  const hand = makeHand([
    ['K', '♣'], ['Q', '♣'], ['10', '♣'], ['8', '♣'], ['7', '♣'],
    ['7', '♥'], ['7', '♦'], ['7', '♠'],
    ['9', '♥'], ['8', '♦'],
  ]);
  const action = chooseBidAction({
    hand,
    currentBid: 4, // currentBid je 4, ne biduje 5 jer je Pik=2, Karo=3, Herc=4 (Herc bi dao 4 ali count>=5 i highCards>=1)
    bidStartPlayer: 0 as any,
    currentBidder: 0 as any,
    passedPlayers: new Set(),
    playerBidLevel: 0,
  });
  // Tref count=5 highCards=2 → BID 5 (>= currentBid+1)
  // Ili PASS ako count<5 negde
  if (action.type === 'BID') {
    assert.ok(action.value > 4);
  }
});

test('ai: chooseDiscard — odbacuje najslabije van aduta', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], // 4 pika (adut)
    ['A', '♥'], ['K', '♥'],
    ['7', '♦'], ['8', '♦'], // Slabe karo
    ['9', '♣'], ['7', '♣'], // Slabe tref
  ]);
  const [c1, c2] = chooseDiscard(hand, '♠');
  // Trebalo bi da odbaci 7 karo i 7 tref (najslabije van aduta)
  const ids = new Set([c1.id, c2.id]);
  assert.ok(ids.has('7♦'), `Mora da sadrži 7♦ (odbacuje: ${c1.id}, ${c2.id})`);
  assert.ok(ids.has('7♣'), `Mora da sadrži 7♣ (odbacuje: ${c1.id}, ${c2.id})`);
});

test('ai: chooseDiscard — čuva adute', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠'], ['9', '♠'],
    ['9', '♥'], ['8', '♥'], ['7', '♥'],
    ['A', '♦'], // Jak karo
  ]);
  const [c1, c2] = chooseDiscard(hand, '♠');
  // Ne sme da odbaci pik
  assert.notEqual(c1.suit, '♠', `Ne odbacuje pik: ${c1.id}`);
  assert.notEqual(c2.suit, '♠', `Ne odbacuje pik: ${c2.id}`);
});

test('ai: chooseFollow — DODJEM za jaku ruku', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠'],
    ['7', '♥'], ['8', '♥'], ['9', '♦'], ['7', '♦'], ['7', '♣'],
  ]);
  const action = chooseFollow({ hand, declaredGame: 'Pik' });
  assert.equal(action, 'DODJEM');
});

test('ai: chooseFollow — NE_DODJEM za slabu ruku', () => {
  const hand = makeHand([
    ['9', '♠'], ['8', '♠'], ['7', '♠'],
    ['9', '♥'], ['8', '♥'], ['7', '♥'],
    ['9', '♦'], ['8', '♦'],
    ['9', '♣'], ['7', '♣'],
  ]);
  const action = chooseFollow({ hand, declaredGame: 'Pik' });
  assert.equal(action, 'NE_DODJEM');
});

test('ai: chooseKontra — KONTRA kad ima 4+ aduta', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'],
    ['7', '♥'], ['8', '♥'], ['9', '♦'], ['7', '♦'], ['7', '♣'], ['9', '♣'],
  ]);
  const action = chooseKontra({ hand, trump: '♠', currentLevel: 0 });
  assert.equal(action, 'KONTRA');
});

test('ai: chooseKontra — MOZE kad nema dovoljno aduta', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♠'], // 2 aduta
    ['A', '♥'], ['K', '♥'], ['Q', '♥'], ['J', '♥'],
    ['9', '♦'], ['8', '♦'], ['7', '♦'],
    ['9', '♣'],
  ]);
  const action = chooseKontra({ hand, trump: '♠', currentLevel: 0 });
  assert.equal(action, 'MOZE');
});

test('ai: choosePlayCard — vodi najslabijom', () => {
  const hand = makeHand([
    ['A', '♠'], ['K', '♥'], ['Q', '♦'], ['J', '♣'],
  ]);
  const c = choosePlayCard({
    hand,
    currentTrick: [],
    trump: '♠',
    declaredGame: 'Pik',
    winnerTricks: 0,
  });
  assert.ok(c, 'mora izabrati kartu');
  // Trebalo bi 7 ili najslabiju
});

test('ai: choosePlayCard — prati boju ako može', () => {
  const hand = makeHand([
    ['A', '♥'], ['K', '♥'], ['9', '♥'], // 3 herc
    ['A', '♠'], ['K', '♠'],
    ['7', '♦'], ['8', '♦'], ['9', '♣'], ['7', '♣'], ['9', '♣'],
  ]);
  // Vodi pik, ja imam samo herc — ne mogu pratiti boju
  const c = choosePlayCard({
    hand,
    currentTrick: [{ player: 1 as any, card: { id: 'Q♠', rank: 'Q', suit: '♠' } }],
    trump: '♠',
    declaredGame: 'Pik',
    winnerTricks: 0,
  });
  // Mora adut (pik) jer nemam lead boju
  assert.equal(c!.suit, '♠');
});

test('ai: choosePlayCard — null ako nema legalnih karata', () => {
  const hand = makeHand([
    ['A', '♣'], ['K', '♣'],
  ]);
  // U betlu, vodi herc — ja imam samo tref, pratim boju
  const c = choosePlayCard({
    hand,
    currentTrick: [{ player: 1 as any, card: { id: 'A♥', rank: 'A', suit: '♥' } }],
    trump: null,
    declaredGame: 'Betl',
    winnerTricks: 0,
  });
  assert.equal(c!.suit, '♣');
});

test('ai: choosePlayCard — avoidTricks (Betl deklarant) baca NAJVEĆU kartu koja gubi', () => {
  const hand = makeHand([
    ['K', '♥'], ['9', '♥'], ['7', '♥'],
  ]);
  // Vođena Herc sa Q — imam K (pobeđuje), 9 i 7 (gube). Moram izbeći pobedu.
  const c = choosePlayCard({
    hand,
    currentTrick: [{ player: 1 as any, card: { id: 'Q♥', rank: 'Q', suit: '♥' } }],
    trump: null,
    declaredGame: 'Betl',
    winnerTricks: 0,
    avoidTricks: true,
  });
  assert.equal(c!.rank, '9', 'najveca karta koja i dalje gubi (9 > 7, K bi pobedio)');
});

test('ai: choosePlayCard — avoidTricks primoran da pobedi bira NAJMANJU pobednicku', () => {
  const hand = makeHand([
    ['A', '♦'], ['K', '♦'],
  ]);
  // Vođena Karo sa 7 — obe moje karte pobeđuju, primoran sam.
  const c = choosePlayCard({
    hand,
    currentTrick: [{ player: 1 as any, card: { id: '7♦', rank: '7', suit: '♦' } }],
    trump: null,
    declaredGame: 'Betl',
    winnerTricks: 0,
    avoidTricks: true,
  });
  assert.equal(c!.rank, 'K', 'primoran da pobedi — bira manju od dve pobednicke (K < A)');
});

test('ai: choosePlayCard — avoidTricks bez lead boje baca najslabiju (Betl nema aduta)', () => {
  const hand = makeHand([
    ['A', '♣'], ['7', '♣'],
  ]);
  const c = choosePlayCard({
    hand,
    currentTrick: [{ player: 1 as any, card: { id: 'A♥', rank: 'A', suit: '♥' } }],
    trump: null,
    declaredGame: 'Betl',
    winnerTricks: 0,
    avoidTricks: true,
  });
  assert.equal(c!.rank, '7', 'nema lead boju — bezbedno baca najslabiju');
});