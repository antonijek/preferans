import { getUserRating } from './db.js';

// Tracks every currently-connected authenticated socket, independent of
// room membership — the "who's online right now" list on the lobby
// screen, separate from listOpenRooms()/listAllRoomsDetailed() which only
// know about people already inside a room.
const online = new Map<string, { userId: number; name: string; connectedAt: number }>();

export function markOnline(socketId: string, userId: number, name: string): void {
  online.set(socketId, { userId, name, connectedAt: Date.now() });
}

export function markOffline(socketId: string): void {
  online.delete(socketId);
}

export function listOnlineUsers(): { userId: number; name: string; rating: number }[] {
  // A user connected in multiple tabs shouldn't appear twice.
  const seen = new Set<number>();
  const result: { userId: number; name: string; rating: number }[] = [];
  for (const { userId, name } of online.values()) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    result.push({ userId, name, rating: getUserRating(userId) });
  }
  return result;
}

// Admin dashboard "ko je online" (korisnikov zahtev 2026-09-20) — isto kao
// listOnlineUsers() ali sa connectedAt (najranija konekcija ako je korisnik
// otvorio vise tabova) tako da admin panel moze da prikaze "od kad".
export function listOnlineUsersDetailed(): { userId: number; name: string; connectedAt: number }[] {
  const byUser = new Map<number, { userId: number; name: string; connectedAt: number }>();
  for (const { userId, name, connectedAt } of online.values()) {
    const existing = byUser.get(userId);
    if (!existing || connectedAt < existing.connectedAt) {
      byUser.set(userId, { userId, name, connectedAt });
    }
  }
  return [...byUser.values()];
}

// Za "pozovi igraca" (room:invite) — nadje SVE sokete tog korisnika (mozda
// ima vise otvorenih tabova/uredjaja), da pozivnica stigne na svaki.
export function getSocketIdsForUser(userId: number): string[] {
  const ids: string[] = [];
  for (const [socketId, info] of online.entries()) {
    if (info.userId === userId) ids.push(socketId);
  }
  return ids;
}
