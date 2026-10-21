// Ogranicenja pratioca u pretrazi (aiSearch.ts defenderPlayFilter) — vaze i
// za racunare na serveru (searchChooseAction) i za igru u pregledacu
// (searchChoosePlayCard). Partije #9/#10, analiza 2026-10-21.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { searchChooseAction, searchChoosePlayCard } from '../src/aiSearch.ts';
import type { Card, Game as GameT, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));

// nosilac 1, oba pratioca dolaze, pa rucno namestene ruke; na potezu je pratilac 2
function playing(declared: GameT, p1: string, p2: string, p0: string): Game {
  const game = new Game({ seed: 4242 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const h = game.state.players[1]!.hand;
  game.discard(1, [h[0]!.id, h[1]!.id]);
  game.declareGame(1, declared);
  game.follow(2, 'DODJEM');
  game.follow(0, 'DODJEM');
  while (game.state.phase === 'KONTRA_DECLARING') {
    const a = game.getLegalActions().find((x) => x.type === 'moze');
    if (!a) break;
    game.moze(a.player);
  }
  assert.equal(game.state.phase, 'PLAYING');
  const s = game.state;
  s.players[1]!.hand = hand(p1);
  s.players[2]!.hand = hand(p2);
  s.players[0]!.hand = hand(p0);
  s.currentTrick = [];
  s.currentPlayer = 2 as Position;
  return game;
}

test('pratilac protiv Sansa otvara najdužu boju sa vrha (server i pregledač)', () => {
  const g = playing('Sans', 'A♠ K♠ Q♠ A♦ K♦ Q♦ A♣ K♣ 7♥ 8♥', 'K♥ Q♥ J♥ 9♥ 7♠ 8♠ 7♦ 8♦ 7♣ 8♣', 'A♥ 10♥ 9♠ 10♠ 9♦ 10♦ 9♣ 10♣ J♣ Q♣');
  const a = searchChooseAction(g.state, 2 as Position, 20);
  assert.equal(a.type === 'playCard' ? a.cardId : a.type, 'K♥');
  assert.equal(searchChoosePlayCard(g.state, 2 as Position, 20).id, 'K♥');
});

test('igra u pregledaču: pratilac bez tražene boje i aduta ne baca asa ni kralja', () => {
  for (let i = 0; i < 3; i++) {
    const g = playing('Herc', 'A♥ K♥ Q♥ J♥ 10♥ 9♥ 8♥ 10♦ 9♦', 'A♣ K♣ 7♣ A♦ K♦ 8♦ 7♦ A♠ 8♠ 7♠', 'Q♣ J♣ 10♣ 9♣ 8♣ K♠ Q♠ J♠ Q♦ J♦');
    const s = g.state;
    s.currentTrick = [{ player: 1 as Position, card: hand('7♥')[0]! }];
    const id = searchChoosePlayCard(s, 2 as Position, 20).id;
    assert.ok(!id.startsWith('A') && !id.startsWith('K'), `baca ${id}`);
  }
});

test('takmicenje Igra: pretraga proglasava igru po pravilima (partija #11, ruka 8: Igra-Tref)', () => {
  const g = new Game({ seed: 77 });
  g.newHand(1);
  const s = g.state;
  s.players[2]!.hand = hand('A♣ K♣ Q♣ 10♣ A♥ J♥ 8♥ A♦ J♦ 7♦');
  s.players[0]!.hand = hand('9♣ 8♣ 7♣ K♥ Q♥ 10♥ 9♥ 9♠ K♦ 8♦');
  s.players[1]!.hand = hand('7♥ A♠ K♠ Q♠ J♠ 10♠ 7♠ Q♦ 10♦ 9♦');
  s.talon = hand('8♠ J♣');
  // Bora (2) igra, Antonije (0) dalje, Milan (1) igra
  for (let i = 0; i < 6 && s.phase === 'BIDDING'; i++) {
    const p = g.state.currentBidder;
    if (p === 0) g.pass(0); else g.sayIgra(p);
  }
  assert.equal(g.state.phase, 'DECLARING');
  assert.notEqual(g.state.igraCompetitors, null);
  if (g.state.currentBidder === 1) g.declareIgra(1, 'Igra-Pik');
  const a = searchChooseAction(g.state, 2 as Position, 20);
  assert.equal(a.type === 'declare' ? a.game : a.type, 'Igra-Tref');
});
