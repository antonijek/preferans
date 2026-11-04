import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../rooms/RoomManager.js';
import { isAloneWithBots, pausedBotInfo } from './botPause.js';

test('sačuvana partija: igrač sam sa računarima', () => {
  const room = createRoom();
  room.seatUserIds = [7, null, null];
  room.botSeats = new Set([1, 2]);
  assert.equal(isAloneWithBots(room, 0), true);
  room.seatUserIds[1] = 8;
  room.botSeats.delete(1);
  assert.equal(isAloneWithBots(room, 0), false, 'za stolom je još jedan čovek');
  room.abandonedSeat = 1;
  assert.equal(isAloneWithBots(room, 0), true, 'čovek koji je napustio partiju se ne broji');
  room.seatUserIds = [7, 8, 9];
  room.botSeats = new Set();
  room.abandonedSeat = null;
  assert.equal(isAloneWithBots(room, 0), false, 'sto bez računara');
});

test('sačuvana partija se nalazi po igraču, sa njegovom bulom', () => {
  const room = createRoom();
  room.seatUserIds = [null, 7, null];
  room.botSeats = new Set([0, 2]);
  assert.deepEqual(pausedBotInfo(7), { code: null });
  room.pausedSeat = 1;
  assert.deepEqual(pausedBotInfo(7), { code: room.code, bula: room.game.state.bulas[1] });
  assert.deepEqual(pausedBotInfo(8), { code: null });
});
