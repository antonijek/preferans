// Granice za pretragu i pravila iz korisnikove partije #10 (2026-10-20):
// "sans katastrofa igraju", "skartavaju asa", "igra malog aduta kroz mene".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { searchChooseAction } from '../src/aiSearch.ts';
import { chooseDeclareGame } from '../src/aiBidding.ts';
import { chooseFollow, chooseKontra, chooseCallOrAlone } from '../src/aiFollowKontra.ts';
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


// korisnik 2026-10-21: "K i mala se racuna kao stih kao pratilac, ali treba
// 3 rezona da bi dosao, a ne 2 — jer vecinom jedan rezon sece nosilac"
test('pratnja u adutu: 2 rezona = ne dođem (ruke 17 i 83), 3 rezona = dođem', () => {
  assert.equal(chooseFollow({ hand: hand('K♣ 7♣ 10♥ 9♥ 8♥ Q♠ J♠ 9♠ K♦ 7♦'), declaredGame: 'Herc' }), 'NE_DODJEM');
  assert.equal(chooseFollow({ hand: hand('K♣ 9♣ 7♣ 7♥ Q♠ 10♠ 8♠ 7♠ K♦ 7♦'), declaredGame: 'Herc' }), 'NE_DODJEM');
  assert.equal(chooseFollow({ hand: hand('A♠ K♠ 9♠ 7♣ 8♣ 9♦ 8♦ 7♦ J♣ 10♣'), declaredGame: 'Herc' }), 'NE_DODJEM');
  // K i mala u dve boje + as u trecoj = 3 rezona
  assert.equal(chooseFollow({ hand: hand('K♣ 7♣ 8♣ K♦ 7♦ A♠ 9♠ 7♠ 8♥ 7♥'), declaredGame: 'Herc' }), 'DODJEM');
  // A,K u kratkoj boji je jedan rezon: "ovdje su samo 2 rezona, pik i tref"
  assert.equal(chooseFollow({ hand: hand('A♠ K♠ 7♠ A♣ 9♣ 8♣ 10♥ 9♥ 8♥ 8♦'), declaredGame: 'Karo' }), 'NE_DODJEM');
  // A,K,D je jedan rezon sa 2 stiha — uz A tref to su 2 rezona, a samo jedan
  // sa 2 stiha (korisnik 2026-10-24: "na 2 rezona ne dolazis osim ako u oba
  // imas po 2 stiha")
  assert.equal(chooseFollow({ hand: hand('A♠ K♠ Q♠ A♣ 9♣ 8♣ 10♥ 9♥ 8♥ 8♦'), declaredGame: 'Karo' }), 'NE_DODJEM');
});

test('pratnja: Pik i Sans ostaju po starom pravilu (korisnik 2026-10-21)', () => {
  // Pik: 2 asa su dovoljna
  assert.equal(chooseFollow({ hand: hand('A♣ 7♣ 8♣ A♦ 7♦ 9♦ 8♥ 7♥ 9♥ 7♠'), declaredGame: 'Pik' }), 'DODJEM');
  // Sans: 2 rezona u 2 boje
  assert.equal(chooseFollow({ hand: hand('A♣ 7♣ 8♣ A♦ 7♦ 9♦ 8♥ 7♥ 9♥ 7♠'), declaredGame: 'Sans' }), 'DODJEM');
});

test('pratnja protiv Sansa: K,D i K,D,10,9 u dve boje = dolazim (korisnik, ruka 21)', () => {
  assert.equal(chooseFollow({ hand: hand('J♣ K♥ Q♥ K♠ Q♠ 10♠ 9♠ K♦ J♦ 8♦'), declaredGame: 'Sans' }), 'DODJEM');
});

// korisnikovi odgovori na konkretne ruke (2026-10-21)
test('pratnja: korisnikovi odgovori — duga boja, D,J,10, secenje', () => {
  const f = (h: string, g: 'Herc' | 'Tref' | 'Karo') => chooseFollow({ hand: hand(h), declaredGame: g });
  assert.equal(f('A♠ 9♠ 8♠ 7♠ K♣ 8♣ A♦ 10♦ 7♦ 9♥', 'Herc'), 'DODJEM'); // as bez kralja u dugoj boji
  assert.equal(f('A♠ K♠ 8♠ 7♠ A♣ 9♣ 10♦ 9♦ 8♦ 7♥', 'Herc'), 'NE_DODJEM'); // A,K,x,x: nosilac tu nema boju
  assert.equal(f('Q♠ J♠ 10♠ A♣ 8♣ 7♣ K♥ 7♥ 9♦ 8♦', 'Karo'), 'DODJEM'); // D,J,10
  assert.equal(f('J♣ 9♣ 7♣ A♠ 10♠ 8♠ 7♠ K♦ 9♦ 8♦', 'Tref'), 'NE_DODJEM'); // "na granici"
  assert.equal(f('Q♣ 9♣ 7♣ A♠ 10♠ 8♠ 7♠ K♦ 9♦ 8♦', 'Tref'), 'DODJEM'); // "sa damom sigurno"
});

test('kontra: drugi pratilac nije dosao, 3 aduta = bez kontre (korisnik 2026-10-21)', () => {
  const k = chooseKontra({ hand: hand('K♥ Q♥ 9♥ A♠ K♠ 8♠ A♣ 7♣ 10♦ 9♦'), trump: '♥', currentLevel: 0, partnerCame: false });
  assert.equal(k, 'MOZE');
  // a kad su dosla oba, 4 aduta = kontra
  assert.equal(chooseKontra({ hand: hand('K♥ Q♥ 9♥ 8♥ A♠ 9♠ 10♣ 8♣ 7♣ J♦'), trump: '♥', currentLevel: 0, partnerCame: true }), 'KONTRA');
});

test('poziv: zovi kad je drugi licitacijom pokazao boju koju ja nemam (korisnik 2026-10-21)', () => {
  const call = (h: string, partnerBidLevel: number) => chooseCallOrAlone({ callerHand: hand(h), partnerBidLevel, declaredGame: 'Herc' });
  assert.equal(call('A♠ K♠ Q♠ A♣ K♣ 8♣ 9♦ 8♦ 9♥ 8♥', 3), 'CALL'); // on stao na 3 = karo, ja 9,8 karo
  assert.equal(call('A♠ 8♠ 7♠ K♣ 9♣ 10♦ 8♦ 7♦ 9♥ 8♥', 3), 'ALONE'); // i ja imam 3 karoa
  assert.equal(call('A♠ K♠ Q♠ A♣ K♣ 8♣ A♦ 9♦ 9♥ 8♥', 0), 'ALONE'); // on nije licitirao
});

// partija #11 (2026-10-21), korisnikovi odgovori
test('partija #11: K,D,10 u adutu = 2 stiha (ruka 6), A,K,J,10,8 protiv Sansa (ruka 3)', () => {
  assert.equal(chooseFollow({ hand: hand('K♥ Q♥ 10♥ A♠ 8♠ Q♣ J♣ 9♣ Q♦ 7♦'), declaredGame: 'Herc' }), 'DODJEM');
  assert.equal(chooseFollow({ hand: hand('A♥ K♥ J♥ 10♥ 8♥ K♦ J♦ 10♦ 9♣ 7♣'), declaredGame: 'Sans' }), 'DODJEM');
});
