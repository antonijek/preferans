import { clearUserLocation, removeRoom } from '../rooms/RoomManager.js';
import type { RoomState, ChatMessage } from '../rooms/RoomState.js';
import { CHAT_LOG_LIMIT } from '../rooms/RoomState.js';
import type { Position } from '../../../engine/dist/types.js';
import { broadcastRoomState } from './roomBroadcast.js';

// Admin panel (korisnikov zahtev 2026-09-17) — forsirana verzija game:leave
// (dole, socket-triggered) ali pozvana iz admin HTTP rute, ne od samog
// sedeceg igraca. Ista mehanika (frozenBula/abandonedSeat/AI preuzimanje/chat
// obavestenje), namerno BEZ io parametra — chat/notifikacija ide direktno
// preko room.sockets/room.spectators (isti obrazac kao broadcastRoomState),
// izbegava potrebu da se globalni `io` provuce do admin/routes.ts.
// `seatUserIds[seat]` se NAMERNO ne cisti (isto kao game:leave) — to je ono
// sto dozvoljava BAS tom igracu da se vrati na ISTO sediste kasnije
// (joinAsPlayer gore), a sprecava bilo kog drugog da mu sedne na mesto.
export function adminKickSeat(
  room: RoomState,
  seat: Position,
  reason?: string
): { ok: true; frozenBula: number } | { ok: false; error: string } {
  if (room.game.state.phase === 'WAITING') {
    return { ok: false, error: 'Igra još nije počela' };
  }
  if (room.game.state.phase === 'MATCH_OVER') {
    return { ok: false, error: 'Partija je već završena' };
  }
  if (room.seatUserIds[seat] === null) {
    return { ok: false, error: 'Sedište je već prazno' };
  }
  if (room.abandonedSeat === seat) {
    return { ok: false, error: 'Igrač je već napustio ovo sedište' };
  }

  const kickedUserId = room.seatUserIds[seat]!;
  const priorName = room.seatNames[seat] ?? 'Igrač';
  const frozenBula = room.game.state.bulas[seat];
  room.frozenBula = frozenBula;
  room.abandonedSeat = seat;
  room.seatNames[seat] = `${priorName} (izbačen)`;

  const kickedSocket = room.sockets[seat];
  room.sockets[seat] = null;
  if (kickedSocket) {
    kickedSocket.emit('room:kicked', { code: room.code, reason: reason ?? null });
    kickedSocket.leave(room.code);
  }
  clearUserLocation(kickedUserId);

  const message: ChatMessage = {
    name: 'Sistem',
    role: 'spectator',
    seat: null,
    text: `${priorName} je izbačen iz partije od strane administratora na buli ${frozenBula}. AI preuzima do kraja ove ruke.`,
    ts: Date.now(),
  };
  room.chatLog.push(message);
  if (room.chatLog.length > CHAT_LOG_LIMIT) {
    room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_LIMIT);
  }
  room.sockets.forEach((s) => s?.emit('chat:message', message));
  room.spectators.forEach((sp) => sp.socket?.emit('chat:message', message));

  broadcastRoomState(room);
  return { ok: true, frozenBula };
}

// Admin panel — potpuno gasi sobu, u BILO KOJOJ fazi (za razliku od
// adminKickSeat koji uklanja samo jedno sediste). Za "zaglavljenu"/mrtvu
// sobu koju kick ne moze da resi (npr. oba igraca ispala istovremeno).
export function adminCloseRoom(room: RoomState, reason?: string): void {
  if (room.nextHandTimeout) {
    clearTimeout(room.nextHandTimeout);
    room.nextHandTimeout = null;
  }
  const payload = { code: room.code, reason: reason ?? null };
  room.sockets.forEach((socket, seat) => {
    const uid = room.seatUserIds[seat];
    if (uid !== null) clearUserLocation(uid);
    socket?.emit('room:closed', payload);
    socket?.leave(room.code);
  });
  room.spectators.forEach((sp) => {
    clearUserLocation(sp.userId);
    sp.socket?.emit('room:closed', payload);
    sp.socket?.leave(room.code);
  });
  removeRoom(room.code);
}
