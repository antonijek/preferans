// Tracks every currently-connected authenticated socket, independent of
// room membership — the "who's online right now" list on the lobby
// screen, separate from listOpenRooms()/listAllRoomsDetailed() which only
// know about people already inside a room.
const online = new Map<string, { userId: number; name: string }>();

export function markOnline(socketId: string, userId: number, name: string): void {
  online.set(socketId, { userId, name });
}

export function markOffline(socketId: string): void {
  online.delete(socketId);
}

export function listOnlineUsers(): { name: string }[] {
  // A user connected in multiple tabs shouldn't appear twice.
  const seen = new Set<number>();
  const result: { name: string }[] = [];
  for (const { userId, name } of online.values()) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    result.push({ name });
  }
  return result;
}
