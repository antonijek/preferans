import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handReplay, bidLabel } from './replayModel.js';
import type { HandSnapshot } from './rooms/RoomState.js';

const c = (s: string) => ({ rank: s.slice(0, -1), suit: s.slice(-1) });

const base: HandSnapshot = {
  round: 3, endedAt: '', declarer: 0, declaredGame: 'Sans', caller: null, callee: null,
  followChoices: [null, 'DODJEM', 'DODJEM'], kontraLevel: null, passed: true,
  bulasAfter: [96, 100, 100], supeDelta: [0, 2, 0],
  tricks: [
    [{ position: 1, suit: '♠', rank: 'A' }, { position: 2, suit: '♠', rank: 'K' }, { position: 0, suit: '♠', rank: '7' }],
    [{ position: 1, suit: '♥', rank: '8' }, { position: 2, suit: '♥', rank: 'A' }],
  ],
  tricksWon: [0, 1, 0],
  talon: [c('K♣'), c('J♥')],
};

test('natpisi licitacije', () => {
  assert.equal(bidLabel({ type: 'BID', value: 3 }), '3');
  assert.equal(bidLabel({ type: 'PASS' }), 'dalje');
  assert.equal(bidLabel({ type: 'MOGU', value: 4 }), 'mogu 4');
  assert.equal(bidLabel({ type: 'IGRA' }), 'igra');
});

test('novi zapis: pune ruke, licitacija sa natpisima, dobitnik stiha (sans, bez aduta)', () => {
  const r = handReplay({
    ...base,
    dealer: 2,
    bids: [{ player: 0, type: 'BID', value: 2 }, { player: 1, type: 'PASS' }],
    hands: [[c('7♠')], [c('A♠'), c('8♥')], [c('K♠'), c('A♥')]],
    discard: [c('K♣'), c('8♣')],
  });
  assert.equal(r.complete, true);
  assert.equal(r.dealer, 2);
  assert.deepEqual(r.bids, [{ player: 0, label: '2' }, { player: 1, label: 'dalje' }]);
  assert.equal(r.tricks[0]!.winner, 1);
  assert.equal(r.tricks[1]!.winner, null); // nezavrsen stih
  assert.deepEqual(r.discard, [c('K♣'), c('8♣')]);
});

test('stari zapis: samo odigrane karte, bez licitacije', () => {
  const r = handReplay(base);
  assert.equal(r.complete, false);
  assert.equal(r.bids, null);
  assert.equal(r.discard, null);
  assert.equal(r.dealer, null);
  assert.deepEqual(r.hands[1], [c('A♠'), c('8♥')]);
  assert.deepEqual(r.hands[0], [c('7♠')]);
});
