// Nosilac u adutskoj igri kad prvi baca — pravila iz korisnikove analize partije #18 (2026-10-27).
// Sve racuna iz prebrojanih karata (OSNOVNO PRAVILO, ai.ts).

import { RANK_VALUE } from './constants.js';
import type { Card, Position, Suit } from './types.js';
import { cardsIn, isMaster, isTenace, unseenRanks, voidsOf } from './aiLeads.js';
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

/** Moji aduti koji su jaci od svih tudjih. */
const masterTrumps = (ctx: LeadContext): Card[] => (ctx.trump ? cardsIn(ctx.legal, ctx.trump).filter((c) => isMaster(ctx, c)) : []);

/**
 * Makaze (A,D bez K i bez J, a K je napolju): nosilac ih ne otvara sam, ceka da pratilac dodje u njih (korisnik
 * 2026-11-01, #19 ruka 7: "otvara makaze As i D herca umesto karo"). A,D,J,10 nisu makaze — #18: "odmah pik" sa A,D,J,10.
 */
export function isOpenTenace(ctx: LeadContext, cards: Card[]): boolean {
  const has = (r: string) => cards.some((c) => c.rank === r);
  return isTenace(cards) && !has('J') && unseenRanks(ctx, cards[0]!.suit).includes('K');
}

/**
 * Svi aduti koji su jos napolju slabiji su od mojih najjacih, a najjacih imam bar toliko: uzimam ih odmah
 * (korisnik 2026-11-01, #19 ruka 5: Milan A,K herc protiv 10 i 7 — "zasto ne igra 2 puta adut"). Vazi i kad
 * je igra vec izgubljena; "kad vidis da je ostao jedan adut a ti mozes da ga uzmes, naravno da ces igrati adut".
 */
export function declarerCoveredTrumps(ctx: LeadContext): Card[] | null {
  if (!ctx.trump || lastTrumpVsOne(ctx)) return null;
  const out = unseenRanks(ctx, ctx.trump).length;
  const top = masterTrumps(ctx);
  return out > 0 && top.length >= out ? top : null;
}

/** Imam jos samo jedan adut, jaci od jedinog koji je ostao kod protivnika. */
function lastTrumpVsOne(ctx: LeadContext): boolean {
  if (!ctx.trump) return false;
  const mine = cardsIn(ctx.legal, ctx.trump);
  return mine.length === 1 && isMaster(ctx, mine[0]!) && unseenRanks(ctx, ctx.trump).length === 1;
}

/**
 * Poslednji adut protiv jednog kod protivnika se ne vuce, nego se igra sporedna boja, prvo sigurne karte
 * (korisnik 2026-11-02, #21 ruka 31, Milan J tref protiv 9 tref: "treba igrati As pik, pa nastaviti pikom").
 * Kad su sva tri ili vise aduta napolju (#19 ruka 7) ili ih nosilac ima vise, odlucuju pravila iznad.
 */
export function declarerKeepLastTrump(ctx: LeadContext): Card[] | null {
  if (!lastTrumpVsOne(ctx)) return null;
  const side = ctx.legal.filter((c) => c.suit !== ctx.trump);
  if (side.length === 0) return null;
  return side.sort((a, b) => Number(isMaster(ctx, b)) - Number(isMaster(ctx, a)) || desc(a, b));
}

/** Ostao mi je samo jedan adut i on je najjaci (suv as), a pratioci jos imaju adute: igram ga odmah (#19 ruka 7). */
export function declarerBareTopTrump(ctx: LeadContext): Card[] | null {
  if (!ctx.trump || lastTrumpVsOne(ctx)) return null;
  const trumps = cardsIn(ctx.legal, ctx.trump);
  return trumps.length === 1 && isMaster(ctx, trumps[0]!) && unseenRanks(ctx, ctx.trump).length > 0 ? trumps : null;
}

/**
 * Nosilac sa A i K u adutu (bar 4 aduta), dama je napolju, a adut jos nije vodio: prvi put vodi As (korisnik
 * 2026-11-01, #19 ruka 5, Milan A,K,J,8 herc: "As jednom, ne treba vise"; i kad je simulacija vise volela pik —
 * "Asem"). Posle toga odlucuju ostala pravila i pretraga.
 */
export function declarerAceOnce(ctx: LeadContext): Card[] | null {
  const trump = ctx.trump;
  if (!trump) return null;
  const trumps = cardsIn(ctx.legal, trump);
  const has = (r: string) => trumps.some((c) => c.rank === r);
  const ledTrump = ctx.tricks.some((t) => t[0]?.player === ctx.myPosition && t[0].card.suit === trump);
  if (ledTrump || originalTrumps(ctx).length < 4 || !has('A') || !has('K')) return null;
  return unseenRanks(ctx, trump).includes('Q') ? trumps.filter((c) => c.rank === 'A') : null;
}

/**
 * Nosilac koji vodi adutom, a ima najjaci preostali adut, ne vodi manji (korisnik 2026-11-01, #19 ruka 5: Milan sa
 * A,K,J,8 herc vodio J, a dama je bila kod Antonija koji igra poslednji — "As jednom"). Za stolom nema saveznika,
 * pa manji adut samo daruje stih tudjoj jacoj karti. Vraca karte koje pretraga sme da razmatra.
 */
export function withoutLowTrumpLead(ctx: LeadContext): Card[] {
  if (masterTrumps(ctx).length === 0) return ctx.legal;
  return ctx.legal.filter((c) => c.suit !== ctx.trump || isMaster(ctx, c));
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
 * Korisnik 2026-11-02 (#21 ruka 17, Bora sa 8 herc i A,D tref: "adut pa tref, mozda skarta tref i ostavi K
 * samog"): sa jednim gubitnikom adut se ne cuva, gubitnik ide poslednji.
 * Vraca karte koje pravilo dozvoljava, najbolja prva (pretraga bira samo medju njima).
 */
export function declarerDrawnChoices(ctx: LeadContext): Card[] | null {
  const trump = ctx.trump;
  if (!trump || !defendersOutOfTrumps(ctx)) return null;
  const trumps = cardsIn(ctx.legal, trump);
  const side = ctx.legal.filter((c) => c.suit !== trump);
  const losers = side.filter((c) => !isMaster(ctx, c));
  const keep = losers.length > 1 && ctx.hand.length > 2 ? Math.max(1, reentries(ctx, losers)) : 0;
  if (trumps.length > keep) return trumps;
  // prvo boje u kojima su mi sve karte sigurne, pa as boje u kojoj imam i gubitnike
  const pure = (c: Card) => !losers.some((l) => l.suit === c.suit);
  const sure = side.filter((c) => isMaster(ctx, c)).sort((a, b) => Number(pure(b)) - Number(pure(a)) || desc(a, b));
  // gubitnik: najjaca karta najduze boje, da posle nje mozda prodju manje
  const byLength = SUITS.map((s) => cardsIn(losers, s)).sort((a, b) => b.length - a.length).flat();
  // As uz jednu malu koja ne nosi: ta boja se ne igra dok ima drugih karata (korisnik 2026-11-02, #21 ruka 19,
  // Milan A,7 pik: "posle asa je 7, ona ne moze uzeti stih, pa je igranje pika nepotrebno; bolje nesto drugo").
  const bareAce = (s: Suit) => {
    const cards = cardsIn(ctx.legal, s);
    return cards.length === 2 && cards[0]!.rank === 'A' && !isMaster(ctx, cards[1]!);
  };
  const rest = (cards: Card[]) => cards.filter((c) => !bareAce(c.suit));
  if (rest(sure).length > 0) return rest(sure);
  if (rest(byLength).length > 0) return rest(byLength);
  if (sure.length > 0) return sure;
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
  // makaze ne otvara ako ima drugu boju (#19 ruka 7: "umesto karo")
  const tenace = (cards: Card[]) => Number(isOpenTenace(ctx, cards));
  const best = suits.sort(
    (a, b) => tenace(a) - tenace(b) || b.length - a.length || masters(b) - masters(a) || desc(a[0]!, b[0]!)
  )[0];
  return best ?? null;
}

/**
 * Karta nosioca po pravilima iz partija #18 i #19, ili null kad ona ne odlucuju. Adut koji se sad uzima (pokriveni
 * aduti, suv as, "As jednom") ide pre "sporedne boje posle secenja" — ono vazi dok pratioci imaju adute koje nosilac ne moze da uzme.
 */
export function declarerRulesLead(ctx: LeadContext): Card | null {
  const choices =
    declarerDrawnChoices(ctx) ?? declarerKeepLastTrump(ctx) ?? declarerCoveredTrumps(ctx) ?? declarerBareTopTrump(ctx)
    ?? declarerAceOnce(ctx)
    ?? declarerRuffedFourChoices(ctx);
  return choices?.[0] ?? null;
}
