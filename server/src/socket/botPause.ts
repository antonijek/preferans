// Partija sa računarom se čuva kad igrač pređe za drugi sto (korisnik 2026-11-03: poziv treba da može da se
// pošalje i igraču koji igra sa računarom, „jer on tu partiju može nastaviti“). Sto se ne zatvara nego pauzira:
// mesto ostaje njegovo, a bez povezanog čoveka niko ne igra za njega (tajmer za potez to proverava). Nastavlja je
// dugmetom na početnoj (room:paused-bot, pa obično room:join). Čuva se jedna takva partija po igraču;
// „Napusti partiju“ je i dalje zatvara (leaveRunningMatch u seatSwitch.ts).

import type { Socket } from 'socket.io';
import type { Position } from '../../../engine/dist/types.js';
import type { RoomState } from '../rooms/RoomState.js';
import { clearUserLocation, forEachRoom, persistRoom } from '../rooms/RoomManager.js';
import { adminCloseRoom } from './roomAdmin.js';

/** Ljudi za stolom osim igrača na mestu seat (bez računara i bez onoga ko je napustio partiju). */
export const othersAtTable = (room: RoomState, seat: Position) =>
  ([0, 1, 2] as Position[]).filter(
    (p) => p !== seat && p !== room.abandonedSeat && !room.botSeats.has(p) && room.seatUserIds[p] !== null
  );

/** Igrač je jedini čovek za stolom, ostala mesta drže računari. */
export function isAloneWithBots(room: RoomState, seat: Position): boolean {
  return othersAtTable(room, seat).length === 0 && room.botSeats.size > 0;
}

export function pausedBotRoomOf(userId: number): RoomState | undefined {
  let found: RoomState | undefined;
  forEachRoom((room) => {
    if (room.pausedSeat !== null && room.seatUserIds[room.pausedSeat] === userId) found = room;
  });
  return found;
}

/** Odgovor za početnu: da li igrač ima pauziranu partiju sa računarom i na kojoj je buli. */
export function pausedBotInfo(userId: number): { code: string; bula: number } | { code: null } {
  const room = pausedBotRoomOf(userId);
  if (!room || room.pausedSeat === null) return { code: null };
  return { code: room.code, bula: room.game.state.bulas[room.pausedSeat] };
}

/**
 * Igrač ustaje od stola sa računarima da sedne za sto targetCode: partija čeka, a starija sačuvana se zatvara,
 * osim ako se baš u nju vraća.
 */
export function pauseBotMatch(
  room: RoomState, seat: Position, userId: number, socket: Socket, targetCode: string | null,
): void {
  const older = pausedBotRoomOf(userId);
  if (older && older !== room && older.code !== targetCode) {
    adminCloseRoom(older, 'Sačuvana je novija partija sa računarom.');
  }
  room.sockets[seat] = null;
  room.pausedSeat = seat;
  socket.leave(room.code);
  clearUserLocation(userId);
  persistRoom(room);
}
