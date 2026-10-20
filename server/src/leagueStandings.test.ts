import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings, countsForLeague, MIN_HANDS_FOR_EARLY_END } from './leagueStandings.js';
import type { LeagueMatch, StandingsRules } from './leagueStandings.js';

const members = [
  { userId: 1, name: 'Ana' },
  { userId: 2, name: 'Bora' },
  { userId: 3, name: 'Cica' },
];
const places: StandingsRules = { scoring: { mode: 'places', points: [10, 5, 1] }, norma: 0, rankBy: 'total' };

function match(scores: number[], endReason = 'natural', roundsPlayed = 30, userIds: LeagueMatch['userIds'] = [1, 2, 3]): LeagueMatch {
  return { userIds, finalScores: scores, endReason, roundsPlayed };
}

const byId = (rows: ReturnType<typeof computeStandings>) => new Map(rows.map((r) => [r.userId, r]));

test('bodovi po mestu: nizi skor je bolji', () => {
  const rows = byId(computeStandings(members, [match([-30, 10, 20])], places));
  assert.equal(rows.get(1)!.points, 10);
  assert.equal(rows.get(2)!.points, 5);
  assert.equal(rows.get(3)!.points, 1);
  assert.equal(rows.get(1)!.wins, 1);
});

test('rezultat = prosek skora − skor, zbir za troje je 0', () => {
  const rows = byId(computeStandings(members, [match([-30, 10, 20])], places));
  assert.equal(rows.get(1)!.result, 30);
  assert.equal(rows.get(2)!.result, -10);
  assert.equal(rows.get(3)!.result, -20);
});

test('izjednaceni dele bodove svojih mesta i niko nema pobedu', () => {
  const rows = byId(computeStandings(members, [match([-10, -10, 20])], places));
  assert.equal(rows.get(1)!.points, 7.5);
  assert.equal(rows.get(2)!.points, 7.5);
  assert.equal(rows.get(3)!.points, 1);
  assert.equal(rows.get(1)!.wins, 0);
});

test('bodovanje zbirom rezultata', () => {
  const rules: StandingsRules = { scoring: { mode: 'result' }, norma: 0, rankBy: 'total' };
  const rows = computeStandings(members, [match([-30, 10, 20]), match([0, -15, 15])], rules);
  assert.deepEqual(rows.map((r) => [r.userId, r.points]), [[1, 30], [2, 5], [3, -35]]);
});

test('prekinuta partija ulazi tek posle MIN_HANDS_FOR_EARLY_END ruku', () => {
  assert.equal(countsForLeague('natural', 1), true);
  assert.equal(countsForLeague('agreed', MIN_HANDS_FOR_EARLY_END - 1), false);
  assert.equal(countsForLeague('agreed', MIN_HANDS_FOR_EARLY_END), true);
  assert.equal(countsForLeague('leave', 3), false);
  const rows = byId(computeStandings(members, [match([-30, 10, 20], 'agreed', 2)], places));
  assert.equal(rows.get(1)!.matches, 0);
  assert.equal(rows.get(1)!.points, 0);
});

test('ispod norme na dno tabele, iznad norme po bodovima', () => {
  const rules: StandingsRules = { ...places, norma: 2 };
  const four = [...members, { userId: 4, name: 'Dule' }];
  const rows = computeStandings(four, [
    match([-30, 10, 20], 'natural', 30, [1, 2, 3]),
    match([-30, 10, 20], 'natural', 30, [4, 2, 3]),
    match([-30, 10, 20], 'natural', 30, [4, 2, 3]),
  ], rules);
  assert.deepEqual(rows.map((r) => [r.userId, r.meetsNorma]), [[4, true], [2, true], [3, true], [1, false]]);
});

test('poredak po proseku', () => {
  const rules: StandingsRules = { ...places, rankBy: 'avg' };
  const four = [...members, { userId: 4, name: 'Dule' }];
  const rows = computeStandings(four, [
    match([-30, 10, 20], 'natural', 30, [1, 2, 3]),
    match([10, -30, 20], 'natural', 30, [1, 2, 3]),
    match([-30, 10, 20], 'natural', 30, [4, 2, 3]),
  ], rules);
  assert.equal(rows[0]!.userId, 4); // 10 iz jedne partije
  assert.equal(rows[0]!.avg, 10);
});

test('uklonjen clan se ne prikazuje, partija vazi za ostale', () => {
  const rows = computeStandings(members.slice(0, 2), [match([-30, 10, 20], 'natural', 30, [1, 2, 99])], places);
  assert.deepEqual(rows.map((r) => r.userId), [1, 2]);
  assert.equal(rows[0]!.points, 10);
});

test('partija sa praznim mestom ili losim skorom se preskace', () => {
  const rows = byId(computeStandings(members, [match([-30, 10, 20], 'natural', 30, [1, 2, null]), match([1, 2])], places));
  assert.equal(rows.get(1)!.matches, 0);
});
