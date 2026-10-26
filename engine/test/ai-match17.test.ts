// Ispravke AI-ja iz analize korisnikove partije #17 (2026-10-26).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIgraWorthy, sansGuardedAfterIgra } from '../src/aiHandEval.ts';
import { chooseBidAction, chooseDeclareGame, otherIgraOf } from '../src/aiBidding.ts';
import { IGRA_GAMES } from '../src/constants.ts';
import { choosePlayCard } from '../src/aiDiscardPlay.ts';
import { searchChoosePlayCard } from '../src/aiSearch.ts';
import { Game } from '../src/game.ts';
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

// Ruka 3, Betl: Bora (2) nosilac, Antonije (0) i Milan (1) pratioci.

const BORA = hand('A♣ 10♣ 9♣ 8♣ 7♣ A♦ K♦ J♦ 9♦ 7♦');
const tc = (player: number, id: string) => ({ player: player as Position, card: hand(id)[0]! });
const betl = (h: Card[], me: number, currentTrick: ReturnType<typeof tc>[], tricks: ReturnType<typeof tc>[][] = [], discard: Card[] = []) =>
  choosePlayCard({
    hand: h, currentTrick, trump: null, declaredGame: 'Betl', winnerTricks: 0, avoidTricks: me === 2,
    isDeclarer: me === 2, myPosition: me as Position, declarer: 2 as Position, tricks, discard,
  })?.id;

test('betl A: nosilac krece 7 tref (vezane 7,8,9), ne 7 karo (posle nje 8 karo kod pratilaca)', () => {
  assert.equal(betl(BORA, 2, [], [], hand('9♠ 7♠')), '7♣');
});

test('betl A: pretraga ne preskace pravilo — Bora krece 7 tref', () => {
  const g = new Game({ seed: 1 });
  const s = g.state;
  Object.assign(s, {
    phase: 'PLAYING', declaredGame: 'Betl', trump: null, winner: 2, currentPlayer: 2,
    currentTrick: [], tricks: [], trickCount: 0, discard: hand('9♠ 7♠'), followChoices: ['DODJEM', 'DODJEM', null],
  });
  s.players[0]!.hand = hand('K♣ J♣ A♥ Q♥ 10♥ 9♥ Q♠ J♠ 8♠ Q♦');
  s.players[1]!.hand = hand('Q♣ K♥ J♥ 8♥ 7♥ A♠ K♠ 10♠ 10♦ 8♦');
  s.players[2]!.hand = BORA;
  assert.equal(searchChoosePlayCard(s, 2 as Position, 40).id, '7♣');
});

test('betl B2: Milan na 7 karo i D karo baca 10, cuva 8', () => {
  const milan = hand('Q♣ K♥ J♥ 8♥ 7♥ A♠ K♠ 10♠ 10♦ 8♦');
  assert.equal(betl(milan, 1, [tc(2, '7♦'), tc(0, 'Q♦')]), '10♦');
});

test('betl B1: nosilac drzi stih — pratilac baca manju da nosilac uzme', () => {
  assert.equal(betl(hand('8♦ K♦ 7♠'), 1, [tc(2, '9♦'), tc(0, '7♦')]), '8♦');
});

test('betl B3: nosilac baca posle mene — najmanja', () => {
  assert.equal(betl(hand('10♦ 8♦ 7♠'), 0, [tc(1, '7♦')]), '8♦');
});

test('betl C: Bora nema pik — Milan igra 8 karo, ne pik i ne 7 herc', () => {
  const tricks = [[tc(2, '7♦'), tc(0, 'Q♦'), tc(1, '10♦')], [tc(0, '8♠'), tc(1, '10♠'), tc(2, 'A♣')]];
  assert.equal(betl(hand('K♥ J♥ 8♥ 7♥ A♠ K♠ 8♦ Q♣'), 1, [], tricks), '8♦');
});

test('betl D: Milan nema tref — baca A pik (Bora nema pik ni herc), cuva 10 karo', () => {
  const tricks = [
    [tc(2, '7♦'), tc(0, 'Q♦'), tc(1, '8♦')],
    [tc(0, '8♠'), tc(1, '10♠'), tc(2, 'A♣')],
    [tc(1, '7♥'), tc(2, 'J♦'), tc(0, 'A♥')],
    [tc(0, 'J♣'), tc(1, 'Q♣'), tc(2, '10♣')],
    [tc(1, '8♥'), tc(2, 'K♦'), tc(0, 'Q♥')],
  ];
  assert.equal(betl(hand('K♥ J♥ A♠ K♠ 10♦'), 1, [tc(0, 'K♣')], tricks), 'A♠');
});

test('sans posle tudjeg igra: Bora sa suvom 10 pik igra Igra-Tref, ne Igra-Sans (ruka 5)', () => {
  const bora = hand('A♣ K♣ J♣ 8♣ A♥ K♥ Q♥ J♥ 10♠ A♦');
  const bids = [{ player: 0 as Position, type: 'PASS' }, { player: 1 as Position, type: 'IGRA' }, { player: 2 as Position, type: 'IGRA' }];
  const other = otherIgraOf({ bids, bidStartPlayer: 0 as Position }, 2 as Position);
  assert.deepEqual(other, { sayerLeads: false });
  assert.equal(chooseDeclareGame(bora, 0, IGRA_GAMES, false, other), 'Igra-Tref');
  assert.equal(chooseDeclareGame(bora, 0, IGRA_GAMES, false, null), 'Igra-Sans', 'bez tudjeg igra Sans ostaje');
});

test('sans posle tudjeg igra: K,7 samo kad prvi baca onaj sa igra; D,J,10 uvek', () => {
  const k7 = hand('A♣ K♣ Q♣ A♥ K♥ Q♥ A♦ K♦ K♠ 7♠');
  assert.equal(sansGuardedAfterIgra(k7, true), true);
  assert.equal(sansGuardedAfterIgra(k7, false), false);
  const qj10 = hand('A♣ K♣ Q♣ A♥ K♥ Q♥ A♦ Q♠ J♠ 10♠');
  assert.equal(sansGuardedAfterIgra(qj10, false), true);
});

test('pratilac posle svog asa nastavlja boju: Bora K karo, ne A pik (ruka 6)', () => {
  const bora = hand('K♣ J♣ 8♥ A♠ 10♠ 7♠ K♦ 10♦ 8♦');
  const card = choosePlayCard({
    hand: bora, currentTrick: [], trump: '♥', declaredGame: 'Herc', winnerTricks: 0, isDeclarer: false,
    myPosition: 2 as Position, declarer: 1 as Position, tricks: [[tc(2, 'A♦'), tc(1, '9♦')]], twoHanded: true,
    nextActivePosition: 1 as Position, trickCount: 1,
  });
  assert.equal(card?.id, 'K♦');
});

test('pratilac posle svog asa nastavlja boju i u pretrazi (ruka 6)', () => {
  const g = new Game({ seed: 1 });
  const s = g.state;
  Object.assign(s, {
    phase: 'PLAYING', declaredGame: 'Herc', trump: '♥', winner: 1, currentPlayer: 2, currentTrick: [],
    tricks: [[tc(2, 'A♦'), tc(1, '9♦')]], trickCount: 1, followChoices: ['NE_DODJEM', null, 'DODJEM'],
  });
  s.players[0]!.hand = hand('A♣ Q♣ 10♣ 9♣ 8♣ 10♥ Q♠ 9♠ Q♦ J♦');
  s.players[1]!.hand = hand('A♥ K♥ Q♥ J♥ 9♥ 7♥ K♠ J♠ 8♠');
  s.players[2]!.hand = hand('K♣ J♣ 8♥ A♠ 10♠ 7♠ K♦ 10♦ 8♦');
  assert.equal(searchChoosePlayCard(s, 2 as Position, 40).id, 'K♦');
});
