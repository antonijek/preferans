import { createRoomState } from './RoomState.js';
import type { RoomState, RoomOptions } from './RoomState.js';
import { Game } from '../../../engine/dist/game.js';
import type { Position } from '../../../engine/dist/types.js';
import { saveActiveRoom, deleteActiveRoom, getAllActiveRooms } from '../db.js';

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

export function createRoom(options?: RoomOptions): RoomState {
  const code = generateCode();
  const room = createRoomState(code, options);
  roomsByCode.set(code, room);
  return room;
}

export function getRoomByCode(code: string): RoomState | undefined {
  return roomsByCode.get(code.toUpperCase());
}

// Uzivo prijavljen bag: sobe se nikad nisu brisale, pa je soba u cekanju
// (pre pocetka igre) ostajala zauvek vidljiva/otvorena u lobiju cak i kad
// je svako ko ju je napravio odavno diskonektovan i nikad se nece vratiti
// (pozivalac — roomEvents.ts's disconnect handler — sam odlucuje KADA je
// "prazna", ovo samo cisti mapu).
export function removeRoom(code: string): void {
  const upper = code.toUpperCase();
  roomsByCode.delete(upper);
  deleteActiveRoom(upper);
}

export interface RoomSummary {
  code: string;
  playerCount: number;
  locked: boolean;
}

// Only rooms still recruiting players (WAITING phase, an open seat) show up
// — once a hand is dealt there's no seat left to join as a player anyway.
export function listOpenRooms(): RoomSummary[] {
  const rooms: RoomSummary[] = [];
  for (const room of roomsByCode.values()) {
    const playerCount = room.seatUserIds.filter((u) => u !== null).length;
    if (room.game.state.phase === 'WAITING' && playerCount < 3) {
      rooms.push({ code: room.code, playerCount, locked: room.locked });
    }
  }
  return rooms;
}

export interface RoomDetail {
  code: string;
  phase: string;
  seatNames: [string | null, string | null, string | null];
  spectatorCount: number;
  locked: boolean;
  createdAt: number;
}

// Admin view — EVERY room regardless of phase/openness, unlike
// listOpenRooms() (the public lobby, which only shows WAITING rooms with
// a free seat).
export function listAllRoomsDetailed(): RoomDetail[] {
  return Array.from(roomsByCode.values()).map((room) => ({
    code: room.code,
    phase: room.game.state.phase,
    seatNames: room.seatNames,
    spectatorCount: room.spectators.size,
    locked: room.locked,
    createdAt: room.createdAt,
  }));
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

// WAITING soba (partija jos nije pocela) koja nema aktivnih konekcija se
// automatski brise posle 30 min — sprecava curenje memorije kad igrac
// napravi sobu i zaboravi na nju. Za sobe u toku partije NE vazi (M6
// reconnect moze da ceka neograniceno).
const ABANDONED_WAITING_MS = 30 * 60 * 1000;

export function removeAbandonedWaitingRooms(): number {
  const now = Date.now();
  let removed = 0;
  for (const [code, room] of roomsByCode) {
    const anyoneConnected =
      room.sockets.some((s) => s !== null) ||
      Array.from(room.spectators.values()).some((s) => s.socket !== null);
    const isWaiting = room.game.state.phase === 'WAITING';
    if (isWaiting && !anyoneConnected && now - room.createdAt > ABANDONED_WAITING_MS) {
      roomsByCode.delete(code);
      deleteActiveRoom(code);
      removed++;
    }
  }
  return removed;
}

// === Trajno cuvanje aktivnih (nezavrsenih) soba ===
// Korisnikov zahtev (2026-09-18): "da se pamte ruke i partija koje nisu
// zavrsene, da se moze nastaviti u drugom terminu" — dosad su sobe zivele
// SAMO u ovoj Map-i (roomsByCode), pa je SVAKI restart servera (deploy,
// pad, itd.) potpuno brisao partije u toku, bez ikakvog traga ili nacina
// da se nastavi. Serijalizuje se SVE sto nije zivi runtime resurs (sockets,
// spectator Map-a, timer handle) — ti delovi se posle ucitavanja NAMERNO
// resetuju na "niko trenutno povezan", isti pocetak kao da je server
// upravo pokrenut a igraci ce se sami re-konektovati preko VEC POSTOJECEG
// M6 reconnect mehanizma (setUserLocation ispod ga cini transparentnim —
// klijent ne mora nista posebno da zna).
interface SerializedRoom {
  code: string;
  gameState: unknown;
  gameConfig: { refePerPlayer: number; initialBule: number };
  locked: boolean;
  createdAt: number;
  seatUserIds: [number | null, number | null, number | null];
  seatNames: [string | null, string | null, string | null];
  chatLog: RoomState['chatLog'];
  abandonedSeat: Position | null;
  frozenBula: number | null;
  dealNextReady: Position[];
  endMatchReady: Position[];
  seatRatings: [number, number, number];
  matchRankingResolved: boolean;
  handsHistory: RoomState['handsHistory'];
  handSnapshotTaken: boolean;
}

function serializeRoom(room: RoomState): SerializedRoom {
  return {
    code: room.code,
    gameState: room.game.state,
    gameConfig: room.game.getConfig(),
    locked: room.locked,
    createdAt: room.createdAt,
    seatUserIds: room.seatUserIds,
    seatNames: room.seatNames,
    chatLog: room.chatLog,
    abandonedSeat: room.abandonedSeat,
    frozenBula: room.frozenBula,
    dealNextReady: Array.from(room.dealNextReady),
    endMatchReady: Array.from(room.endMatchReady),
    seatRatings: room.seatRatings,
    matchRankingResolved: room.matchRankingResolved,
    handsHistory: room.handsHistory,
    handSnapshotTaken: room.handSnapshotTaken,
  };
}

// Poziva se iz roomBroadcast.ts's broadcastRoomState() — isti choke point
// koji vec pokriva SVAKU stvarnu promenu stanja partije (licitacija,
// igranje karte, chat...). Sam upis na disk je vec debounced (db.ts's
// persist(), deljeno sa ostatkom baze) — ovo samo azurira in-memory sql.js
// reprezentaciju, jeftino, bez obzira koliko cesto se pozove.
export function persistRoom(room: RoomState): void {
  saveActiveRoom(room.code, JSON.stringify(serializeRoom(room)));
}

// Poziva se JEDNOM pri startu servera (index.ts, posle initDb() a PRE
// httpServer.listen()) — vraca sve nezavrsene sobe iz baze nazad u
// roomsByCode, i rekonstruise userLocation za SEDECE igrace (ne za
// gledaoce — oni jednostavno ponovo zatraze kibic ako se vrate) tako da
// postojeci M6 reconnect kod (registerRoomHandlers) radi bez IKAKVE izmene.
export function loadPersistedRooms(): number {
  const rows = getAllActiveRooms();
  let loaded = 0;
  for (const row of rows) {
    let parsed: SerializedRoom;
    try {
      parsed = JSON.parse(row.state_json);
    } catch {
      continue; // ostecen/nekompatibilan zapis — preskoči, ne rusi start servera
    }
    const game = new Game({ ...parsed.gameConfig, seed: Date.now() });
    game.state = parsed.gameState as typeof game.state;
    const room: RoomState = {
      code: parsed.code,
      game,
      locked: parsed.locked,
      createdAt: parsed.createdAt,
      seatUserIds: parsed.seatUserIds,
      seatNames: parsed.seatNames,
      sockets: [null, null, null],
      spectators: new Map(),
      chatLog: parsed.chatLog,
      abandonedSeat: parsed.abandonedSeat,
      frozenBula: parsed.frozenBula,
      nextHandScheduled: false,
      nextHandTimeout: null,
      dealNextReady: new Set(parsed.dealNextReady),
      endMatchReady: new Set(parsed.endMatchReady),
      seatRatings: parsed.seatRatings,
      matchRankingResolved: parsed.matchRankingResolved,
      handsHistory: parsed.handsHistory,
      handSnapshotTaken: parsed.handSnapshotTaken,
    };
    roomsByCode.set(room.code, room);
    for (const seat of [0, 1, 2] as Position[]) {
      const uid = room.seatUserIds[seat];
      if (uid !== null) userLocation.set(uid, { code: room.code, role: 'player', seat });
    }
    loaded++;
  }
  return loaded;
}
