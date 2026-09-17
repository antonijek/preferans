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
  // Handle da bi se zakazani automatski nastavak mogao OTKAZATI (game:viewCards)
  // — obicno polje, ne samo bool, jer treba nesto sto se moze clearTimeout-ovati.
  nextHandTimeout: ReturnType<typeof setTimeout> | null;
  // Koja sedista su vec kliknula "Deli" za OVU zavrsenu ruku — korisnikov
  // zahtev: jedan igrac vise NE SME sam da forsira sledecu rundu za sve
  // (ranije je game:dealNext delio odmah na PRVI klik). Sad ceka da SVI
  // aktivni (ne napusteni) igraci kliknu, ili istekne auto-tajmer. Resetuje
  // se u dealNextHand() cim sledeca ruka stvarno pocne.
  dealNextReady: Set<Position>;
  // Korisnikov zahtev (2026-09-10) — "Predlog za kraj": ista logika kao
  // dealNextReady, ali za glasanje o ranom zavrsetku partije. Prazan Set
  // znaci "nema aktivnog predloga".
  endMatchReady: Set<Position>;
  // Rejting (ELO-stil bodovi) po sedistu, keshiran iz baze pri ulasku u
  // sobu i osvezen posle svakog kraja partije — broadcastRoomState() ga
  // ubacuje u redigovano stanje da klijent moze da prikaze "Ime (rejting)".
  seatRatings: [number, number, number];
  // Sprecava dupli obracun rejtinga ako broadcastRoomState() bude pozvan
  // vise puta dok je phase vec MATCH_OVER (isti obrazac kao
  // nextHandScheduled za GAME_OVER).
  matchRankingResolved: boolean;
  // Istorija partija (korisnikov zahtev 2026-09-11) — push-uje se snapshot
  // GameState-a na kraj SVAKE ruke (u roomEvents posle endHand-a),
  // konzumira u resolveMatchRanking i upisuje u match_log kao hands_json.
  // Cuvamo samo ključna polja (ne celokupan state — ima nepotrebne runtime
  // stvari), dovoljno za replay analizu sporne partije.
  handsHistory: HandSnapshot[];
  // Flag za sprečavanje duplog push-a handHistory-a ako se
  // broadcastRoomState pozove vise puta dok je phase GAME_OVER.
  handSnapshotTaken: boolean;
}

export interface HandSnapshot {
  round: number;
  endedAt: string;
  // Ko je bio nosilac (deklarant)
  declarer: Position;
  // Koja igra (Pik/Herc/Betl/Sans/Igra-...)
  declaredGame: string;
  // Ko je sve dosao (pozivalac, pratioci)
  caller: Position | null;
  callee: Position | null;
  followChoices: [string | null, string | null, string | null];
  // Kontrin nivo na kraju (KONTRA/REKONTRA/SUBKONTRA/MORTKONTRA/null)
  kontraLevel: string | null;
  // Ko je pobedio ruku (nosilac prosao ili pao)
  passed: boolean;
  // Finalne bule i supe delte POSLE ove ruke
  bulasAfter: [number, number, number];
  supeDelta: [number, number, number];
  // Kompletni štihovi ove ruke — svaki je niz karata sa pozicijama
  tricks: Array<Array<{ position: Position; suit: string; rank: string }>>;
  // Poeni po igracu (koliko stihova je svaki uzeo)
  tricksWon: [number, number, number];
  // Seed i talon — za rekonstrukciju deljenja
  talon: Array<{ suit: string; rank: string }>;
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
    nextHandTimeout: null,
    dealNextReady: new Set(),
    endMatchReady: new Set(),
    seatRatings: [1000, 1000, 1000],
    matchRankingResolved: false,
    handsHistory: [],
    handSnapshotTaken: false,
  };
}
