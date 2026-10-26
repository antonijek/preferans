// Betl: kako igraju nosilac i pratioci (korisnik 2026-10-26, partija #17 ruka 3). Sve racuna iz
// prebrojanih karata (OSNOVNO PRAVILO, ai.ts): odigrano u ovoj ruci + svoja ruka (+ nosiocev
// skart, koji zna samo on) => koje karte te boje su jos kod ostalih.

import { RANK_VALUE, RANKS, SUITS } from './constants.js';
import type { Card, Position, Suit } from './types.js';

type Played = { player: Position; card: Card }[];

export interface BetlContext {
  hand: Card[];
  legal: Card[];
  currentTrick: Played;
  tricks: Played[];
  myPosition: Position;
  declarer: Position;
  discard: Card[]; // samo nosilac zna svoj skart; za pratioca prazno
}

const value = (c: Card) => RANK_VALUE[c.rank];
const asc = (a: Card, b: Card) => value(a) - value(b);
const lowest = (cards: Card[]) => cards.slice().sort(asc)[0]!;
const highest = (cards: Card[]) => cards.slice().sort(asc)[cards.length - 1]!;

/** Visine karata te boje koje su jos kod ostalih (nisu kod mene, nisu odigrane, nisu u mom skartu), rastuce. */
function unseen(ctx: BetlContext, suit: Suit): number[] {
  const known = new Set(
    [...ctx.hand, ...ctx.discard, ...ctx.tricks.flat().map((t) => t.card), ...ctx.currentTrick.map((t) => t.card)]
      .filter((c) => c.suit === suit)
      .map((c) => c.rank),
  );
  return RANKS.filter((r) => !known.has(r)).map((r) => RANK_VALUE[r]).sort((a, b) => a - b);
}

/** Boje za koje je nosilac pokazao da ih nema (nije pratio boju). */
function declarerVoids(ctx: BetlContext): Set<Suit> {
  const voids = new Set<Suit>();
  for (const trick of [...ctx.tricks, ctx.currentTrick]) {
    const led = trick[0]?.card.suit;
    const play = trick.find((t) => t.player === ctx.declarer);
    if (led && play && play.card.suit !== led) voids.add(led);
  }
  return voids;
}

/**
 * A. Nosilac kad prvi baca: boja koja ostaje sigurna i posle izlaza ("mora da krene iz trefa jer
 * ima vezano 7,8,9; u karo ne" — posle 7 karo ostaje 9, a 8 karo je kod pratilaca). Izlaz je
 * siguran ako je svaka tudja karta boje veca od moje; posle izlaza, i kad pratilac baci svoju
 * najvecu, moja i-ta najmanja mora ostati ispod njihove i-te najmanje. null = nema takve boje.
 */
function declarerLead(ctx: BetlContext): Card | null {
  let best: Card | null = null;
  for (const suit of SUITS) {
    const mine = ctx.legal.filter((c) => c.suit === suit).sort(asc);
    const out = unseen(ctx, suit);
    if (mine.length === 0 || out.length === 0 || out[0]! < value(mine[0]!)) continue;
    const rest = mine.slice(1).map(value);
    const outAfter = out.slice(0, -1);
    if (rest.some((v, i) => i < outAfter.length && v > outAfter[i]!)) continue;
    if (!best || value(mine[0]!) < value(best)) best = mine[0]!;
  }
  return best;
}

/** Boje u kojima je nosilac vec bacao kartu te boje — zna se da ih ima (ili je imao). */
function declarerShown(ctx: BetlContext): Set<Suit> {
  return new Set([...ctx.tricks, ctx.currentTrick].flat().filter((t) => t.player === ctx.declarer).map((t) => t.card.suit));
}

/**
 * C. Pratilac kad prvi baca: ne boju koju nosilac nema (tu se oslobadja opasnih karata), nego
 * najmanju kartu boje koju jos ima — prvo boje za koje se zna da ih ima (#17 ruka 3: Bora krenuo
 * 7 karo i nema pik; Milan igra 8 karo, ne 7 herc za koji se ne zna).
 */
function defenderLead(ctx: BetlContext): Card {
  const voids = declarerVoids(ctx);
  const shown = declarerShown(ctx);
  const has = ctx.legal.filter((c) => !voids.has(c.suit));
  const known = has.filter((c) => shown.has(c.suit));
  return lowest(known.length > 0 ? known : has.length > 0 ? has : ctx.legal);
}

/**
 * B. Pratilac prati boju. Nosilac vec bacio: ako stih drzi on, baci manju (uzima i pada); ako ga ne
 * drzi ili ne mogu ispod njega — najvecu, male cuvam za kasnije. Nosilac baca posle mene: najmanju.
 */
function defenderFollow(ctx: BetlContext, sameSuit: Card[]): Card {
  const mine = ctx.currentTrick.find((t) => t.player === ctx.declarer);
  if (!mine) return lowest(sameSuit);
  const led = ctx.currentTrick[0]!.card.suit;
  const byValue = ctx.currentTrick.filter((t) => t.card.suit === led).sort((a, b) => asc(a.card, b.card));
  const top = byValue[byValue.length - 1]!;
  if (top.player === ctx.declarer) {
    const under = sameSuit.filter((c) => value(c) < value(mine.card));
    if (under.length > 0) return highest(under);
  }
  return highest(sameSuit);
}

/** D. Pratilac nema trazenu boju: najvecu iz boje koju nosilac nema, inace svoju najvecu. */
function defenderDiscard(ctx: BetlContext): Card {
  const voids = declarerVoids(ctx);
  const useless = ctx.legal.filter((c) => voids.has(c.suit));
  return highest(useless.length > 0 ? useless : ctx.legal);
}

/** Karta po Betl pravilima, ili null kad o njoj odlucuju opsta pravila (nosilac prati boju ili baca). */
export function betlPlay(ctx: BetlContext): Card | null {
  if (ctx.legal.length === 0) return null;
  const isDeclarer = ctx.myPosition === ctx.declarer;
  if (ctx.currentTrick.length === 0) return isDeclarer ? declarerLead(ctx) : defenderLead(ctx);
  if (isDeclarer) return null;
  const led = ctx.currentTrick[0]!.card.suit;
  const sameSuit = ctx.legal.filter((c) => c.suit === led);
  return sameSuit.length > 0 ? defenderFollow(ctx, sameSuit) : defenderDiscard(ctx);
}
