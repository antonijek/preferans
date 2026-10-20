// Pregled partije ruku po ruku — jedno mesto za sve sto pregled treba da
// izracuna iz zapisa ruke (HandSnapshot): natpisi licitacije, dobitnik
// svakog stiha i pocetne ruke. Koriste ga stranica (replay.ts → replay.js)
// i tekstualni ispis (matchText.ts). Cista funkcija, bez baze.

import { trickWinner } from '../../engine/dist/trick.js';
import { getTrumpSuit } from '../../engine/dist/scoring.js';
import type { Game, Position, Suit, TrickCard } from '../../engine/dist/types.js';
import type { HandSnapshot } from './rooms/RoomState.js';

export interface PlainCard {
  suit: string;
  rank: string;
}

export function bidLabel(b: { type: string; value?: number }): string {
  if (b.type === 'BID') return String(b.value);
  if (b.type === 'PASS') return 'dalje';
  if (b.type === 'IGRA') return 'igra';
  if (b.type === 'MOGU') return `mogu ${b.value}`;
  return `${b.type}${b.value !== undefined ? ` ${b.value}` : ''}`;
}

/** Dobitnik svakog stiha (null za nezavrsen stih). */
export function trickWinners(h: HandSnapshot): Array<Position | null> {
  const trump = h.declaredGame ? getTrumpSuit(h.declaredGame as Game) : null;
  return h.tricks.map((t) => {
    if (t.length !== 3) return null;
    const tc = t.map((c) => ({ player: c.position, card: { suit: c.suit as Suit, rank: c.rank } })) as unknown as TrickCard[];
    return trickWinner(tc, trump);
  });
}

export interface ReplayHand {
  round: number;
  dealer: Position | null;
  declarer: Position;
  game: string;
  kontraLevel: string | null;
  passed: boolean;
  bids: Array<{ player: Position; label: string }> | null; // null = stari zapis bez licitacije
  follow: Array<string | null>;
  caller: Position | null;
  callee: Position | null;
  talon: PlainCard[];
  discard: PlainCard[] | null;
  // pocetne ruke; complete=false za stari zapis (samo odigrane karte)
  hands: PlainCard[][];
  complete: boolean;
  tricks: Array<{ cards: Array<{ player: Position; card: PlainCard }>; winner: Position | null }>;
  tricksWon: number[];
  bulasAfter: number[];
  supeDelta: number[];
}

const plain = (c: PlainCard): PlainCard => ({ suit: c.suit, rank: c.rank });

export function handReplay(h: HandSnapshot): ReplayHand {
  const winners = trickWinners(h);
  let hands: PlainCard[][];
  let complete: boolean;
  if (h.hands) {
    hands = h.hands.map((hand) => hand.map(plain));
    complete = true;
  } else {
    // zapis pre 2026-10-20: poznate su samo odigrane karte
    hands = [[], [], []];
    for (const t of h.tricks) for (const c of t) hands[c.position]!.push(plain(c));
    complete = false;
  }
  return {
    round: h.round,
    dealer: h.dealer ?? null,
    declarer: h.declarer,
    game: h.declaredGame,
    kontraLevel: h.kontraLevel,
    passed: h.passed,
    bids: h.bids ? h.bids.map((b) => ({ player: b.player, label: bidLabel(b) })) : null,
    follow: [...h.followChoices],
    caller: h.caller,
    callee: h.callee,
    talon: h.talon.map(plain),
    discard: h.discard ? h.discard.map(plain) : null,
    hands,
    complete,
    tricks: h.tricks.map((t, i) => ({ cards: t.map((c) => ({ player: c.position, card: plain(c) })), winner: winners[i] ?? null })),
    tricksWon: [...h.tricksWon],
    bulasAfter: [...h.bulasAfter],
    supeDelta: [...h.supeDelta],
  };
}
