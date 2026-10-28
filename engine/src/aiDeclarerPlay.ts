// Nosilac u adutskoj igri kad prvi baca — pravila iz korisnikove analize partije #18 (2026-10-27).
// Sve racuna iz prebrojanih karata (OSNOVNO PRAVILO, ai.ts).

import { RANK_VALUE } from './constants.js';
import type { Card, Position, Suit } from './types.js';
import { cardsIn, isMaster, unseenRanks, voidsOf } from './aiLeads.js';
import type { LeadContext } from './aiLeads.js';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const desc = (a: Card, b: Card) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank];

/** Nijedan pratilac koji igra vise nema adut: svi su izasli, ili su svi pokazali da su prazni. */
export function defendersOutOfTrumps(ctx: LeadContext): boolean {
  const trump = ctx.trump;
  if (!trump) return false;
  if (unseenRanks(ctx, trump).length === 0) return true;
  // pratilac koji ne igra (rekao je "ne dodjem") ne baca karte, pa se ne broji
  const defenders = new Set<Position>(ctx.tricks.flat().map((p) => p.player).filter((p) => p !== ctx.declarer));
  return defenders.size > 0 && [...defenders].every((p) => voidsOf(ctx, p).has(trump));
}

/** Koliko jos puta gubim ruku u boji (tudje karte jace od mojih gubitnika), a posle toga mi treba ulaz. */
function reentries(ctx: LeadContext, losers: Card[]): number {
  let most = 0;
  for (const suit of SUITS) {
    const mine = cardsIn(losers, suit);
    if (mine.length === 0) continue;
    const higher = unseenRanks(ctx, suit).filter((r) => RANK_VALUE[r] > RANK_VALUE[mine[0]!.rank]).length;
    most = Math.max(most, Math.min(higher, mine.length - 1));
  }
  return most;
}

/**
 * Pratioci vise nemaju adut (korisnik 2026-10-27, #18 ruke 2, 5, 16, 25, 32): prvo aduti, pa sigurne
 * karte, pa tek na kraju karta koja moze da izgubi ("veca je sansa da Darko skarta pik i da mu se K
 * pita na kraju"). Poslednji adut se cuva dok ima vise od 2 karte (i onoliko aduta koliko puta ce jos
 * dati ruku u svojoj boji — #11 ruka 12, "5 puta adut, pa pik, pa kad posecem, opet pik"). Sigurne
 * karte idu pre gubitnika i zato sto je prolaz najvazniji (#25: A i K karo pre D herc).
 * Vraca karte koje pravilo dozvoljava, najbolja prva (pretraga bira samo medju njima).
 */
export function declarerDrawnChoices(ctx: LeadContext): Card[] | null {
  const trump = ctx.trump;
  if (!trump || !defendersOutOfTrumps(ctx)) return null;
  const trumps = cardsIn(ctx.legal, trump);
  const side = ctx.legal.filter((c) => c.suit !== trump);
  const losers = side.filter((c) => !isMaster(ctx, c));
  const keep = losers.length > 0 && ctx.hand.length > 2 ? Math.max(1, reentries(ctx, losers)) : 0;
  if (trumps.length > keep) return trumps;
  // prvo boje u kojima su mi sve karte sigurne, pa as boje u kojoj imam i gubitnike
  const pure = (c: Card) => !losers.some((l) => l.suit === c.suit);
  const sure = side.filter((c) => isMaster(ctx, c)).sort((a, b) => Number(pure(b)) - Number(pure(a)) || desc(a, b));
  if (sure.length > 0) return sure;
  // gubitnik: najjaca karta najduze boje, da posle nje mozda prodju manje
  const byLength = SUITS.map((s) => cardsIn(losers, s)).sort((a, b) => b.length - a.length).flat();
  return byLength.length > 0 ? byLength : trumps.length > 0 ? trumps : null;
}

/** Aduti koje je nosilac imao na pocetku igre (sad u ruci + vec odigrani). */
function originalTrumps(ctx: LeadContext): Card[] {
  const played = ctx.tricks.flat().filter((p) => p.player === ctx.myPosition && p.card.suit === ctx.trump);
  return [...cardsIn(ctx.hand, ctx.trump!), ...played.map((p) => p.card)];
}

/**
 * Nosilac sa 4 aduta koji je u prvom stihu morao da sece (korisnik 2026-10-27, #18 ruka 3, Milan):
 * "ne treba da ide adutom, nego pikom. I sve pikom dok ima aduta kod pratilaca" — vodi svoju
 * najduzu sporednu boju (njene najjace karte), ne adut. Vraca karte te boje, najjaca prva.
 * Korisnik 2026-10-28 na konkretne ruke: i kad je duga boja slaba (pik 10,9,8,7), i kad pratilac vec
 * sece tu boju ("Q pik, dalje pik"), i sa A,D,10,9 u adutu ("odmah pik"). Ne vazi samo sa A i K u
 * adutu: #11 ruka 10, Milan A,K,8,7 herc posle secenja — "mogao je jednom adut".
 */
export function declarerRuffedFourChoices(ctx: LeadContext): Card[] | null {
  const trump = ctx.trump;
  const first = ctx.tricks[0];
  if (!trump || !first || first[0]!.player === ctx.myPosition || first[0]!.card.suit === trump) return null;
  const mine = first.find((p) => p.player === ctx.myPosition);
  const original = originalTrumps(ctx);
  const aceKing = original.some((c) => c.rank === 'A') && original.some((c) => c.rank === 'K');
  if (mine?.card.suit !== trump || original.length !== 4 || aceKing) return null;
  if (defendersOutOfTrumps(ctx)) return null;
  const masters = (cards: Card[]) => cards.filter((c) => isMaster(ctx, c)).length;
  const suits = SUITS.filter((s) => s !== trump).map((s) => cardsIn(ctx.legal, s)).filter((c) => c.length > 0);
  const best = suits.sort((a, b) => b.length - a.length || masters(b) - masters(a) || desc(a[0]!, b[0]!))[0];
  return best ?? null;
}

/** Karta nosioca po pravilima iz partije #18, ili null kad ona ne odlucuju. */
export function declarerRulesLead(ctx: LeadContext): Card | null {
  return (declarerDrawnChoices(ctx) ?? declarerRuffedFourChoices(ctx))?.[0] ?? null;
}
