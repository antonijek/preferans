// Testovi za refe mehanizam (RULES.md sekcija 7)
// + IGRA tok (RULES.md sekcija 3.4)
//
// - IGRA bidding je samo "Igra" (bez konkretne igre). Konkretna Igra-X proglašava se na kraju.
// - Refa se automatski koristi (nema useRefe/skipRefe javne metode).
// - RULES 7.1/7.3: "svi kažu dalje" (ili Pik bez kontre sa slobodnom refom)
//   samo NAORUŽAVA refe-multiplikator (refeUsed=true) za SLEDEĆU (upravo
//   podeljenu) ruku — refeCount se NE menja u tom trenutku. Tek POSLE
//   odigrane ruke pod refeom, NOSILAC TE ruke otpisuje JEDAN svoj refe.
//   Uzivo prijavljen bag: ranije je postojala petlja koja je odmah upisivala
//   refe SVA TRI igraca (i refeUsed nikad nije bio postavljen na true, pa
//   ceo x2 multiplikator NIKAD nije ni radio) — "iskorišćene refe svima piše
//   1/2 iako je samo Istok odigrao posle refe".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';

test('igra tok: sayIgra samo reč, winner mora proglašavati', () => {
  const game = new Game({ seed: 999 });
  game.newHand(0);
  // P1 pass, P2 kaže Igra
  game.pass(1);
  game.sayIgra(2);
  // Phase treba biti BIDDING (winner nije postavljen, winnerGame = null)
  assert.equal(game.state.phase, 'BIDDING');
  assert.equal(game.state.igraPlayer, 2);
  assert.equal(game.state.winner, null);
  assert.equal(game.state.winnerGame, null);
  // P0 treba da odluči
  assert.equal(game.state.currentBidder, 0);
  // Ako P0 kaže "dalje" (pass) — winner postaje P2 (igraPlayer)
  game.pass(0);
  assert.equal(game.state.winner, 2);
  assert.equal(game.state.phase, 'DECLARING');
  // Winner sada proglašava
  const ok = game.declareIgra('Igra-Karo');
  assert.equal(ok, true);
  assert.equal(game.state.winnerGame, 'Igra-Karo');
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
});

test('igra tok: bidding winner logika ne postavlja winner prerano', () => {
  const game = new Game({ seed: 1002 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  // Svi passed → ruka se poništava, nova ruka (BIDDING), pod refeom
  assert.equal(game.state.phase, 'BIDDING');
  assert.equal(game.state.refeOccurred, true);
  // RefeCount se NE menja odmah — trosi ga tek NOSILAC sledece ruke, kad se
  // ona zavrsi (RULES 7.3). Ovde jos niko nije ni licitirao za novu ruku.
  assert.equal(game.state.refeCount.join(','), '0,0,0');
  assert.equal(game.state.refeUsed, true, 'nova ruka je NAORUZANA refe-multiplikatorom');
});

test('refe: handleRefe automatski — naoruzava refeUsed za sledecu ruku, refeCount se NE menja odmah', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  // Svi kažu dalje
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refeOccurred, true);
  assert.equal(game.state.refeCount.join(','), '0,0,0');
  assert.equal(game.state.refeUsed, true);
  // Nova ruka, bidding
  assert.equal(game.state.phase, 'BIDDING');
});

test('refe: posle "svi dalje", NOSILAC sledece ruke otpisuje TACNO JEDAN svoj refe kad se ona zavrsi (RULES 7.3)', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refeUsed, true);
  assert.equal(game.state.refeCount.join(','), '0,0,0');

  // Sledeca ruka se igra normalno — P1 pobedjuje licitaciju i postaje nosilac
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  game.state.players[1]!.tricksWon = 7; // nosilac prolazi
  game.state.players[0]!.tricksWon = 2;
  game.state.players[2]!.tricksWon = 1;
  const result = game.endHand();

  // SAMO P1 (nosilac te ruke) je potrosio refu — P0 i P2 su i dalje na 0.
  assert.equal(game.state.refeCount.join(','), '0,1,0', 'samo nosilac (P1) trosi refu, ne sva trojica');
  // Refe-multiplikator (x2) je stvarno bio aktivan — bula nosioca je -16
  // (Herc 8 * refe 2), ne -8 kao bez refe.
  assert.equal(result.bulas[1], 100 - 16, 'bula pod refeom je DUPLIRANA (8*2)');
});

test('refe: Pik bez kontre + neko u šeširu → regularan prolaz bez igranja (RULES 7.1.1)', () => {
  const game = new Game({ seed: 200, refePerPlayer: 2 });
  game.state.bulas = [-10, 100, 100]; // P0 u šeširu
  game.newHand(0);
  game.bid(1, 2); // Pik
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  const bulasBefore = [...game.state.bulas];
  game.moze(0);
  game.moze(2);
  // Ide direktno u GAME_OVER bez igranja karata — regularan prolaz, bez množenja
  assert.equal(game.state.phase, 'GAME_OVER');
  assert.equal(game.state.bulas[1], bulasBefore[1]! - 2 * 2);
  assert.equal(game.state.refeCount[1], 0, 'refe se nije trošio u ovom slučaju');
});

test('refe: Pik bez kontre + nosilac ima slobodnu refu → refe (RULES 7.1.1)', () => {
  const game = new Game({ seed: 210, refePerPlayer: 2 });
  game.newHand(0);
  game.bid(1, 2); // Pik
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(0);
  game.moze(2);
  // Refa se koristi (kao "svi kazu dalje"), nova ruka, bule nepromenjene.
  // RefeCount se ne menja odmah (RULES 7.3 — trosi ga tek nosilac SLEDECE
  // ruke kad se ona zavrsi), ali refeUsed je naoruzan za tu novu ruku.
  assert.equal(game.state.phase, 'BIDDING');
  assert.equal(game.state.refeCount.join(','), '0,0,0');
  assert.equal(game.state.refeUsed, true);
});

test('refe: Pik bez kontre, nosilac bez slobodne refe, niko u šeširu → ruka se poništava (RULES 7.1.1)', () => {
  const game = new Game({ seed: 220, refePerPlayer: 0 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  const bulasBefore = [...game.state.bulas];
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'BIDDING'); // nova ruka
  assert.equal(game.state.refeCount.join(','), '0,0,0'); // ali bez refe
  assert.deepEqual(game.state.bulas, bulasBefore);
});

test('refe: refeCount per-player konfigurabilan', () => {
  const game = new Game({ seed: 1, refePerPlayer: 3 });
  assert.equal(game.refePerPlayer, 3);
});