import { createRoomState } from './RoomState.js';
import type { RoomState } from './RoomState.js';
import type { Position } from '../../../engine/dist/types.js';

export type UserLocation =
  | { code: string; role: 'player'; seat: Position }
  | { code: string; role: 'spectator' };

const roomsByCode = new Map<string, RoomState>();
const userLocation = new Map<number, UserLocation>();

// Excludes visually ambiguous characters (0/O, 1/I) so codes are easy to read aloud/type.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

function generateCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: CODE_LENGTH },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (roomsByCode.has(code));
  return code;
}

export function createRoom(): RoomState {
  const code = generateCode();
  const room = createRoomState(code);
  roomsByCode.set(code, room);
  return room;
}

export function getRoomByCode(code: string): RoomState | undefined {
  return roomsByCode.get(code.toUpperCase());
}

export function getUserLocation(userId: number): UserLocation | undefined {
  return userLocation.get(userId);
}

export function setUserLocation(userId: number, loc: UserLocation): void {
  userLocation.set(userId, loc);
}

export function clearUserLocation(userId: number): void {
  userLocation.delete(userId);
}
