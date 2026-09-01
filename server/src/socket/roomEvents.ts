import type { Server, Socket } from 'socket.io';
import {
  createRoom,
  getRoomByCode,
  getUserLocation,
  setUserLocation,
  listOpenRooms,
} from '../rooms/RoomManager.js';
import type { RoomState, ChatMessage } from '../rooms/RoomState.js';
import { CHAT_LOG_LIMIT } from '../rooms/RoomState.js';
import type { Position } from '../../../engine/dist/types.js';
import { redactStateFor } from '../redact.js';
import type { Viewer } from '../redact.js';
import { applyAction, withAuthenticatedActor } from './gameEvents.js';
import type { GameAction } from './gameEvents.js';
import { listOnlineUsers } from '../presence.js';

type Ack = (response: Record<string, unknown>) => void;

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sendChatBacklog(socket: Socket, room: RoomState): void {
  socket.emit('chat:backlog', room.chatLog);
}

// A couple of small values (whose turn it is to kontra, which of MY OWN
// cards are currently legal to play) require private engine logic
// (`followersInKontraOrder`, trick-following rules) that isn't worth
// duplicating client-side — the server already has the authoritative `Game`
// instance right here, so it just computes them once and rides along with
// the redacted state. Neither leaks anything: expectedKontraPlayer is public
// (same visibility as currentBidder/currentPlayer), and legalCards is
// derived purely from cards the viewer can already see (their own hand).
function buildClientState(room: RoomState, viewer: Viewer) {
  const redacted = redactStateFor(room.game.state, viewer);
  const legalCards =
    viewer.type === 'player' && room.game.state.phase === 'PLAYING'
      ? room.game.getLegalCards(viewer.seat)
      : [];
  // The engine's Player.name is always the generic 'Jug'/'Istok'/'Zapad'
  // (the Game is constructed with no playerNames override) — swap in the
  // real registered name per seat so the client can show who's actually
  // playing instead of a fixed position label. Not secret, safe for
  // players AND spectators alike.
  const players = redacted.players.map((p, i) => ({
    ...p,
    name: room.seatNames[i] ?? p.name,
  })) as typeof redacted.players;
  return {
    ...redacted,
    players,
    expectedKontraPlayer: room.game.expectedKontraPlayerPublic(),
    legalCards,
  };
}

function broadcastRoomState(room: RoomState): void {
  room.sockets.forEach((socket, seat) => {
    socket?.emit('game:state', buildClientState(room, { type: 'player', seat: seat as Position }));
  });
  room.spectators.forEach((spectator) => {
    spectator.socket?.emit(
      'game:state',
      buildClientState(room, { type: 'spectator', kibicSeats: spectator.kibicSeats })
    );
  });
}

/** Seats `userId` into `room`, reusing their existing seat if they already have one (rejoin). */
function joinAsPlayer(room: RoomState, userId: number, socket: Socket, name: string): Position | null {
  const existingSeat = room.seatUserIds.findIndex((u) => u === userId);
  let seat: Position;
  if (existingSeat !== -1) {
    seat = existingSeat as Position;
  } else {
    const openSeat = room.seatUserIds.findIndex((u) => u === null);
    if (openSeat === -1) return null;
    seat = openSeat as Position;
    room.seatUserIds[seat] = userId;
  }
  room.seatNames[seat] = name;
  room.sockets[seat] = socket;
  socket.join(room.code);
  setUserLocation(userId, { code: room.code, role: 'player', seat });

  const filled = room.seatUserIds.every((u) => u !== null);
  if (filled && room.game.state.phase === 'WAITING') {
    room.game.newHand();
  }
  return seat;
}

export function registerRoomHandlers(io: Server, socket: Socket): void {
  const userId: number = socket.data.userId;
  const name: string = socket.data.name;

  function currentRoom(): RoomState | undefined {
    const loc = getUserLocation(userId);
    return loc ? getRoomByCode(loc.code) : undefined;
  }

  // M6 reconnect: if this user already has an active room (seat reserved
  // indefinitely — nothing frees it in this MVP, see TODO.md), rejoin them
  // automatically and push their current state without waiting for the
  // client to ask. Kibic grants live on the spectator's RoomState entry,
  // keyed by userId, so they survive this reattachment untouched.
  const existingLocation = getUserLocation(userId);
  if (existingLocation) {
    const room = getRoomByCode(existingLocation.code);
    if (room) {
      if (existingLocation.role === 'player') {
        const seat = joinAsPlayer(room, userId, socket, name);
        if (seat !== null) {
          socket.emit('room:info', { code: room.code, seat, locked: room.locked });
          socket.emit('game:state', buildClientState(room, { type: 'player', seat }));
          sendChatBacklog(socket, room);
        }
      } else {
        const spectator = room.spectators.get(userId);
        if (spectator) {
          spectator.socket = socket;
          socket.join(room.code);
          socket.emit('room:info', { code: room.code, seat: null, locked: room.locked });
          socket.emit(
            'game:state',
            buildClientState(room, { type: 'spectator', kibicSeats: spectator.kibicSeats })
          );
          sendChatBacklog(socket, room);
        }
      }
    }
  }

  socket.on('room:list', (_payload: unknown, ack?: Ack) => {
    ack?.({ rooms: listOpenRooms() });
  });

  socket.on('presence:list', (_payload: unknown, ack?: Ack) => {
    ack?.({ users: listOnlineUsers() });
  });

  socket.on('room:create', (payload: { initialBule?: number; refePerPlayer?: number }, ack?: Ack) => {
    // Client-supplied config is just a preference — always clamp server-side
    // rather than trust it, same principle as withAuthenticatedActor() for
    // game actions.
    const initialBule = clamp(Number(payload?.initialBule), 50, 300, 100);
    const refePerPlayer = clamp(Number(payload?.refePerPlayer), 0, 5, 2);
    const room = createRoom({ initialBule, refePerPlayer });
    const seat = joinAsPlayer(room, userId, socket, name)!;
    ack?.({ code: room.code, seat });
    broadcastRoomState(room);
    sendChatBacklog(socket, room);
  });

  socket.on('room:join', (payload: { code?: string }, ack?: Ack) => {
    const room = getRoomByCode(payload?.code ?? '');
    if (!room) {
      ack?.({ error: 'Room not found' });
      return;
    }
    const seat = joinAsPlayer(room, userId, socket, name);
    if (seat === null) {
      ack?.({ error: 'Room is full' });
      return;
    }
    ack?.({ code: room.code, seat });
    broadcastRoomState(room);
    sendChatBacklog(socket, room);
  });

  socket.on('room:join-as-spectator', (payload: { code?: string }, ack?: Ack) => {
    const room = getRoomByCode(payload?.code ?? '');
    if (!room) {
      ack?.({ error: 'Room not found' });
      return;
    }
    const existing = room.spectators.get(userId);
    if (room.locked && !existing) {
      ack?.({ error: 'Room is locked' });
      return;
    }
    const kibicSeats = existing?.kibicSeats ?? new Set<Position>();
    room.spectators.set(userId, { userId, name, socket, kibicSeats });
    socket.join(room.code);
    setUserLocation(userId, { code: room.code, role: 'spectator' });
    ack?.({ code: room.code });
    socket.emit('game:state', buildClientState(room, { type: 'spectator', kibicSeats }));
    sendChatBacklog(socket, room);
  });

  socket.on('room:toggle-lock', (_payload: unknown, ack?: Ack) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player') {
      ack?.({ error: 'Only seated players can toggle the room lock' });
      return;
    }
    room.locked = !room.locked;
    ack?.({ locked: room.locked });
    io.to(room.code).emit('room:lock-changed', { locked: room.locked });
  });

  socket.on('kibic:request', (payload: { targetSeat?: Position }) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'spectator' || payload?.targetSeat === undefined) return;
    room.sockets[payload.targetSeat]?.emit('kibic:incoming-request', {
      spectatorUserId: userId,
      name,
    });
  });

  socket.on('kibic:respond', (payload: { spectatorUserId?: number; approve?: boolean }) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player' || payload?.spectatorUserId === undefined) return;
    const spectator = room.spectators.get(payload.spectatorUserId);
    if (!spectator || !payload.approve) return;
    spectator.kibicSeats.add(loc.seat);
    spectator.socket?.emit(
      'game:state',
      buildClientState(room, { type: 'spectator', kibicSeats: spectator.kibicSeats })
    );
  });

  socket.on('game:action', (action: GameAction) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player') {
      socket.emit('game:error', 'You are not seated in a room');
      return;
    }
    const safeAction = withAuthenticatedActor(action, loc.seat);
    const accepted = applyAction(room.game, safeAction);
    if (accepted) {
      broadcastRoomState(room);
    } else {
      socket.emit('game:action-rejected', action);
    }
  });

  socket.on('chat:send', (payload: { text?: string }) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || !loc || typeof payload?.text !== 'string' || !payload.text.trim()) return;

    const message: ChatMessage = {
      name,
      role: loc.role,
      seat: loc.role === 'player' ? loc.seat : null,
      text: payload.text.trim().slice(0, 500),
      ts: Date.now(),
    };

    room.chatLog.push(message);
    if (room.chatLog.length > CHAT_LOG_LIMIT) {
      room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_LIMIT);
    }

    io.to(room.code).emit('chat:message', message);
  });

  socket.on('disconnect', () => {
    const loc = getUserLocation(userId);
    if (!loc) return;
    const room = getRoomByCode(loc.code);
    if (!room) return;
    if (loc.role === 'player') {
      if (room.sockets[loc.seat] === socket) room.sockets[loc.seat] = null;
    } else {
      const spectator = room.spectators.get(userId);
      if (spectator?.socket === socket) spectator.socket = null;
    }
  });
}
