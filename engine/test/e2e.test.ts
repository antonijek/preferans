// End-to-end testovi: kompletni tokovi Preferansa

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';

test('e2e: bidding → DISCARDING → DECLARING → FOLLOW_DECLARING', () => {
  const game = new Game({ seed: 100 });
  game.newHand(0);
  // Bidding: P1 bid 2, P2 pass, P3 pass → P1 winner
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  // Winner je 1, faza DISCARDING
  assert.equal(game.state.phase, 'DISCARDING');
  assert.equal(game.state.winner, 1);
  // P1 ima 12 karata (10 + 2 talon)
  assert.equal(game.state.players[1]!.hand.length, 12);
  // Discard
  const hand = game.state.players[1]!.hand;
  const ok = game.discard(1, [hand[0]!.id, hand[1]!.id]);
  assert.equal(ok, true);
  assert.equal(game.state.phase, 'DECLARING');
  assert.equal(game.state.players[1]!.hand.length, 10);
  assert.equal(game.state.discard.length, 2);
  // Declare Karo
  const declareOk = game.declareGame(1, 'Karo');
  assert.equal(declareOk, true);
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
  assert.equal(game.state.trump, '♦');
  assert.equal(game.state.declaredGame, 'Karo');
});

test('e2e: Igra tok — bez talona, ide pravo u FOLLOW_DECLARING', () => {
  const game = new Game({ seed: 200 });
  game.newHand(0);
  // P1 kaže "dalje", pa P2 kaže "Igra Herc"
  game.pass(1);
  game.igra(2, 'Igra-Herc');
  // Winner je 2, faza FOLLOW_DECLARING (preskočeno DISCARDING i DECLARING)
  assert.equal(game.state.winner, 2);
  assert.equal(game.state.winnerGame, 'Igra-Herc');
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
  assert.equal(game.state.trump, '♥');
  // P2 ima 10 karata (nije uzeo talon)
  assert.equal(game.state.players[2]!.hand.length, 10);
  // Talon je netaknut
  assert.equal(game.state.talon.length, 2);
});

test('e2e: Betl — svi automatski prate, prelaz u PLAYING', () => {
  const game = new Game({ seed: 300 });
  game.newHand(0);
  game.bid(1, 5); // Tref
  game.pass(2);
  game.pass(0);
  // DISCARDING
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  // Declare Betl
  game.declareGame(1, 'Betl');
  // Betl: faza PLAYING, svi prate
  assert.equal(game.state.phase, 'PLAYING');
  assert.equal(game.state.declaredGame, 'Betl');
  assert.equal(game.state.trump, null);
  assert.deepEqual(game.state.followChoices, ['DODJEM', 'DODJEM', 'DODJEM']);
});

test('e2e: Poziv — "Idemo zajedno"', () => {
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 4);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  // P0 i P2 se izjašnjavaju
  game.follow(0, 'DODJEM');
  assert.equal(game.state.phase, 'FOLLOW_DECLARING'); // P2 još nije
  game.follow(2, 'NE_DODJEM');
  // Poziv: P0 zove P2
  const callOk = game.call(0, 2);
  assert.equal(callOk, true);
  // Svi igraju
  assert.equal(game.state.caller, 0);
  assert.equal(game.state.followChoices[2], 'DODJEM');
});

test('e2e: Svi kažu dalje → REFE faza', () => {
  const game = new Game({ seed: 500 });
  game.newHand(0);
  // Svi "dalje"
  game.pass(1);
  game.pass(2);
  game.pass(0);
  // REFE
  assert.equal(game.state.phase, 'REFE');
  assert.equal(game.state.refeOccurred, true);
});

test('e2e: Kontra tok — KONTRA → REKONTRA → SUBKONTRA → MORTKONTRA', () => {
  const game = new Game({ seed: 600 });
  game.newHand(0);
  game.bid(1, 5); // Tref
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  // Oba pratioca "Dodjem"
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // Faza KONTRA_DECLARING
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  // P0 daje kontru
  assert.equal(game.expectedKontraPlayerPublic(), 0);
  game.kontra(0, 'KONTRA');
  assert.equal(game.state.kontraLevel, 'KONTRA');
  // P1 (nosilac) daje rekontru
  game.kontra(1, 'REKONTRA');
  assert.equal(game.state.kontraLevel, 'REKONTRA');
  // P0 daje subkontru
  game.kontra(0, 'SUBKONTRA');
  assert.equal(game.state.kontraLevel, 'SUBKONTRA');
  // P1 daje mortkontru
  game.kontra(1, 'MORTKONTRA');
  assert.equal(game.state.kontraLevel, 'MORTKONTRA');
  // Prebaci u PLAYING (mortkontra je kraj)
  assert.equal(game.state.phase, 'PLAYING');
});

test('e2e: Kontra + Moze — samo KONTRA data, nosilac Moze', () => {
  const game = new Game({ seed: 700 });
  game.newHand(0);
  game.bid(1, 5);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // P0 kontra
  game.kontra(0, 'KONTRA');
  // P1 moze
  game.moze(1);
  // Kraj kontra faze, PLAYING
  assert.equal(game.state.phase, 'PLAYING');
  assert.equal(game.state.kontraLevel, 'KONTRA');
});

test('e2e: Kontra — svi kažu Moze, nema kontre', () => {
  const game = new Game({ seed: 800 });
  game.newHand(0);
  game.bid(1, 5);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // P0 moze
  game.moze(0);
  // P2 moze
  game.moze(2);
  // Bez kontre, PLAYING
  assert.equal(game.state.phase, 'PLAYING');
  assert.equal(game.state.kontraLevel, null);
});

test('e2e: declareGame validacija — igra mora biti >= contract', () => {
  const game = new Game({ seed: 900 });
  game.newHand(0);
  game.bid(1, 5); // Contract 5 (Tref)
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  // Ne može Pik (2) jer je contract 5
  const ok = game.declareGame(1, 'Pik');
  assert.equal(ok, false);
  // Može Tref
  const ok2 = game.declareGame(1, 'Tref');
  assert.equal(ok2, true);
});

test('e2e: Betl — kontra NIJE dozvoljena', () => {
  const game = new Game({ seed: 1000 });
  game.newHand(0);
  game.bid(1, 5);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Betl');
  // Faza PLAYING odmah, ne KONTRA_DECLARING
  assert.equal(game.state.phase, 'PLAYING');
  // kontra() ne bi trebalo da radi
  const ok = game.kontra(0, 'KONTRA');
  assert.equal(ok, false);
});

test('e2e: Sans — kontra NIJE dozvoljena', () => {
  const game = new Game({ seed: 1100 });
  game.newHand(0);
  game.bid(1, 5);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Sans');
  // Faza FOLLOW_DECLARING (Sans ima praćenje ali nema kontru)
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // Posle praćenja, faza PLAYING (nema kontre)
  assert.equal(game.state.phase, 'PLAYING');
  // kontra ne bi trebalo da radi (phase = PLAYING, ne KONTRA_DECLARING)
  const ok = game.kontra(0, 'KONTRA');
  assert.equal(ok, false);
});

test('e2e: Kompletna partija sa igrama do kraja', () => {
  const game = new Game({ seed: 1200 });
  game.newHand(0);
  // Licitacija: P1 bid Tref
  game.bid(1, 5);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // KONTRA_DECLARING — oba kažu Moze
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.moze(0);
  game.moze(2);
  // Igraj 10 štihova
  assert.equal(game.state.phase, 'PLAYING');
  while (game.state.phase === 'PLAYING') {
    const player = game.state.currentPlayer;
    const legal = game.getLegalCards(player);
    if (legal.length === 0) break;
    const cardId = legal[0]!.id;
    if (!game.playCard(player, cardId)) break;
  }
  assert.equal(game.state.phase, 'GAME_OVER');
  const totalBule = game.state.bulas[0] + game.state.bulas[1] + game.state.bulas[2];
  assert.ok(totalBule >= 290 && totalBule <= 310, `Bule: ${game.state.bulas.join(', ')}`);
});

test('e2e: Igra-Karo — igrač ne uzima talon', () => {
  const game = new Game({ seed: 1300 });
  game.newHand(0);
  // P1 kaže "dalje", pa P2 igra Igra-Karo
  game.pass(1);
  game.igra(2, 'Igra-Karo');
  // P2 ima 10 karata (nije uzeo talon)
  assert.equal(game.state.players[2]!.hand.length, 10);
  // Talon netaknut
  assert.equal(game.state.talon.length, 2);
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
});

test('e2e: Discarting fails ako nisu dve različite karte', () => {
  const game = new Game({ seed: 1400 });
  game.newHand(0);
  game.bid(1, 5);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  // Istu kartu dva puta
  const ok1 = game.discard(1, [hand[0]!.id, hand[0]!.id]);
  assert.equal(ok1, false);
  // Nepostojeća karta
  const ok2 = game.discard(1, [hand[0]!.id, 'FAKE']);
  assert.equal(ok2, false);
});

test('e2e: currentPlayer određen ispravno posle declareGame', () => {
  const game = new Game({ seed: 1500 });
  game.newHand(0);
  game.bid(1, 4);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // KONTRA_DECLARING — oba Moze
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');
  // Po RULES.md, prvi igra onaj koji je prvi licitirao (bidStartPlayer)
  assert.equal(game.state.currentPlayer, 1);
});
