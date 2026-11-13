import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeUnfinished, isStartedUnfinished } from './unfinished.js';
import type { RoomState } from './rooms/RoomState.js';

function fakeRoom(phase: string, hands: number): RoomState {
  return {
    code: 'ABCD', createdAt: Date.UTC(2026, 10, 12, 10, 0, 0), lastActivityAt: Date.UTC(2026, 10, 12, 11, 30, 0),
    seatNames: ['packo', 'Milan', null], seatUserIds: [131, null, null], hadBots: true,
    handsHistory: new Array(hands).fill({}), game: { state: { phase, bulas: [200, 180, 210] } },
  } as unknown as RoomState;
}

test('nezavrsena: sto koji ceka pocetak i zavrsen mec se ne belezi', () => {
  assert.equal(isStartedUnfinished(fakeRoom('WAITING', 0)), false);
  assert.equal(isStartedUnfinished(fakeRoom('MATCH_OVER', 5)), false);
});

test('nezavrsena: igra u toku ili vec odigrane ruke se belezi', () => {
  assert.equal(isStartedUnfinished(fakeRoom('PLAYING', 0)), true);
  assert.equal(isStartedUnfinished(fakeRoom('WAITING', 3)), true);
});

test('nezavrsena: opis stola sadrzi igrace, bule i razlog', () => {
  const r = describeUnfinished(fakeRoom('PLAYING', 4), 'Niko se nije vratio 24 sata.');
  assert.equal(r.room_code, 'ABCD');
  assert.equal(r.rounds_played, 4);
  assert.deepEqual(r.names, ['packo', 'Milan', null]);
  assert.deepEqual(r.bulas, [200, 180, 210]);
  assert.equal(r.had_bots, 1);
  assert.equal(r.last_activity_at, '2026-11-12 11:30:00');
});
