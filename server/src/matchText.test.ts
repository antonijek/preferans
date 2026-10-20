import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHand, matchToText } from './matchText.js';
import type { HandSnapshot } from './rooms/RoomState.js';

const c = (s: string) => ({ rank: s.slice(0, -1), suit: s.slice(-1) });

test('ruka slozena po bojama kao u igri, od keca nanize', () => {
  assert.equal(formatHand(['7♠', 'A♠', '10♣', 'Q♦'].map(c)), '♣ 10   ♥ —   ♠ A 7   ♦ Q');
});

test('partija: licitacija, skart i pobednik stiha sa adutom', () => {
  const hand: HandSnapshot = {
    round: 1, endedAt: '', declarer: 0, declaredGame: 'Herc', caller: null, callee: null,
    followChoices: [null, 'DODJEM', 'NE_DODJEM'], kontraLevel: null, passed: false,
    bulasAfter: [104, 100, 100], supeDelta: [0, 0, 0],
    tricks: [[
      { position: 1, suit: '♠', rank: 'A' },
      { position: 2, suit: '♠', rank: 'K' },
      { position: 0, suit: '♥', rank: '7' },
    ]],
    tricksWon: [1, 0, 0],
    talon: [c('K♣'), c('J♥')],
    dealer: 2,
    bids: [{ player: 0, type: 'BID', value: 2 }, { player: 1, type: 'PASS' }, { player: 2, type: 'PASS' }],
    hands: [[c('7♥')], [c('A♠')], [c('K♠')]],
    discard: [c('K♣'), c('8♣')],
  };
  const text = matchToText({
    id: 9, room_code: 'ABCDE', ended_at: 'x', match_end_reason: 'natural', rounds_played: 1,
    names: ['Ana', 'Bora', 'Cica'], final_scores: [1, 2, 3], hands: [hand],
  });
  assert.match(text, /Licitacija: Ana 2, Bora dalje, Cica dalje/);
  assert.match(text, /Škart: K♣ 8♣/);
  assert.match(text, /1\. Bora A♠, Cica K♠, Ana 7♥ {2}→ Ana/); // herc je adut
  assert.match(text, /Pratnja: Bora DODJEM, Cica NE_DODJEM/);
});

test('stariji zapis bez ruku i licitacije se ispisuje bez gresaka', () => {
  const old = {
    round: 1, endedAt: '', declarer: 1, declaredGame: 'Sans', caller: null, callee: null,
    followChoices: [null, null, null], kontraLevel: null, passed: true,
    bulasAfter: [100, 96, 100], supeDelta: [0, 0, 0], tricks: [], tricksWon: [0, 0, 0], talon: [c('7♣'), c('8♣')],
  } as HandSnapshot;
  const text = matchToText({
    id: 1, room_code: 'X', ended_at: 'x', match_end_reason: 'agreed', rounds_played: 1,
    names: ['A', 'B', 'C'], final_scores: [0, 0, 0], hands: [old],
  });
  assert.match(text, /nosilac B: Sans — PROŠAO/);
  assert.doesNotMatch(text, /Licitacija/);
});
