import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlayerStats, belgradeDay } from './stats.js';
import type { StatsMatch } from './stats.js';

const m = (endedAt: string, finalScores: number[], extra: Partial<StatsMatch> = {}): StatsMatch => ({
  endedAt, seat: 0, finalScores, withComputer: false, newRating: 1000, hands: [], ...extra,
});

test('mesta (izjednaceni dele bolje), prosek, rekordi', () => {
  const s = computePlayerStats([
    m('2026-10-01T10:00:00Z', [-30, 10, 20]), // 1. mesto, +30
    m('2026-10-02T10:00:00Z', [10, -30, 20]), // 2. mesto, −10
    m('2026-10-03T10:00:00Z', [0, 0, 30]), // izjednacen za 1., +10
  ], new Date('2026-10-03T12:00:00Z'));
  assert.deepEqual(s.places, [2, 1, 0]);
  assert.equal(s.bestResult, 30);
  assert.equal(s.worstResult, -10);
  assert.equal(s.avgResult, 10);
});

test('igre kao nosilac, prosao, kontra', () => {
  const s = computePlayerStats([m('2026-10-01T10:00:00Z', [0, 0, 0], {
    hands: [
      { declarer: 0, declaredGame: 'Pik', passed: true, kontraLevel: null },
      { declarer: 0, declaredGame: 'Igra-Sans', passed: false, kontraLevel: 'KONTRA' },
      { declarer: 1, declaredGame: 'Betl', passed: true, kontraLevel: null },
    ],
  })]);
  assert.equal(s.hands, 3);
  assert.equal(s.declared, 2);
  assert.equal(s.declaredPassed, 1);
  assert.equal(s.kontraAgainstMe, 1);
  assert.deepEqual(s.games, { Pik: 1, Igra: 1 });
});

test('niz dana po srpskom vremenu; danas ili juce drzi niz', () => {
  // 23:30 UTC 4.10. je vec 5.10. u Beogradu (letnje vreme +2)
  assert.equal(belgradeDay('2026-10-04T23:30:00Z'), '2026-10-05');
  const matches = [
    m('2026-10-01T10:00:00Z', [0, 0, 0]),
    m('2026-10-02T10:00:00Z', [0, 0, 0]),
    m('2026-10-02T18:00:00Z', [0, 0, 0]),
    m('2026-10-04T23:30:00Z', [0, 0, 0]),
    m('2026-10-06T10:00:00Z', [0, 0, 0]),
  ];
  const s = computePlayerStats(matches, new Date('2026-10-07T09:00:00Z'));
  assert.equal(s.daysPlayed, 4); // 1., 2., 5., 6.
  assert.equal(s.longestStreak, 2);
  assert.equal(s.currentStreak, 2); // 5. i 6., a danas je 7.
  assert.equal(computePlayerStats(matches, new Date('2026-10-09T09:00:00Z')).currentStreak, 0);
});

test('najvisi rejting samo iz partija sa rejtingom', () => {
  const s = computePlayerStats([
    m('2026-10-01T10:00:00Z', [0, 0, 0], { newRating: 1040 }),
    m('2026-10-02T10:00:00Z', [0, 0, 0], { newRating: null, withComputer: true }),
    m('2026-10-03T10:00:00Z', [0, 0, 0], { newRating: 1010 }),
  ]);
  assert.equal(s.peakRating, 1040);
  assert.equal(s.withComputer, 1);
});
