// "Nosim sve stihove do kraja" (korisnikov zahtev 2026-10-20): igrac tvrdi
// da nosi sve preostale stihove, ostali aktivni igraci moraju da se sloze —
// tad se ruka zavrsava kao da ih je sve odneo (Game.claimRemainingTricks).
// Racunar (sto sa racunarom, napusteno mesto) se slaze samo ako je tvrdnja
// zaista sigurna (claimIsCertain). Ako bilo ko odbije, ili ako neko odigra
// kartu (broadcastRoomState), predlog otpada i igra se dalje.

import type { Socket } from 'socket.io';
import type { Position } from '../../../engine/dist/types.js';
import { claimIsCertain } from '../../../engine/dist/claim.js';
import { getRoomByCode, getUserLocation } from '../rooms/RoomManager.js';
import type { RoomState } from '../rooms/RoomState.js';
import { broadcastRoomState, postSystemMessage } from './roomBroadcast.js';

type Ack = (response: Record<string, unknown>) => void;

// ko ne odgovori (npr. ispao je) ne sme da zaustavi sto
const CLAIM_ANSWER_MS = 30_000;

const seatName = (room: RoomState, seat: Position) => room.seatNames[seat] ?? 'igrač';

const isAiSeat = (room: RoomState, seat: Position) =>
  room.botSeats.has(seat) || room.abandonedSeat === seat;

function otherActiveSeats(room: RoomState, by: Position): Position[] {
  return ([0, 1, 2] as Position[]).filter((p) => p !== by && room.game.isPlayerActive(p));
}

function clearClaim(room: RoomState): void {
  if (room.claim) clearTimeout(room.claim.timeout);
  room.claim = null;
}

function finishIfAllAgreed(room: RoomState): void {
  const claim = room.claim;
  if (!claim) return;
  if (!otherActiveSeats(room, claim.by).every((p) => claim.accepted.has(p))) return;
  clearClaim(room);
  if (room.game.claimRemainingTricks(claim.by)) {
    const name = seatName(room, claim.by);
    postSystemMessage(room, `🏁 Svi su se složili — ${name} nosi sve preostale štihove.`);
  }
  broadcastRoomState(room);
}

function reject(room: RoomState, by: Position): void {
  clearClaim(room);
  postSystemMessage(room, `${seatName(room, by)} se ne slaže — igra se dalje.`);
  broadcastRoomState(room);
}

export function registerClaimHandlers(socket: Socket, userId: number): void {
  const currentRoom = (): RoomState | undefined => {
    const loc = getUserLocation(userId);
    return loc ? getRoomByCode(loc.code) : undefined;
  };
  const mySeat = (): Position | null => {
    const loc = getUserLocation(userId);
    return loc?.role === 'player' ? loc.seat : null;
  };

  socket.on('game:claim', (_payload: unknown, ack?: Ack) => {
    const room = currentRoom();
    const seat = mySeat();
    const s = room?.game.state;
    const between = s?.phase === 'PLAYING' && s.currentTrick.length === 0;
    if (!room || !s || seat === null || !between || !room.game.isPlayerActive(seat)) {
      ack?.({ error: 'Sada ne možeš da tvrdiš da nosiš sve — samo između dva štiha.' });
      return;
    }
    if (s.declaredGame === 'Betl' || s.declaredGame === 'Igra-Betl') {
      ack?.({ error: 'U Betlu nema „nosim sve“.' });
      return;
    }
    if (room.claim) {
      ack?.({ error: 'Već se čeka odgovor na jedan predlog.' });
      return;
    }
    const timeout = setTimeout(() => {
      if (room.claim?.timeout !== timeout) return;
      clearClaim(room);
      postSystemMessage(room, 'Nisu svi odgovorili na „nosim sve“ — igra se dalje.');
      broadcastRoomState(room);
    }, CLAIM_ANSWER_MS);
    // bez poruke u chatu: chat se sam otvara i na telefonu bi prekrio dugmad
    // za odgovor — predlog se vidi u okviru za odgovor (claim-ui.js)
    room.claim = { by: seat, accepted: new Set(), timeout };
    ack?.({ ok: true });
    // racunar odmah odlucuje: slaze se samo ako je tvrdnja sigurna
    const aiSeats = otherActiveSeats(room, seat).filter((p) => isAiSeat(room, p));
    if (aiSeats.length > 0 && !claimIsCertain(s, seat)) {
      reject(room, aiSeats[0]!);
      return;
    }
    for (const p of aiSeats) room.claim.accepted.add(p);
    broadcastRoomState(room);
    finishIfAllAgreed(room);
  });

  socket.on('game:claimVote', (payload: { accept?: boolean } | undefined, ack?: Ack) => {
    const room = currentRoom();
    const seat = mySeat();
    const claim = room?.claim;
    if (!room || !claim || seat === null || seat === claim.by || !room.game.isPlayerActive(seat)) {
      ack?.({ error: 'Nema predloga na koji možeš da odgovoriš.' });
      return;
    }
    ack?.({ ok: true });
    if (!payload?.accept) {
      reject(room, seat);
      return;
    }
    claim.accepted.add(seat);
    broadcastRoomState(room);
    finishIfAllAgreed(room);
  });
}
