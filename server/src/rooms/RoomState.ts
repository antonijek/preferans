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
  role: 'player' | 'spectator' | 'system';
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
  // Kad je soba poslednji put stvarno promenila stanje (broadcastRoomState()
  // je azurira, isti choke point kao persistRoom() — vidi RoomManager.ts).
  // Odvojeno od createdAt (koje ostaje fiksno) — koristi se da se prepozna
  // soba u kojoj je SVAKO sediste prazno vec dugo (vidi removeStuckRooms).
  lastActivityAt: number;
  seatUserIds: [number | null, number | null, number | null];
  seatNames: [string | null, string | null, string | null];
  sockets: [Socket | null, Socket | null, Socket | null];
  spectators: Map<number, SpectatorInfo>; // keyed by userId
  chatLog: ChatMessage[];
  abandonedSeat: Position | null;
  frozenBula: number | null;
  // Korisnikov zahtev (2026-10-14): racunar popunjava prazna mesta da niko
  // ne ceka sam. Sedista koja od pocetka vozi server AI (aiSeat.ts) —
  // seatUserIds[seat] im je null, pa joinAsPlayer() covekom koji naidje
  // prirodno zauzme bas to mesto (i skine ga odavde). Odvojeno od
  // abandonedSeat: napusteno mesto zaustavlja deljenje novih ruku, racunar ne.
  botSeats: Set<Position>;
  // Bar jednom je za stolom sedeo racunar — takva partija se ne racuna za
  // rejting (inace bi se bodovi "farmali" protiv AI-ja).
  hadBots: boolean;
  // Zakazan potez AI-ja (racunar/napusteno mesto) — jedan po sobi, inace
  // bi svaki broadcastRoomState() zakazao jos jedan i AI bi igrao duplo.
  aiTurnTimeout: ReturnType<typeof setTimeout> | null;
  // Vreme za potez (korisnikov zahtev 2026-10-14, po uzoru na konkurenciju):
  // sekundi po potezu, 0 = bez ogranicenja. Kad istekne, racunar odigra za
  // tog igraca, da jedan spor ili ispao igrac ne zaustavi ceo sto.
  turnSeconds: number;
  turnKey: string | null; // koja odluka se trenutno ceka (isti kljuc = isti sat)
  turnTimeout: ReturnType<typeof setTimeout> | null;
  turnDeadline: number | null;
  turnTotalMs: number;
  // Revans (korisnikov zahtev 2026-10-14): kod nove sobe koju je neko od
  // igraca ove (zavrsene) partije otvorio — ostali ulaze u nju jednim klikom.
  rematchCode: string | null;
  // Za koju odluku (turnDecisionKey) je igracu vec poslato "tvoj potez" —
  // isto stanje poslato ponovo ne salje ponovo obavestenje.
  notifiedTurnKey: string | null;
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
    lastActivityAt: Date.now(),
    seatUserIds: [null, null, null],
    seatNames: [null, null, null],
    sockets: [null, null, null],
    spectators: new Map(),
    chatLog: [],
    abandonedSeat: null,
    frozenBula: null,
    botSeats: new Set(),
    hadBots: false,
    aiTurnTimeout: null,
    turnSeconds: 0,
    turnKey: null,
    turnTimeout: null,
    turnDeadline: null,
    turnTotalMs: 0,
    rematchCode: null,
    notifiedTurnKey: null,
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
