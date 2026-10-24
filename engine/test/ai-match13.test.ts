// Ispravke AI-ja iz analize korisnikove partije #13 (2026-10-24) — ruke su
// iz te partije.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBetlSafe } from '../src/aiHandEval.ts';
import { chooseBidAction } from '../src/aiBidding.ts';
import { choosePlayCard } from '../src/aiDiscardPlay.ts';
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

// Otvaranje pratioca (choosePlayCard). t = odigrani stihovi pre ovog.
type T = { player: Position; card: Card }[][];
const trick = (...plays: [number, string][]): T[number] => plays.map(([p, c]) => ({ player: p as Position, card: hand(c)[0]! }));
function lead(h: string, game: string, me: number, declarer: number, opts: {
  tricks?: T; twoHanded?: boolean; bidLevels?: [number, number, number]; kontraPlayer?: number;
} = {}) {
  const trump = ({ Pik: '♠', Karo: '♦', Herc: '♥', Tref: '♣' } as Record<string, Card['suit']>)[game.replace('Igra-', '')] ?? null;
  return choosePlayCard({
    hand: hand(h), currentTrick: [], trump, declaredGame: game as never, winnerTricks: 0,
    isDeclarer: false, myPosition: me as Position, declarer: declarer as Position, tricks: opts.tricks ?? [],
    twoHanded: opts.twoHanded ?? true, bidLevels: opts.bidLevels ?? [0, 0, 0],
    kontraPlayer: (opts.kontraPlayer ?? null) as Position | null,
  })!.id;
}

test('otvaranje: K,D pre niske karte (#12 ruka 1, 3. stih: Bora K herc)', () => {
  const t = [trick([2, 'A♦'], [0, 'Q♦']), trick([2, 'K♦'], [0, 'J♦'])];
  assert.equal(lead('Q♣ J♣ 8♣ K♥ Q♥ 10♥ 9♠ 8♠', 'Tref', 2, 0, { tricks: t }), 'K♥');
});

test('otvaranje: K,D,J umesto J,10,9 (#12 ruka 4: Milan K herc)', () => {
  assert.equal(lead('K♣ 7♣ K♥ Q♥ J♥ Q♠ J♠ J♦ 10♦ 9♦', 'Igra-Tref', 1, 2), 'K♥');
});

test('otvaranje: as najduze boje, ne drugi ni suvi as (#12 r6, #13 r3, #13 r9)', () => {
  assert.equal(lead('10♣ 8♣ A♥ 10♥ 9♥ A♠ 8♠ 7♠ A♦ 10♦', 'Herc', 1, 2), 'A♠');
  assert.equal(lead('A♣ 9♥ 7♥ A♠ J♠ 9♠ 7♠ K♦ J♦ 7♦', 'Herc', 1, 2), 'A♠');
  assert.equal(lead('10♣ 9♣ 8♣ 7♣ A♥ 9♥ 8♥ 7♥ A♦ J♦', 'Igra-Pik', 2, 0), 'A♥');
});

test('otvaranje: makaze A,D se ne otvaraju (#13 ruka 25, 3. stih: A pik)', () => {
  const t = [trick([1, 'A♦'], [2, 'Q♦']), trick([1, 'K♥'], [2, 'A♥'])];
  assert.equal(lead('A♣ Q♣ 8♣ 9♥ A♠ 10♠ 8♠ 7♠', 'Karo', 2, 1, { tricks: t }), 'A♠');
});

test('otvaranje: K,D,J karo umesto makaza A,D,10 tref (#13 ruka 31, 2. stih)', () => {
  const t = [trick([1, 'K♥'], [2, 'A♥'], [0, 'J♥'])];
  assert.equal(lead('A♣ Q♣ 10♣ 9♠ 7♠ K♦ Q♦ J♦ 7♦', 'Herc', 2, 1, { tricks: t, twoHanded: false, bidLevels: [0, 3, 3] }), 'K♦');
});

test('Sans: K,D herc pre duge D,J,10,9,8 pik (#13 ruka 8)', () => {
  assert.equal(lead('A♣ J♣ K♥ Q♥ Q♠ J♠ 10♠ 9♠ 8♠ 9♦', 'Sans', 2, 0), 'K♥');
});

test('partnerova boja: dokle je licitirao, mala kroz nosioca, velika kroz partnera', () => {
  const h = 'A♣ 9♣ K♦ 8♦ 7♦ J♠ 10♠ 9♠ 8♥ 7♥';
  // nosilac 0; ja 2 → posle mene igra nosilac; partner 1 stao na 3 (karo)
  assert.equal(lead(h, 'Herc', 2, 0, { twoHanded: false, bidLevels: [4, 3, 0] }), '7♦');
  // ja 1 → posle mene igra partner 2
  assert.equal(lead(h, 'Herc', 1, 0, { twoHanded: false, bidLevels: [4, 0, 3] }), 'K♦');
  // udvoje (partner ne igra) — partnerova boja se ne gleda
  assert.notEqual(lead(h, 'Herc', 2, 0, { twoHanded: true, bidLevels: [4, 3, 0] }).slice(-1), '♦');
});

test('Sans: partner nije licitirao → tref, partner dao kontru → pik', () => {
  const h = 'K♣ 8♣ 7♣ K♠ 9♠ 8♠ Q♥ J♥ 10♦ 9♦';
  assert.equal(lead(h, 'Sans', 2, 0, { twoHanded: false }), '7♣');
  assert.equal(lead(h, 'Sans', 2, 0, { twoHanded: false, kontraPlayer: 1 }), '8♠');
  // partner licitirao do 4 → herc (licit pre kontre)
  assert.equal(lead(h, 'Sans', 2, 0, { twoHanded: false, bidLevels: [7, 4, 0], kontraPlayer: 1 }), 'J♥');
});
