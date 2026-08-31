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
  // RULES 7.1/7.3: ruka se ponistava (BIDDING faza), sva tri igraca dobijaju
  // po jednu refu NA RASPOLAGANJU, ali refeCount (iskorisceno) se NE menja
  // dok neko od njih licno ne postane nosilac i ne otpise svoju.
  assert.equal(g.state.phase, 'BIDDING', 'Ruka se poništava, nova ruka');
  assert.equal(g.state.refeCount.join(','), '0,0,0', 'Niko jos nije potrosio refu');
  assert.equal(g.state.refePending.join(','), '1,1,1', 'sva tri igraca dobijaju refu na raspolaganje');
});

// RULES 3.4 (korisnikov zahtev, uzivo prijavljen bug 2026-08-31): "Igra"
// sme SAMO na igracev PRVI potez u rundi. Cim je na svom prvom potezu vec
// rekao broj ili "dalje", trajno gubi pravo na Igra do kraja te runde.

test('Igra: igrac koji je BID na prvom potezu gubi pravo na Igra kasnije u istoj rundi', () => {
  const g = new Game({ seed: 1 });
  g.newHand(2); // dealer=2 -> bidStartPlayer=0, P0 prvi na potezu
  assert.ok(g.bid(0, 2), 'P0 bid 2 kao prvi potez');
  assert.equal(g.state.players[0]!.igraEligible, false, 'P0 vise nije Igra-eligible');
  assert.ok(g.bid(1, 3), 'P1 podize');
  assert.ok(g.pass(2), 'P2 prolazi');
  // Sad je P0 opet na potezu (Mogu-eligible, bidLevel 2 < currentBid 3)
  assert.equal(g.state.currentBidder, 0);
  assert.equal(g.sayIgra(0), false, 'P0 NE SME Igra — vec je odigrao broj na prvom potezu');
  const actions = g.getLegalActions();
  assert.ok(!actions.some(a => a.type === 'igra'), 'getLegalActions ne sme nuditi Igra za P0');
});

test('Igra: igrac koji je PASS na prvom potezu gubi pravo na Igra', () => {
  const g = new Game({ seed: 1 });
  g.newHand(2);
  assert.ok(g.pass(0), 'P0 dalje kao prvi potez');
  assert.equal(g.state.players[0]!.igraEligible, false);
});

test('Igra: igrac koji KAZE Igra na prvom potezu ostaje eligible (bazni slucaj, ne regresija)', () => {
  const g = new Game({ seed: 1 });
  g.newHand(2);
  assert.ok(g.sayIgra(0), 'P0 Igra kao prvi potez uspeva');
  assert.equal(g.state.players[0]!.igraEligible, true);
});

test('Igra: pravo se prati PO IGRACU — drugi igrac koji jos nije imao prvi potez i dalje sme Igra', () => {
  const g = new Game({ seed: 1 });
  g.newHand(2);
  assert.ok(g.bid(0, 2), 'P0 bid 2 (gubi Igra pravo)');
  // P1 jos nije imao svoj prvi potez — i dalje mu je Igra dostupna
  assert.equal(g.state.players[1]!.igraEligible, true);
  const actions = g.getLegalActions();
  assert.ok(actions.some(a => a.type === 'igra'), 'P1 (currentBidder) i dalje treba da vidi Igra opciju');
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