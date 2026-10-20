// "Nosim sve stihove do kraja" (claim.ts + Game.claimRemainingTricks).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { claimIsCertain } from '../src/claim.ts';
import type { Card, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));

// Herc, nosilac 1, oba pratioca dolaze; ostaju 2 stiha, nosilac vodi
function endgame(declarerCards: string, p2: string, p0: string): Game {
  const game = new Game({ seed: 4242 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const h = game.state.players[1]!.hand;
  game.discard(1, [h[0]!.id, h[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(2, 'DODJEM');
  game.follow(0, 'DODJEM');
  while (game.state.phase === 'KONTRA_DECLARING') {
    const a = game.getLegalActions().find((x) => x.type === 'moze');
    if (!a) break;
    game.moze(a.player);
  }
  const s = game.state;
  s.players[1]!.hand = hand(declarerCards);
  s.players[2]!.hand = hand(p2);
  s.players[0]!.hand = hand(p0);
  s.players[1]!.tricksWon = 6;
  s.players[2]!.tricksWon = 1;
  s.players[0]!.tricksWon = 1;
  s.trickCount = 8;
  s.currentTrick = [];
  s.currentPlayer = 1 as Position;
  return game;
}

test('tvrdnja je sigurna kad nosilac drzi najjace adute', () => {
  const g = endgame('A♥ K♥', '7♠ 8♠', '9♦ 10♦');
  assert.equal(claimIsCertain(g.state, 1 as Position), true);
});

test('tvrdnja nije sigurna kad pratilac moze da uzme stih', () => {
  const g = endgame('A♠ 7♠', 'K♠ 8♠', '9♦ 10♦');
  assert.equal(claimIsCertain(g.state, 1 as Position), false);
});

test('pratilac moze da tvrdi samo za sebe — nosilac sa adutima ga sece', () => {
  const g = endgame('A♥ K♥', 'A♠ K♠', '9♦ 10♦');
  g.state.currentPlayer = 2 as Position;
  assert.equal(claimIsCertain(g.state, 2 as Position), false);
});

test('prihvacena tvrdnja dodeljuje sve preostale stihove i zavrsava ruku', () => {
  const g = endgame('A♥ K♥', '7♠ 8♠', '9♦ 10♦');
  assert.equal(g.claimRemainingTricks(1 as Position), true);
  assert.equal(g.state.players[1]!.tricksWon, 8);
  assert.equal(g.state.claimedBy, 1);
  assert.notEqual(g.state.phase, 'PLAYING');
});

test('tvrdnja nije dozvoljena usred stiha', () => {
  const g = endgame('A♥ K♥', '7♠ 8♠', '9♦ 10♦');
  g.playCard(1 as Position, 'A♥');
  assert.equal(g.claimRemainingTricks(1 as Position), false);
});

// uzivo (lokalna proba 2026-10-20): 8 najjacih aduta protiv bacanja — pretraga
// bez skracivanja nije stizala do kraja i racunar je odbijao tacnu tvrdnju
function fullEndgame(): Game {
  const g = endgame('A♥ K♥', '7♠ 8♠', '9♦ 10♦');
  const s = g.state;
  s.players[1]!.hand = hand('A♥ K♥ Q♥ J♥ 10♥ 9♥ 8♥ 7♥');
  s.players[2]!.hand = hand('A♠ K♠ Q♠ 9♠ A♦ K♦ 9♦ 8♦');
  s.players[0]!.hand = hand('J♠ 10♠ 8♠ 7♠ A♣ K♣ Q♦ J♦');
  s.players[1]!.tricksWon = 2;
  s.players[2]!.tricksWon = 0;
  s.players[0]!.tricksWon = 0;
  s.trickCount = 2;
  return g;
}

test('8 najjačih aduta: tvrdnja je sigurna i proverava se brzo', () => {
  const g = fullEndgame();
  const t = Date.now();
  assert.equal(claimIsCertain(g.state, 1 as Position), true);
  assert.ok(Date.now() - t < 500, `trajalo ${Date.now() - t} ms`);
});

test('bez jednog aduta (ima ga pratilac) tvrdnja nije sigurna', () => {
  const g = fullEndgame();
  g.state.players[1]!.hand = hand('A♥ K♥ Q♥ J♥ 10♥ 9♥ 8♥ 7♣');
  g.state.players[0]!.hand = hand('J♠ 10♠ 8♠ 7♥ A♣ K♣ Q♦ J♦');
  assert.equal(claimIsCertain(g.state, 1 as Position), false);
});
