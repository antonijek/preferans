import { Game } from '../../../engine/dist/game.js';
import type { Socket } from 'socket.io';
import type { Position } from '../../../engine/dist/types.js';

export interface SpectatorInfo {
  userId: number;
  name: string;
  socket: Socket | null;
  kibicSeats: Set<Position>;
}

export interface ChatMessage {
  name: string;
  role: 'player' | 'spectator';
  seat: Position | null;
  text: string;
  ts: number;
}

export const CHAT_LOG_LIMIT = 50;

export interface RoomState {
  code: string;
  game: Game;
  locked: boolean;
  createdAt: number;
  seatUserIds: [number | null, number | null, number | null];
  seatNames: [string | null, string | null, string | null];
  sockets: [Socket | null, Socket | null, Socket | null];
  spectators: Map<number, SpectatorInfo>; // keyed by userId
  chatLog: ChatMessage[];
  abandonedSeat: Position | null;
  frozenBula: number | null;
  // Sprecava dupliranje setTimeout-a za automatski nastavak na sledecu ruku
  // — broadcastRoomState() se poziva mnogo puta dok je faza GAME_OVER
  // (svaki put kad neko npr. otvori chat), bez ovoga bi se zakazalo N
  // paralelnih newHand() poziva.
  nextHandScheduled: boolean;
}

export interface RoomOptions {
  initialBule?: number;
  refePerPlayer?: number;
}

export function createRoomState(code: string, options: RoomOptions = {}): RoomState {
  return {
    code,
    game: new Game({ seed: Date.now(), ...options }),
    locked: false,
    createdAt: Date.now(),
    seatUserIds: [null, null, null],
    seatNames: [null, null, null],
    sockets: [null, null, null],
    spectators: new Map(),
    chatLog: [],
    abandonedSeat: null,
    frozenBula: null,
    nextHandScheduled: false,
  };
}
