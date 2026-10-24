// Pratilac prati boju posle partnera ili skartira — pravila iz korisnikove
// partije #14 (2026-10-24). Koriste ih i pravila (choosePlayCard) i pretraga
// (aiSearch.ts defenderPlayFilter), da racunari na serveru igraju isto.

import { RANK_VALUE, RANKS } from './constants.js';
import type { Card, Position, Suit } from './types.js';

type Play = { player: Position; card: Card };

export interface DefenderFollowContext {
  hand: Card[];
  legal: Card[];
  currentTrick: Play[];
  trump: Suit | null;
  declarer: Position;
  tricks: Play[][];
}

const asc = (a: Card, b: Card) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank];

/** Ima li jos neodigrane tudje karte iste boje jace od ove. */
function higherUnseen(ctx: DefenderFollowContext, card: Card): boolean {
  const seen = new Set<string>(ctx.hand.map((c) => c.id));
  for (const t of ctx.tricks) for (const p of t) seen.add(p.card.id);
  for (const p of ctx.currentTrick) seen.add(p.card.id);
  return RANKS.some((r) => RANK_VALUE[r] > RANK_VALUE[card.rank] && !seen.has(`${r}${card.suit}`));
}

function winningPlay(trick: Play[], trump: Suit | null): Play {
  const led = trick[0]!.card.suit;
  return trick.reduce((best, p) => {
    const bestTrump = best.card.suit === trump;
    if (p.card.suit === trump && !bestTrump) return p;
    if (p.card.suit !== best.card.suit) return best;
    return RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank] && (p.card.suit === led || p.card.suit === trump) ? p : best;
  });
}

function declarerShowedVoid(ctx: DefenderFollowContext, suit: Suit): boolean {
  return ctx.tricks.some((t) => {
    const play = t.find((p) => p.player === ctx.declarer);
    return t[0]!.card.suit === suit && play !== undefined && play.card.suit !== suit;
  });
}

/**
 * Pratim boju, a stih trenutno drzi partner:
 *  - partnerova karta je najjaca preostala, ili je nosilac vec bacio → mala
 *    (ruka 12, A tref na partnerovog K: "zasto bih ja uzimao taj stih kad je
 *    vec nas???");
 *  - posle mene igra nosilac, a ja imam najjacu preostalu kartu te boje → ona
 *    (ruka 8: "na 7 tref mora K, a posle na 10 pik mora K pik").
 * Null kad pravilo ne odlucuje (nosilac drzi stih, ne pratim boju...).
 */
export function followAfterPartner(ctx: DefenderFollowContext): Card | null {
  if (ctx.currentTrick.length === 0) return null;
  const led = ctx.currentTrick[0]!.card.suit;
  const mine = ctx.legal.filter((c) => c.suit === led).sort(asc);
  if (mine.length === 0) return null;
  const top = winningPlay(ctx.currentTrick, ctx.trump);
  if (top.player === ctx.declarer) return null;
  const declarerPlayed = ctx.currentTrick.some((p) => p.player === ctx.declarer);
  if (declarerPlayed || top.card.suit !== led || !higherUnseen(ctx, top.card)) return mine[0]!;
  // nosilac koji je pokazao da nema boju ionako sece
  if (declarerShowedVoid(ctx, led)) return mine[0]!;
  return mine.find((c) => RANK_VALUE[c.rank] > RANK_VALUE[top.card.rank] && !higherUnseen(ctx, c)) ?? null;
}

/**
 * Skart pratioca bez karte koja ostavlja kralja samog (K i jos jedna karta),
 * dok ima druge — korisnik: "mala uz K,J cuva kralja" (#13 ruka 32), a u #14
 * (ruka 16) Bora je bacio 10 herc pa 7 pik i izgubio oba kralja ("morao je
 * karo jer zna da to sece Milan").
 */
export function withoutKingGuards(hand: Card[], cards: Card[]): Card[] {
  const guarded = (c: Card) => {
    const suit = hand.filter((x) => x.suit === c.suit);
    return suit.length <= 2 && suit.some((x) => x.rank === 'K');
  };
  const rest = cards.filter((c) => !guarded(c));
  return rest.length > 0 ? rest : cards;
}
