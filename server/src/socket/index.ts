import type { Server, Socket } from 'socket.io';
import { verifyToken } from '../auth/middleware.js';
import { get } from '../db.js';
import { registerRoomHandlers } from './roomEvents.js';

interface UserRow {
  id: number;
  email: string;
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
    const user = get<UserRow>('SELECT id, email FROM users WHERE id = ?', [userId]);
    socket.data.name = user?.email ?? `player-${userId}`;
    console.log(`Socket ${socket.id} authenticated as user ${userId} (${socket.data.name})`);
    registerRoomHandlers(io, socket);
  });
}
