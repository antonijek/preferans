// Igrač koji seda za drugi sto (nova soba, pridruživanje) prvo ustaje sa starog. Korisnik 2026-11-01: posle 🏠
// i „Napravi novu sobu“ server ga je držao za oba stola — stizala su mu stanja sa oba, a „Popuni računarom i
// počni“ kao da ne radi. Partija u toku se napušta samo kad igrač to potvrdi (leaveCurrent), isto kao
// „Napusti svakako“; sto koji čeka, završena partija i kibicovanje puštaju se bez pitanja.

import type { Socket } from 'socket.io';
import { clearUserLocation, getRoomByCode, getUserLocation, removeRoom } from '../rooms/RoomManager.js';
import type { RoomState } from '../rooms/RoomState.js';
import type { Position } from '../../../engine/dist/types.js';
import { adminCloseRoom } from './roomAdmin.js';
import { broadcastRoomState, postSystemMessage } from './roomBroadcast.js';

export type SeatRelease = { ok: true } | { error: string; seatedIn: string };

const othersAtTable = (room: RoomState, seat: Position) =>
  ([0, 1, 2] as Position[]).filter(
    (p) => p !== seat && p !== room.abandonedSeat && !room.botSeats.has(p) && room.seatUserIds[p] !== null
  );

/**
 * Napuštanje partije u toku (game:leave i prelazak za drugi sto). Vraća bulu na kojoj igrač ostaje zamrznut.
 * Poslednji čovek za stolom sa računarima: nema kome da se nastavi, sto se zatvara (partija sa računarom ionako
 * ne ide u rejting). Inače računar igra umesto njega do kraja ruke, a sediste ostaje njegovo (može da se vrati).
 */
export function leaveRunningMatch(room: RoomState, seat: Position, userId: number, name: string, socket: Socket): number {
  const frozenBula = room.game.state.bulas[seat];
  const alone = othersAtTable(room, seat).length === 0 && room.botSeats.size > 0;
  room.sockets[seat] = null;
  socket.leave(room.code);
  clearUserLocation(userId);
  if (alone) {
    adminCloseRoom(room, 'Svi igrači su napustili sto.');
    return frozenBula;
  }
  room.frozenBula = frozenBula;
  room.abandonedSeat = seat;
  room.seatNames[seat] = `${room.seatNames[seat] ?? name} (napustio)`;
  postSystemMessage(room, `${name} je napustio partiju na buli ${frozenBula}. AI preuzima do kraja ove ruke.`);
  broadcastRoomState(room);
  return frozenBula;
}

/** Pusti igrača sa stola za kojim sedi (ili koji gleda) pre nego što sedne za sto targetCode (null = nova soba). */
export function releaseOtherSeat(
  userId: number,
  name: string,
  socket: Socket,
  targetCode: string | null,
  leaveCurrent: boolean
): SeatRelease {
  const loc = getUserLocation(userId);
  const old = loc ? getRoomByCode(loc.code) : undefined;
  if (!loc || !old || old.code === targetCode) return { ok: true };
  if (loc.role !== 'player') {
    old.spectators.delete(userId);
    socket.leave(old.code);
    clearUserLocation(userId);
    broadcastRoomState(old);
    return { ok: true };
  }
  const seat = loc.seat;
  const phase = old.game.state.phase;
  if (phase === 'WAITING') {
    old.seatUserIds[seat] = null;
    old.seatNames[seat] = null;
    old.sockets[seat] = null;
    socket.leave(old.code);
    clearUserLocation(userId);
    if (othersAtTable(old, seat).length === 0) removeRoom(old.code);
    else broadcastRoomState(old);
    return { ok: true };
  }
  if (phase === 'MATCH_OVER') {
    old.sockets[seat] = null;
    socket.leave(old.code);
    clearUserLocation(userId);
    return { ok: true };
  }
  if (!leaveCurrent) return { error: `Već igraš za stolom ${old.code} — vrati se za sto ili ga napusti.`, seatedIn: old.code };
  leaveRunningMatch(old, seat, userId, name, socket);
  return { ok: true };
}
