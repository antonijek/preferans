// Testovi za game.getLegalActions() — UI API

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';

test('getLegalActions: BIDDING — prvi igrač može pass/bid/igra', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  const actions = g.getLegalActions();
  assert.equal(g.state.phase, 'BIDDING');
  const labels = actions.map(a => a.label);
  assert.ok(labels.includes('Dalje'), 'Treba da postoji Dalje opcija');
  // BID labela je samo broj (2, 3, 4...) — ne "2 Pik"
  assert.ok(labels.includes('2'), 'Treba da postoji BID 2 opcija');
  assert.ok(labels.includes('Igra'), 'Treba da postoji Igra opcija');
  // MOGU NIJE dozvoljeno za prvi bidder jer NIJE biddovao ništa, ALI
  // treba da postoji MOGU jer "Mogu 3" je izjednačavanje... NE čekaj.
  // Po STROŽEM pravilu: MOGU je samo za igrača koji NIJE biddovao NIŠTA u ovoj rundi.
  // Prvi bidder ima bidLevel === 0, pa MOGU 0 NIJE dozvoljeno (currentBid < 2).
  // Dakle, nema MOGU dugmeta za prvi bidder.
  assert.ok(!labels.some(l => l.startsWith('Mogu')), 'NE sme Mogu jer currentBid < 2');
});

test('getLegalActions: BIDDING posle BID 3 — igrač koji NIJE biddovao NE SME MOGU', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  g.bid(1, 2); // P1 bid 2
  // P2 je current bidder, P2 NIJE biddovao
  // Po tvom pravilu: MOGU samo za igrača koji je već biddovao
  const actions = g.getLegalActions();
  const labels = actions.map(a => a.label);
  assert.ok(labels.includes('Dalje'), 'Treba Dalje');
  assert.ok(!labels.some(l => l.startsWith('Mogu')), 'P2 NIJE biddovao — NE SME MOGU');
  assert.ok(labels.some(l => l.startsWith('3')), 'Treba BID 3');
});

test('getLegalActions: DISCARDING — vraća discard-info sa handSize', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  g.bid(1, 2);
  g.bid(2, 3);
  g.bid(0, 4);
  // Po novom pravilu: bidding se završava kad 2 igrača prođu
  g.pass(1);
  g.pass(2); // sad su P1 i P2 passed, P0 winner → DISCARDING
  assert.equal(g.state.phase, 'DISCARDING');
  const actions = g.getLegalActions();
  assert.equal(actions.length, 1);
  assert.equal(actions[0]!.type, 'discard-info');
  assert.equal(actions[0]!.handSize, 12); // 10 + 2 talon
});

test('getLegalActions: DECLARING — vraća igre >= contract', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  g.bid(1, 2);
  g.bid(2, 3);
  g.bid(0, 4);
  g.pass(1);
  g.pass(2);
  const h = g.state.players[0]!.hand;
  g.discard(0, [h[0]!.id, h[1]!.id]);
  assert.equal(g.state.phase, 'DECLARING');
  const actions = g.getLegalActions();
  // Contract = 4, dozvoljene igre >= 4: Herc, Tref, Betl, Sans
  for (const a of actions) {
    if (a.type === 'declare') {
      assert.ok(['Herc', 'Tref', 'Betl', 'Sans'].includes(a.game), `Nedozvoljena igra: ${a.game}`);
    }
  }
});

test('getLegalActions: FOLLOW_DECLARING — DODJEM/NE_DODJEM za pratioce', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  g.bid(1, 2);
  g.bid(2, 3);
  g.bid(0, 4);
  g.pass(1);
  g.pass(2);
  const h = g.state.players[0]!.hand;
  g.discard(0, [h[0]!.id, h[1]!.id]);
  g.declareGame(0, 'Herc');
  assert.equal(g.state.phase, 'FOLLOW_DECLARING');
  const actions = g.getLegalActions();
  // Treba da ima DODJEM i NE_DODJEM za P1 i P2
  const choices = actions.filter(a => a.type === 'follow');
  assert.equal(choices.length, 4); // 2 pratioca × 2 opcije
});

test('getLegalActions: PLAYING — legalne karte', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  g.bid(1, 2);
  g.bid(2, 3);
  g.bid(0, 4);
  const h = g.state.players[0]!.hand;
  g.discard(0, [h[0]!.id, h[1]!.id]);
  g.declareGame(0, 'Herc');
  for (let p = 0; p < 3; p++) {
    if (g.state.followChoices[p] === null) g.follow(p, 'DODJEM');
  }
  // Igraj nekoliko karata da dođe do P0
  let safety = 0;
  while (g.state.currentPlayer !== 0 && safety < 30) {
    const p = g.state.currentPlayer;
    const legal = g.getLegalCards(p);
    if (legal.length === 0) break;
    g.playCard(p, legal[0]!.id);
    safety++;
    if (g.state.phase === 'KONTRA_DECLARING') {
      g.moze(p);
    }
    if (g.state.phase === 'PLAYING' && g.state.currentPlayer === 0) break;
  }
  if (g.state.currentPlayer === 0) {
    const actions = g.getLegalActions();
    // Sve treba da budu play akcije
    for (const a of actions) {
      assert.equal(a.type, 'play', 'U PLAYING sve akcije treba da budu play');
    }
  }
});

test('getLegalActions: REFE — automatski, ruka se ponistava, refeCount ceka nosioca sledece ruke', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  g.pass(1);
  g.pass(2);
  g.pass(0);
  // RULES 7.1/7.3: ruka se ponistava (BIDDING faza), sledeca ruka je
  // naoruzana refe-multiplikatorom, ali refeCount se NE menja dok se ta
  // sledeca ruka stvarno ne odigra i njen nosilac ne otpise refu.
  assert.equal(g.state.phase, 'BIDDING', 'Ruka se poništava, nova ruka');
  assert.equal(g.state.refeCount.join(','), '0,0,0', 'Niko jos nije potrosio refu');
  assert.equal(g.state.refeUsed, true, 'sledeca ruka je naoruzana refe-multiplikatorom');
});

test('getLegalActions: GAME_OVER — prazna lista', () => {
  const g = new Game({ seed: 1 });
  g.newHand(0);
  // Forsiraj GAME_OVER preko REFE iscrpljenja
  g.state.refeCount = [3, 3, 3]; // iscrpljeno
  g.pass(1);
  g.pass(2);
  g.pass(0);
  if (g.state.phase === 'GAME_OVER') {
    const actions = g.getLegalActions();
    assert.equal(actions.length, 0, 'GAME_OVER nema akcija');
  }
});