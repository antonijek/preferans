// Granice za pretragu i pravila iz korisnikove partije #10 (2026-10-20):
// "sans katastrofa igraju", "skartavaju asa", "igra malog aduta kroz mene".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { searchChooseAction } from '../src/aiSearch.ts';
import { chooseDeclareGame } from '../src/aiBidding.ts';
import { chooseFollow } from '../src/aiFollowKontra.ts';
import type { Card, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));

test('pravila: Sans nikad sa praznom bojom', () => {
  // jaka ruka bez ijednog herca — ranije bi Sans dobio najvise stihova
  const g = chooseDeclareGame(hand('A♠ K♠ Q♠ J♠ A♦ K♦ Q♦ A♣ K♣ Q♣'), 2);
  assert.notEqual(g, 'Sans');
});

// Herc, nosilac 1, oba pratioca dolaze — pa rucno namestene ruke i stih
function playingGame(): Game {
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
  assert.equal(game.state.phase, 'PLAYING');
  return game;
}

test('pretraga: pratilac koji nema boju ni adut ne baca asa ni kralja', () => {
  for (let i = 0; i < 5; i++) {
    const game = playingGame();
    const s = game.state;
    s.players[1]!.hand = hand('A♥ K♥ Q♥ J♥ 10♥ 9♥ 8♥ 7♥ 10♦ 9♦');
    s.players[2]!.hand = hand('A♣ K♣ 7♣ A♦ K♦ 8♦ 7♦ A♠ 8♠ 7♠');
    s.players[0]!.hand = hand('Q♣ J♣ 10♣ 9♣ 8♣ K♠ Q♠ J♠ Q♦ J♦');
    s.currentTrick = [{ player: 1 as Position, card: hand('7♥')[0]! }];
    s.players[1]!.hand = s.players[1]!.hand.filter((c) => c.id !== '7♥');
    s.currentPlayer = 2 as Position;
    const a = searchChooseAction(s, 2 as Position, 30);
    assert.equal(a.type, 'playCard');
    const id = a.type === 'playCard' ? a.cardId : '';
    assert.ok(!id.startsWith('A') && !id.startsWith('K'), `baca ${id}`);
  }
});

test('pretraga: pratilac na potezu ne vodi adut kad ima drugu boju', () => {
  for (let i = 0; i < 5; i++) {
    const game = playingGame();
    const s = game.state;
    s.players[1]!.hand = hand('A♥ K♥ Q♥ J♥ 10♥ 9♠ 8♠ 7♠ 10♦ 9♦');
    s.players[2]!.hand = hand('9♥ 8♥ 7♣ 8♣ 9♣ 7♦ 8♦ J♠ 10♠ Q♠');
    s.players[0]!.hand = hand('7♥ A♣ K♣ Q♣ J♣ 10♣ K♠ A♠ A♦ K♦');
    s.currentTrick = [];
    s.currentPlayer = 2 as Position;
    const a = searchChooseAction(s, 2 as Position, 30);
    const id = a.type === 'playCard' ? a.cardId : '';
    assert.ok(!id.endsWith('♥'), `vodi ${id}`);
  }
});


test('pratnja: kralj sa malim kartama nije stih (korisnik: ruke 17 i 83 — ne bih dosao)', () => {
  assert.equal(chooseFollow({ hand: hand('K♣ 7♣ 10♥ 9♥ 8♥ Q♠ J♠ 9♠ K♦ 7♦'), declaredGame: 'Herc' }), 'NE_DODJEM');
  assert.equal(chooseFollow({ hand: hand('K♣ 9♣ 7♣ 7♥ Q♠ 10♠ 8♠ 7♠ K♦ 7♦'), declaredGame: 'Herc' }), 'NE_DODJEM');
  // A,K iste boje i dalje vredi
  assert.equal(chooseFollow({ hand: hand('A♠ K♠ 9♠ 7♣ 8♣ 9♦ 8♦ 7♦ J♣ 10♣'), declaredGame: 'Herc' }), 'DODJEM');
});

test('pratnja protiv Sansa: K,D i K,D,10,9 u dve boje = dolazim (korisnik, ruka 21)', () => {
  assert.equal(chooseFollow({ hand: hand('J♣ K♥ Q♥ K♠ Q♠ 10♠ 9♠ K♦ J♦ 8♦'), declaredGame: 'Sans' }), 'DODJEM');
});
