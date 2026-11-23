import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../engine/dist/game.js';
import { autoPlayToHandEnd } from '../../engine/dist/aiSearch.js';
import { buildHandSnapshot } from './handRecord.js';
import { cleanLocalHand } from './localHands.js';

function playedHand() {
  for (let seed = 1; seed <= 50; seed++) {
    const g = new Game({ seed });
    g.newHand(0);
    if (autoPlayToHandEnd(g, Math.random, 400)) return buildHandSnapshot(g.state);
  }
  throw new Error('nijedna ruka nije odigrana');
}

test('ruka iz igre protiv racunara: pravi zapis prolazi proveru', () => {
  const hand = playedHand();
  const clean = cleanLocalHand({ matchId: 'abc12345-xyz', final: true, hand });
  assert.ok(clean);
  assert.equal(clean.matchId, 'abc12345-xyz');
  assert.equal(clean.final, true);
  const saved = JSON.parse(clean.json) as { hands: unknown[]; tricks: unknown[] };
  assert.equal(saved.hands.length, 3);
  assert.ok(saved.tricks.length > 0);
});

test('ruka iz igre protiv racunara: nepoznata polja se ne cuvaju', () => {
  const clean = cleanLocalHand({ matchId: 'abc12345-xyz', hand: { ...playedHand(), ime: 'Pera', email: 'a@b.c' } });
  assert.ok(clean);
  assert.equal(clean.json.includes('Pera'), false);
  assert.equal(clean.json.includes('email'), false);
});

test('ruka iz igre protiv racunara: los oblik se odbija', () => {
  const hand = playedHand();
  assert.equal(cleanLocalHand(null), null);
  assert.equal(cleanLocalHand({ matchId: 'x', hand }), null);
  assert.equal(cleanLocalHand({ matchId: 'abc12345-xyz' }), null);
  assert.equal(cleanLocalHand({ matchId: 'abc12345-xyz', hand: { ...hand, round: -1 } }), null);
  assert.equal(cleanLocalHand({ matchId: 'abc12345-xyz', hand: { ...hand, bulasAfter: [1, 2] } }), null);
  assert.equal(cleanLocalHand({ matchId: 'abc12345-xyz', hand: { ...hand, hands: [] } }), null);
  assert.equal(cleanLocalHand({ matchId: 'abc12345-xyz', hand: { ...hand, declaredGame: 'x'.repeat(50) } }), null);
});

test('ruka iz igre protiv racunara: prevelik zapis se odbija', () => {
  const hand = playedHand();
  const big = { ...hand, bids: Array.from({ length: 40 }, () => ({ player: 0, type: 'BID', value: 2, note: 'x'.repeat(400) })) };
  assert.equal(cleanLocalHand({ matchId: 'abc12345-xyz', hand: big }), null);
});

test('baza ruku: upis i citanje, bez imena posetioca u zapisu', async () => {
  const { openLocalHandsDb } = await import('./localHandsDb.js');
  const db = openLocalHandsDb(':memory:');
  const clean = cleanLocalHand({ matchId: 'abc12345-xyz', final: true, hand: playedHand() });
  assert.ok(clean);
  db.save('posetilac-0001', 'telefon', clean);
  const rows = db.all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.match_id, 'abc12345-xyz');
  assert.equal(rows[0]?.final, 1);
  assert.equal(rows[0]?.device, 'telefon');
  assert.equal(rows[0]?.hand_json.includes('posetilac'), false);
});
