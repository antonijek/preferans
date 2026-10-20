// Ko vodi prvi stih (RULES 8.1). Korisnik 2026-10-20: "ako ja odigravam
// uvijek ja pocinjem da bacam karte" — u adutskim igrama i betlu vodi igrac
// koji je PRVI NA REDU u licitaciji (posle delioca), ne nosilac.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';

function toPlay(game: Game, declarer: 0 | 1 | 2, follow: Record<number, 'DODJEM' | 'NE_DODJEM'>) {
  const hand = game.state.players[declarer]!.hand;
  game.discard(declarer, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(declarer, 'Herc');
  for (const p of [0, 1, 2]) if (p !== declarer && game.state.phase === 'FOLLOW_DECLARING' && follow[p]) game.follow(p as 0 | 1 | 2, follow[p]!);
  while (game.state.phase === 'KONTRA_DECLARING') {
    const a = game.getLegalActions().find((x) => x.type === 'moze');
    if (!a) break;
    game.moze(a.player);
  }
}

test('prvi na redu je rekao "dalje", drugi je nosilac — prvi stih ipak vodi prvi na redu', () => {
  const game = new Game({ seed: 77 });
  game.newHand(0); // licitira prvi igrac 1
  game.pass(1);
  game.bid(2, 2);
  game.pass(0);
  toPlay(game, 2, { 0: 'DODJEM', 1: 'DODJEM' });
  assert.equal(game.state.phase, 'PLAYING');
  assert.equal(game.state.currentPlayer, 1);
});

test('nosilac je prvi na redu — on vodi', () => {
  const game = new Game({ seed: 78 });
  game.newHand(2); // licitira prvi igrac 0
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  toPlay(game, 0, { 1: 'DODJEM', 2: 'DODJEM' });
  assert.equal(game.state.phase, 'PLAYING');
  assert.equal(game.state.currentPlayer, 0);
});

test('prvi na redu ne dolazi i nije zvan — vodi sledeci aktivni posle njega', () => {
  const game = new Game({ seed: 79 });
  game.newHand(0); // licitira prvi igrac 1
  game.pass(1);
  game.bid(2, 2);
  game.pass(0);
  toPlay(game, 2, { 0: 'DODJEM', 1: 'NE_DODJEM' });
  if (game.state.phase === 'FOLLOW_DECLARING') game.continueWithoutCall();
  while (game.state.phase === 'KONTRA_DECLARING') {
    const a = game.getLegalActions().find((x) => x.type === 'moze');
    if (!a) break;
    game.moze(a.player);
  }
  assert.equal(game.state.phase, 'PLAYING');
  // 1 ne igra; posle 1 dolazi 2 (nosilac), pa on vodi
  assert.equal(game.state.currentPlayer, 2);
});
