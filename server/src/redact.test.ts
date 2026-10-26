import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameState, Card, Position } from '../../engine/dist/types.js';
import { redactStateFor } from './redact.js';
import type { Viewer } from './redact.js';

const c = (rank: string, suit: string) => ({ rank, suit }) as unknown as Card;
const TALON = [c('A', '♥'), c('8', '♠')];

// samo polja koja redactStateFor cita; nosilac je sediste 0
function stateIn(phase: string, trickCount = 0): GameState {
  return {
    phase, trickCount, winner: 0, declaredGame: phase === 'DISCARDING' ? null : 'Tref',
    players: [{ hand: [c('K', '♣')] }, { hand: [c('Q', '♦')] }, { hand: [c('J', '♥')] }],
    talon: [], lastTalon: TALON, discard: [c('7', '♠'), c('9', '♠')],
  } as unknown as GameState;
}
const follower: Viewer = { type: 'player', seat: 1 };
const spectator: Viewer = { type: 'spectator', kibicSeats: new Set<Position>() };

test('pratilac i kibic vide uzeti talon do kraja prvog štiha (Dođem/Ne dođem, kontra)', () => {
  for (const [phase, tricks] of [['DISCARDING', 0], ['DECLARING', 0], ['FOLLOW_DECLARING', 0], ['KONTRA_DECLARING', 0], ['PLAYING', 0]] as const) {
    assert.deepEqual(redactStateFor(stateIn(phase, tricks), follower).lastTalon, TALON, phase);
    assert.deepEqual(redactStateFor(stateIn(phase, tricks), spectator).lastTalon, TALON, phase);
  }
});

test('posle prvog štiha i na kraju ruke talon vidi samo nosilac; škart uvek samo nosilac', () => {
  for (const [phase, tricks] of [['PLAYING', 1], ['GAME_OVER', 10], ['MATCH_OVER', 10]] as const) {
    assert.deepEqual(redactStateFor(stateIn(phase, tricks), follower).lastTalon, [], phase);
    assert.deepEqual(redactStateFor(stateIn(phase, tricks), { type: 'player', seat: 0 }).lastTalon, TALON, phase);
  }
  assert.deepEqual(redactStateFor(stateIn('FOLLOW_DECLARING'), follower).discard, []);
  assert.equal(redactStateFor(stateIn('FOLLOW_DECLARING'), { type: 'player', seat: 0 }).discard.length, 2);
});
