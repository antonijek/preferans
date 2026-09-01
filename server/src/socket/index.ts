import type { Server, Socket } from 'socket.io';
import { verifyToken } from '../auth/middleware.js';
import { get } from '../db.js';
import { registerRoomHandlers } from './roomEvents.js';

interface UserRow {
  id: number;
  email: string;
  name: string | null;
}

export function registerSocketHandlers(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') {
      next(new Error('Missing auth token'));
      return;
    }
    try {
      const payload = verifyToken(token);
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
    registerRoomHandlers(io, socket);
  });
}
