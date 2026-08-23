// PREFERANS scoring testovi — RULES.md i Dodatak A

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBulaChange,
  calculateBulaDistribution,
  calculateSupaForFollower,
  calculateBetlSupa,
  calculateFinalScore,
  calculateWriteOff,
  getGameValue,
  isBetl,
  isSans,
  isIgra,
  getTrumpSuit,
} from '../src/scoring.ts';
import { GAME_VALUES, CONTRA_MULTIPLIERS } from '../src/constants.ts';

test('getGameValue — poznate igre', () => {
  assert.equal(getGameValue('Pik'), 2);
  assert.equal(getGameValue('Karo'), 3);
  assert.equal(getGameValue('Herc'), 4);
  assert.equal(getGameValue('Tref'), 5);
  assert.equal(getGameValue('Betl'), 6);
  assert.equal(getGameValue('Sans'), 7);
  assert.equal(getGameValue('Igra-Pik'), 3);
  assert.equal(getGameValue('Igra-Karo'), 4);
  assert.equal(getGameValue('Igra-Betl'), 7);
  assert.equal(getGameValue('Igra-Sans'), 8);
});

test('calculateBulaChange — Pik prolaz/pad', () => {
  assert.equal(calculateBulaChange(6, 'Pik'), -4);
  assert.equal(calculateBulaChange(5, 'Pik'), 4);
});

test('calculateBulaChange — sve standardne igre prolaz/pad', () => {
  for (const [game, value] of Object.entries(GAME_VALUES)) {
    if (game === 'Betl' || game === 'Igra-Betl') continue;
    assert.equal(calculateBulaChange(6, game), -value * 2, `${game} prolaz`);
    assert.equal(calculateBulaChange(5, game), value * 2, `${game} pad`);
  }
});

test('calculateBulaChange — Betl: 0 štihova = prolaz, 1+ = pad', () => {
  assert.equal(calculateBulaChange(0, 'Betl'), -12);
  assert.equal(calculateBulaChange(1, 'Betl'), 12);
  assert.equal(calculateBulaChange(10, 'Betl'), 12);
  assert.equal(calculateBulaChange(0, 'Igra-Betl'), -14);
  assert.equal(calculateBulaChange(1, 'Igra-Betl'), 14);
});

test('calculateBulaChange — kontra množilac', () => {
  assert.equal(calculateBulaChange(5, 'Tref', CONTRA_MULTIPLIERS.KONTRA), 20);
  assert.equal(calculateBulaChange(6, 'Tref', CONTRA_MULTIPLIERS.KONTRA), -20);
  assert.equal(calculateBulaChange(5, 'Tref', CONTRA_MULTIPLIERS.REKONTRA), 40);
  assert.equal(calculateBulaChange(5, 'Tref', CONTRA_MULTIPLIERS.MORTKONTRA), 160);
});

test('calculateBulaChange — refe množilac', () => {
  assert.equal(calculateBulaChange(5, 'Tref', 1, 2), 20);
  assert.equal(calculateBulaChange(6, 'Pik', 1, 2), -8);
});

test('calculateBulaChange — refe × kontra zajedno (×4)', () => {
  assert.equal(calculateBulaChange(5, 'Tref', 2, 2), 40);
  assert.equal(calculateBulaChange(6, 'Pik', 2, 2), -16);
});

test('calculateBulaDistribution — dva pratioca dele pola-pola (bez kontre)', () => {
  const d = calculateBulaDistribution(-10, { active: [1, 2], kontraš: null, pozivalac: null });
  assert.equal(d[1], 5);
  assert.equal(d[2], 5);
  assert.equal(d[0], undefined);
});

test('calculateBulaDistribution — jedan pratilac snosi sve', () => {
  const d = calculateBulaDistribution(-10, { active: [1], kontraš: null, pozivalac: null });
  assert.equal(d[1], 10);
});

test('calculateBulaDistribution — kontraš snosi sve', () => {
  const d = calculateBulaDistribution(-20, { active: [1, 2], kontraš: 1, pozivalac: null });
  assert.equal(d[1], 20);
  assert.equal(d[2], undefined);
});

test('calculateBulaDistribution — pozivalac snosi sve', () => {
  const d = calculateBulaDistribution(-20, { active: [1, 2], kontraš: null, pozivalac: 1 });
  assert.equal(d[1], 20);
  assert.equal(d[2], undefined);
});

test('calculateSupaForFollower — standardna formula', () => {
  assert.equal(calculateSupaForFollower(2, 'Tref'), 20);
  assert.equal(calculateSupaForFollower(3, 'Tref'), 30);
  assert.equal(calculateSupaForFollower(3, 'Herc'), 24);
  assert.equal(calculateSupaForFollower(4, 'Karo'), 24);
});

test('calculateSupaForFollower — sa kontrama', () => {
  assert.equal(calculateSupaForFollower(3, 'Tref', 2), 60);
  assert.equal(calculateSupaForFollower(3, 'Tref', 4), 120);
  assert.equal(calculateSupaForFollower(3, 'Tref', 8), 240);
  assert.equal(calculateSupaForFollower(3, 'Tref', 16), 480);
});

test('calculateSupaForFollower — refe × kontra', () => {
  assert.equal(calculateSupaForFollower(5, 'Igra-Tref', 2, 2), 240);
  assert.equal(calculateSupaForFollower(5, 'Igra-Pik', 4, 2), 240);
});

test('calculateBetlSupa — fiksno 60/70', () => {
  assert.equal(calculateBetlSupa('Betl'), 60);
  assert.equal(calculateBetlSupa('Igra-Betl'), 70);
});

test('calculateBetlSupa — sa kontrama', () => {
  assert.equal(calculateBetlSupa('Betl', 2), 120);
  assert.equal(calculateBetlSupa('Igra-Betl', 2), 140);
});

test('calculateFinalScore — primer iz dokumenta (Poglavlje 14, Primer 1)', () => {
  const score = calculateFinalScore({
    supeZa: 120,
    supeProtiv: 200,
    finalneBule: 12,
  });
  assert.equal(score, 40);
});

test('calculateFinalScore — negativan rezultat (Poglavlje 14, Primer 2)', () => {
  const score = calculateFinalScore({
    supeZa: 180,
    supeProtiv: 80,
    finalneBule: 5,
  });
  assert.equal(score, 150);
});

test('calculateFinalScore — veliki negativni (edge case)', () => {
  const score = calculateFinalScore({
    supeZa: 110,
    supeProtiv: 500,
    finalneBule: 2,
  });
  assert.equal(score, -370);
});

test('calculateFinalScore — nula bula', () => {
  const score = calculateFinalScore({
    supeZa: 60,
    supeProtiv: 200,
    finalneBule: 0,
  });
  assert.equal(score, -140);
});

test('calculateWriteOff — deljivo sa 3 (Poglavlje 13, Primer 14)', () => {
  const r = calculateWriteOff([20, 30, 40]);
  assert.deepEqual(r.writeOff, [30, 30, 30]);
});

test('calculateWriteOff — nije deljivo sa 3 (Poglavlje 13, Primer 15)', () => {
  const r = calculateWriteOff([24, 34, 28]);
  assert.deepEqual(r.writeOff, [28, 29, 29]);
});

test('calculateWriteOff — mali iznos, nije deljiv (Poglavlje 13, Primer 16)', () => {
  const r = calculateWriteOff([8, 2, 0]);
  assert.deepEqual(r.writeOff, [4, 3, 3]);
});

test('Primjeri iz dokumenta — A.1 Bule primer 4', () => {
  const declarerDelta = calculateBulaChange(6, 'Tref');
  const dist = calculateBulaDistribution(declarerDelta, { active: [1, 2], kontraš: null, pozivalac: null });
  assert.equal(declarerDelta, -10);
  assert.equal(dist[1], 5);
  assert.equal(dist[2], 5);
});

test('Primjeri iz dokumenta — A.1 Bule primer 5', () => {
  const declarerDelta = calculateBulaChange(6, 'Igra-Karo');
  const dist = calculateBulaDistribution(declarerDelta, { active: [1, 2], kontraš: null, pozivalac: null });
  assert.equal(declarerDelta, -8);
  assert.equal(dist[1], 4);
  assert.equal(dist[2], 4);
});

test('Primjeri iz dokumenta — A.1 Bule primer 6 (Betl sa kontrum)', () => {
  const declarerDelta = calculateBulaChange(0, 'Betl', CONTRA_MULTIPLIERS.KONTRA);
  const dist = calculateBulaDistribution(declarerDelta, { active: [1, 2], kontraš: 1, pozivalac: null });
  assert.equal(declarerDelta, -24);
  assert.equal(dist[1], 24);
  assert.equal(dist[2], undefined);
});

test('Primjeri iz dokumenta — A.2 Supe primer 12 (refe × kontra × Igra-tref)', () => {
  const supe = calculateSupaForFollower(5, 'Igra-Tref', 2, 2);
  assert.equal(supe, 240);
});

test('Primjeri iz dokumenta — A.2 Supe primer 13 (Igra-Pik + kontra + refe)', () => {
  const supe = calculateSupaForFollower(5, 'Igra-Pik', 4, 2);
  assert.equal(supe, 240);
});

test('isBetl / isSans / isIgra / getTrumpSuit', () => {
  assert.equal(isBetl('Betl'), true);
  assert.equal(isBetl('Igra-Betl'), true);
  assert.equal(isBetl('Pik'), false);
  assert.equal(isSans('Sans'), true);
  assert.equal(isIgra('Igra-Pik'), true);
  assert.equal(isIgra('Pik'), false);
  assert.equal(getTrumpSuit('Pik'), '♠');
  assert.equal(getTrumpSuit('Igra-Herc'), '♥');
  assert.equal(getTrumpSuit('Betl'), null);
  assert.equal(getTrumpSuit('Sans'), null);
});
