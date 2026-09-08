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
  // Postavlja se kad neko klikne "Pogledaj karte" — iskljucuje automatski
  // tajmer TRAJNO za ovu zavrsenu ruku (korisnikov zahtev: ko hoce da
  // pregleda ruku detaljno, treba mu vremena bez pritiska tajmera; posle
  // toga SAMO rucni "Deli" klik nastavlja). Resetuje se na false cim
  // sledeca ruka stvarno pocne.
  autoAdvancePaused: boolean;
  // Koja sedista su vec kliknula "Deli" za OVU zavrsenu ruku — korisnikov
  // zahtev: jedan igrac vise NE SME sam da forsira sledecu rundu za sve
  // (ranije je game:dealNext delio odmah na PRVI klik). Sad ceka da SVI
  // aktivni (ne napusteni) igraci kliknu, ili istekne auto-tajmer. Resetuje
  // se u dealNextHand() cim sledeca ruka stvarno pocne.
  dealNextReady: Set<Position>;
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
    autoAdvancePaused: false,
    dealNextReady: new Set(),
  };
}
