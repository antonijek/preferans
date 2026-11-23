// Zapis jedne zavrsene ruke: pocetne ruke sve trojice, licitacija, stihovi i ishod. Isti zapis pravi server
// (online partije, za pregled) i klijent (igra protiv racunara, za analizu — korisnikov zahtev 2026-11-23).
//
// Pocetne ruke (korisnikov zahtev 2026-10-20: "da vidis svaku ruku rekonstruisanu"): engine ne pamti
// pocetno deljenje, a na kraju ruke ima sve delove: odigrane karte (stihovi), karte koje su ostale u ruci
// (ruka zavrsena pre 10. stiha, npr. niko ne dolazi) i skart nosioca. Nosilac koji je uzeo talon:
// ruka = odigrano + ostalo + skart − talon.

import type { GameState, Position } from './types.js';

export interface PlainCard {
  suit: string;
  rank: string;
}

/** Kompaktan snapshot ruke dovoljan za replay i analizu; cuva se u match_log.hands_json i local_hands. */
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
  // Da li je nosilac presao ili pao
  passed: boolean;
  // Finalne bule i supe delte POSLE ove ruke
  bulasAfter: [number, number, number];
  supeDelta: [number, number, number];
  // Kompletni štihovi ove ruke — svaki je niz karata sa pozicijama
  tricks: Array<Array<{ position: Position; suit: string; rank: string }>>;
  // Koliko je stihova svaki igrac uzeo
  tricksWon: [number, number, number];
  // Talon — za rekonstrukciju deljenja
  talon: Array<{ suit: string; rank: string }>;
  // Pregled partije (2026-10-20) — stariji zapisi ovo nemaju:
  // delilac, cela licitacija, pocetne ruke sve trojice i skart nosioca.
  dealer?: Position;
  bids?: Array<{ player: Position; type: string; value?: number }>;
  hands?: Array<Array<{ suit: string; rank: string }>>;
  discard?: Array<{ suit: string; rank: string }>;
  // ko je dao kontru (2026-10-20) — rekontru/mortkontru daje nosilac, subkontru opet kontras
  kontraPlayer?: Position | null;
  // ruka zavrsena sa "nosim sve" — ko je tvrdio (2026-10-20)
  claimedBy?: Position | null;
}

const key = (c: PlainCard) => `${c.rank}${c.suit}`;
const plain = (c: PlainCard): PlainCard => ({ suit: c.suit, rank: c.rank });

export function initialHands(s: GameState): [PlainCard[], PlainCard[], PlainCard[]] {
  const out: [PlainCard[], PlainCard[], PlainCard[]] = [[], [], []];
  for (const p of [0, 1, 2] as Position[]) {
    const cards = new Map<string, PlainCard>();
    const add = (c: PlainCard) => cards.set(key(c), plain(c));
    for (const trick of [...s.tricks, s.currentTrick]) for (const tc of trick) if (tc.player === p) add(tc.card);
    for (const c of s.players[p]!.hand) add(c);
    if (p === s.winner && s.discard.length > 0) {
      for (const c of s.discard) add(c);
      for (const c of s.lastTalon) cards.delete(key(c));
    }
    out[p] = [...cards.values()];
  }
  return out;
}

/** Zapis ruke iz stanja igre na njenom kraju (GAME_OVER ili MATCH_OVER). */
export function buildHandSnapshot(s: GameState): HandSnapshot {
  return {
    round: s.round,
    endedAt: new Date().toISOString(),
    declarer: s.winner ?? 0,
    declaredGame: s.declaredGame ?? '',
    caller: s.caller,
    callee: s.callee,
    followChoices: [s.followChoices[0] ?? null, s.followChoices[1] ?? null, s.followChoices[2] ?? null],
    kontraLevel: s.kontraLevel,
    passed: s.lastHandResult?.passed ?? false,
    bulasAfter: [...s.bulas] as [number, number, number],
    supeDelta: s.lastHandResult?.supeDelta ?? [0, 0, 0],
    tricks: s.tricks.map((trick) =>
      trick.map((tc) => ({ position: tc.player, suit: tc.card.suit, rank: tc.card.rank })),
    ),
    tricksWon: [s.players[0].tricksWon, s.players[1].tricksWon, s.players[2].tricksWon],
    talon: (s.lastTalon.length ? s.lastTalon : s.talon).map(plain),
    dealer: s.dealer,
    bids: s.bids.map((b) => ({ ...b })),
    hands: initialHands(s),
    discard: s.discard.map(plain),
    kontraPlayer: s.kontraPlayer,
    claimedBy: s.claimedBy ?? null,
  };
}
