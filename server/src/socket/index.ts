import type { Server, Socket } from 'socket.io';
import { verifyToken } from '../auth/middleware.js';
import { get } from '../db.js';
import { registerRoomHandlers } from './roomEvents.js';
import { markOnline, markOffline, getSocketIdsForUser } from '../presence.js';

interface UserRow {
  id: number;
  email: string;
  name: string | null;
}

// Admin "banuj nalog" (2026-09-17) — login/socket-connect provere same
// blokiraju BUDUCE konekcije; ovo dozvoljava trenutno prekidanje vec
// aktivnog socket-a cim admin postavi banned=1, umesto da se ceka na
// sledeci reconnect koji ce ionako biti odbijen na `io.use` proveri ispod.
let ioRef: Server | null = null;

export function forceDisconnectUser(userId: number): void {
  if (!ioRef) return;
  for (const socketId of getSocketIdsForUser(userId)) {
    ioRef.sockets.sockets.get(socketId)?.disconnect(true);
  }
}

export function registerSocketHandlers(io: Server): void {
  ioRef = io;
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') {
      next(new Error('Missing auth token'));
      return;
    }
    try {
      const payload = verifyToken(token);
      // Ban se ne moze zapisati u JWT (vec izdati tokeni bi i dalje radili) —
      // mora se proveriti direktno u bazi na svako povezivanje.
      const user = get<{ banned: number }>('SELECT banned FROM users WHERE id = ?', [payload.userId]);
      if (user?.banned) {
        next(new Error('Account banned'));
        return;
      }
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid auth token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: number = socket.data.userId;
    const user = get<UserRow>('SELECT id, email, name FROM users WHERE id = ?', [userId]);
    // name fallback to email covers accounts registered before this column
    // existed (production already had real users at the time it was added).
    socket.data.name = user?.name || user?.email || `player-${userId}`;
    console.log(`Socket ${socket.id} authenticated as user ${userId} (${socket.data.name})`);
    markOnline(socket.id, userId, socket.data.name);
    socket.on('disconnect', () => markOffline(socket.id));
    registerRoomHandlers(io, socket);
  });
}
