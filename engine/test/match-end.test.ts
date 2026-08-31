// Testovi za RULES.md 9.1/9.1.1 — kraj CELE partije (ne samo jedne ruke) kad
// zbir bula svih igrača dostigne TAČNO 0, uključujući "capovanje" ruke koja
// bi inače prevazišla cilj. Uzivo prijavljen bag: "partija ne moze da se
// zavrsi" — ranije nista nije ni proveravalo zbir bula.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';

test('match-end: normalna ruka koja ne dovodi zbir blizu 0 -> GAME_OVER (ruka), partija se nastavlja', () => {
  const game = new Game({ seed: 1 }); // podrazumevano 100/100/100, zbir=300
  game.newHand(0);
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
  game.state.players[1]!.tricksWon = 6;
  game.state.players[0]!.tricksWon = 2;
  game.state.players[2]!.tricksWon = 2;
  const result = game.endHand();
  assert.equal(game.state.phase, 'GAME_OVER', 'samo kraj RUKE, partija se nastavlja');
  assert.notEqual(result.bulas[0] + result.bulas[1] + result.bulas[2], 0);
});

test('match-end: rucno postavljen tacan korisnikov primer — [10,2,-6], Tref, nosilac prolazi (6 stihova), pratioci na pragu (2/2) -> capovano na TACNO 6, MATCH_OVER', () => {
  const game = new Game({ seed: 1 });
  game.state.bulas = [10, 2, -6]; // zbir = 6
  game.newHand(2); // prvi bidder P0
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  const hand = game.state.players[0]!.hand;
  game.discard(0, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(0, 'Tref'); // vrednost 5, osnovica bule = 10
  game.follow(1, 'DODJEM');
  game.follow(2, 'DODJEM');
  const expected1 = game.expectedKontraPlayerPublic()!;
  game.moze(expected1);
  const expected2 = game.expectedKontraPlayerPublic()!;
  game.moze(expected2);
  assert.equal(game.state.phase, 'PLAYING');

  game.state.players[0]!.tricksWon = 6; // tacno prag za Tref -> prolazi
  game.state.players[1]!.tricksWon = 2; // na pragu, bez promene bule
  game.state.players[2]!.tricksWon = 2; // na pragu, bez promene bule
  const result = game.endHand();

  assert.equal(result.bulas[0], 4, 'nosilac pada za TACNO 6 (ne punih 10) — 10-6=4');
  assert.equal(result.bulas[1], 2, 'P1 bez promene (na pragu)');
  assert.equal(result.bulas[2], -6, 'P2 bez promene (na pragu)');
  assert.equal(result.bulas[0] + result.bulas[1] + result.bulas[2], 0, 'zbir sleti TACNO na 0');
  assert.equal(game.state.phase, 'MATCH_OVER', 'cela partija je gotova, ne samo ruka');
  // Supe pratilaca racunate sa ISTOM efektivnom (capovanom) vrednoscu 6,
  // ne punih 10: 2 stiha * 6 = 12 (umesto 2*10=20).
  assert.equal(result.supeDelta[1], 12, 'supa P1 capovana (2*6=12, ne 2*10=20)');
  assert.equal(result.supeDelta[2], 12, 'supa P2 capovana (2*6=12, ne 2*10=20)');
});

test('match-end: ruka koja odvodi zbir DALJE od 0 (naviše) -> BEZ capovanja, partija se nastavlja', () => {
  // "Ako padne onda zbir vise nije 6, partija se produzava" — nosilac PADA
  // (bula raste), pratioci ispod praga (bula im TAKODJE raste, nezavisno) —
  // zbir se udaljava od 0, nema capovanja niti kraja partije.
  const game = new Game({ seed: 1 });
  game.state.bulas = [10, 2, -6]; // zbir = 6
  game.newHand(2);
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  const hand = game.state.players[0]!.hand;
  game.discard(0, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(0, 'Tref');
  game.follow(1, 'DODJEM');
  game.follow(2, 'DODJEM');
  const expected1 = game.expectedKontraPlayerPublic()!;
  game.moze(expected1);
  const expected2 = game.expectedKontraPlayerPublic()!;
  game.moze(expected2);

  game.state.players[0]!.tricksWon = 3; // ispod praga (6) -> PADA
  game.state.players[1]!.tricksWon = 0; // ispod praga -> RASTE
  game.state.players[2]!.tricksWon = 0; // ispod praga -> RASTE
  const result = game.endHand();

  const sumAfter = result.bulas[0] + result.bulas[1] + result.bulas[2];
  assert.ok(sumAfter > 6, `zbir se udaljio od cilja (bio 6, sad ${sumAfter}), ne priblizio`);
  assert.equal(game.state.phase, 'GAME_OVER', 'partija se NASTAVLJA (nije MATCH_OVER)');
});

test('match-end: zbir sleti TACNO na 0 bez potrebe za capovanjem (srecno poklapanje)', () => {
  const game = new Game({ seed: 1 });
  game.state.bulas = [14, 2, -6]; // zbir = 10, tacno kolika je osnovica Tref bule
  game.newHand(2);
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  const hand = game.state.players[0]!.hand;
  game.discard(0, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(0, 'Tref');
  game.follow(1, 'DODJEM');
  game.follow(2, 'DODJEM');
  const expected1 = game.expectedKontraPlayerPublic()!;
  game.moze(expected1);
  const expected2 = game.expectedKontraPlayerPublic()!;
  game.moze(expected2);

  game.state.players[0]!.tricksWon = 6;
  game.state.players[1]!.tricksWon = 2;
  game.state.players[2]!.tricksWon = 2;
  const result = game.endHand();

  assert.equal(result.bulas[0], 4, 'puna vrednost (10) se tacno poklapa sa preostalim prostorom, nema capovanja');
  assert.equal(result.bulas[0] + result.bulas[1] + result.bulas[2], 0);
  assert.equal(game.state.phase, 'MATCH_OVER');
  assert.equal(result.supeDelta[1], 20, 'supe NISU capovane (puna vrednost se vec tacno poklopila)');
});

test('match-end: "niko ne prati" na ne-Pik igri takodje capuje ako bi prevazisla cilj', () => {
  const game = new Game({ seed: 1 });
  game.state.bulas = [10, 2, -6]; // zbir = 6
  game.newHand(2);
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  const hand = game.state.players[0]!.hand;
  game.discard(0, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(0, 'Tref'); // osnovica bule = 10, ali samo 6 "prostora"
  const bulasBefore = [...game.state.bulas];
  game.follow(1, 'NE_DODJEM');
  game.follow(2, 'NE_DODJEM');
  // RULES 5.4, ne-Pik: prost automatski prolaz -igra*2, capovan na dostupan prostor.
  assert.equal(game.state.phase, 'MATCH_OVER');
  assert.equal(game.state.bulas[0], bulasBefore[0]! - 6, 'capovano na 6, ne punih 10');
  assert.equal(game.state.bulas[0] + game.state.bulas[1] + game.state.bulas[2], 0);
});
