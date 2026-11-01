import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthTable, avgTable, belgradeMonth, AVG_MIN } from './monthly.js';
import type { MonthMatch } from './monthly.js';

const names = new Map([
  [1, 'Ana'],
  [2, 'Bora'],
  [3, 'Cica'],
  [4, 'Duško'],
  [9, 'Skriveni'],
]);
const none = new Set<number>();

function match(userIds: MonthMatch['userIds'], finalScores: number[], endReason = 'natural', roundsPlayed = 30): MonthMatch {
  return { userIds, finalScores, endReason, roundsPlayed };
}
const show = (rows: { name: string; points: number }[]) => rows.map((r) => `${r.name}:${r.points}`).join(' ');

test('mesta 10-5-1 po konacnom skoru (nize je bolje), racunar zauzima mesto bez reda', () => {
  const rows = monthTable([match([1, null, 2], [-50, 10, 40])], names, none);
  assert.equal(show(rows), 'Ana:10 Bora:1');
});

test('izjednaceni dele bodove i dobijaju isto mesto', () => {
  const rows = monthTable([match([1, 2, null], [-20, -20, 40])], names, none);
  assert.deepEqual(rows.map((r) => [r.points, r.rank]), [[7.5, 1], [7.5, 1]]);
});

test('prekinut mec ulazi tek posle 10 ruku, do kraja odigran uvek', () => {
  const rows = monthTable(
    [
      match([1, null, null], [-30, 10, 20], 'agreed', 9),
      match([2, null, null], [-30, 10, 20], 'leave', 10),
      match([3, null, null], [-30, 10, 20], 'natural', 3),
    ],
    names,
    none
  );
  assert.equal(show(rows), 'Bora:10 Cica:10');
});

test('isti bodovi: manje meceva gore, isto mesto', () => {
  const rows = monthTable(
    [match([1, null, null], [-30, 10, 20]), match([2, null, null], [10, -30, 20]), match([2, null, null], [10, -30, 20])],
    names,
    none
  );
  assert.equal(rows.map((r) => `${r.name} ${r.points}/${r.matches} #${r.rank}`).join(', '), 'Ana 10/1 #1, Bora 10/2 #1');
});

test('skriveni nalozi i igraci bez imena (obrisani, banovani) nemaju red, a zauzimaju mesto', () => {
  const rows = monthTable([match([9, 7, 3], [-30, 10, 20])], names, new Set([9]));
  assert.equal(show(rows), 'Cica:1');
});

test('pokvaren skor (nisu tri broja) se preskace', () => {
  assert.equal(monthTable([match([1, 2, 3], [5, 6])], names, none).length, 0);
});

test('prosek: mesto samo uz dovoljno meceva, ostali ispod bez mesta', () => {
  const solo = (id: number, place: 0 | 1 | 2) => match([id, null, null], [[-30, 10, 20], [10, -30, 20], [20, 10, -30]][place]!);
  const rows = monthTable(
    [
      ...Array.from({ length: 5 }, () => solo(1, 0)), // Ana 5 × 10 → prosek 10
      ...Array.from({ length: 11 }, () => solo(2, 1)), // Bora 11 × 5 → prosek 5, zbir 55 (prva po zbiru)
      ...Array.from({ length: 4 }, () => solo(3, 0)), // Cica 4 meca — prosek 10, ali bez mesta
      ...Array.from({ length: 5 }, () => solo(4, 1)), // Duško 5 × 5 → prosek 5
    ],
    names,
    none
  );
  assert.equal(rows[0]!.name, 'Bora');
  const avg = avgTable(rows, 5).map((r) => `${r.rank}.${r.name}:${r.avg}${r.ranked ? '' : '*'}`).join(' ');
  assert.equal(avg, '1.Ana:10 2.Bora:5 2.Duško:5 0.Cica:10*');
  assert.equal(AVG_MIN, 10);
  assert.ok(avgTable(rows).every((r) => r.ranked === r.matches >= 10));
});

test('granica meseca po vremenu u Srbiji', () => {
  assert.equal(belgradeMonth('2026-10-31 23:30:00'), '2026-11');
  assert.equal(belgradeMonth('2026-10-31 21:30:00'), '2026-10');
  assert.equal(belgradeMonth('2026-09-30 22:30:00'), '2026-10');
});
