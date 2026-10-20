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

/**
 * Dobitnik svakog stiha (null za nezavrsen stih). Kad jedan branilac ne
 * dodje, igraju dvojica i stih ima 2 karte — pun stih je onaj najduzi.
 */
export function trickWinners(h: HandSnapshot): Array<Position | null> {
  const trump = h.declaredGame ? getTrumpSuit(h.declaredGame as Game) : null;
  const size = Math.max(2, ...h.tricks.map((t) => t.length));
  return h.tricks.map((t) => {
    if (t.length !== size) return null;
    const tc = t.map((c) => ({ player: c.position, card: { suit: c.suit as Suit, rank: c.rank } })) as unknown as TrickCard[];
    return trickWinner(tc, trump);
  });
}

const KONTRA_ORDER = ['KONTRA', 'REKONTRA', 'SUBKONTRA', 'MORTKONTRA'];

/** Tok kontre iz kontrasa i konacnog nivoa: kontru i subkontru daje kontras, rekontru i mortkontru nosilac. */
export function kontraSteps(h: HandSnapshot): Array<{ player: Position; level: string }> | null {
  if (!h.kontraLevel || h.kontraPlayer == null) return null;
  const upTo = KONTRA_ORDER.indexOf(h.kontraLevel);
  return KONTRA_ORDER.slice(0, upTo + 1).map((level, i) => ({ player: i % 2 === 0 ? h.kontraPlayer! : h.declarer, level }));
}

export interface ReplayHand {
  round: number;
  dealer: Position | null;
  declarer: Position;
  game: string;
  kontraLevel: string | null;
  kontra: Array<{ player: Position; level: string }> | null; // ko je sta rekao (od 2026-10-20)
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
  claimedBy: Position | null; // ruka skracena sa "nosim sve"
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
    kontra: kontraSteps(h),
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
    claimedBy: h.claimedBy ?? null,
  };
}
