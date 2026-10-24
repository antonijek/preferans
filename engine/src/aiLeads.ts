// Otvaranje stiha (vodim prvi) — pravila naucena iz korisnikovih partija #9
// i #10 (2026-10-20, poredjenje svake njegove odluke sa pravilima i
// pretragom; pretraga se u spornim otvaranjima skoro uvek slagala sa njim):
//  - pratilac protiv Sansa otvara najduzu boju (as, pa vrh niza) i nastavlja
//    je dok je ne razvije — ne "iz trefa/pika" kao ranija konvencija;
//  - nosilac koji ne vuce adute naplacuje najjace preostale karte, umesto
//    da daruje stih najnizom kartom.
// Isprobano i odbaceno: pratilac protiv aduta "najduza boja/vrh niza" umesto
// naplate asa — bez merljive koristi. Svaka funkcija vraca null kad pravilo
// ne odlucuje (choosePlayCard tada nastavlja sa svojim ostalim konvencijama).

import { BID_LEVEL_SUIT, RANK_VALUE, RANKS } from './constants.js';
import type { Card, Position, Suit } from './types.js';

export interface LeadContext {
  legal: Card[];
  hand: Card[];
  trump: Suit | null;
  myPosition: Position;
  declarer: Position;
  tricks: { player: Position; card: Card }[][];
  // igra se udvoje: drugi pratilac nije dosao (ni pozvan)
  twoHanded?: boolean;
  // ko igra odmah posle mene (nosilac ili partner)
  nextToAct?: Position;
  // dokle je licitirao drugi pratilac (0 = rekao dalje) i da li je dao kontru
  partnerBidLevel?: number;
  partnerKontra?: boolean;
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const desc = (a: Card, b: Card) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank];

function cardsIn(cards: Card[], suit: Suit): Card[] {
  return cards.filter((c) => c.suit === suit).sort(desc);
}

/** Karte koje nisam ni video (nisu u mojoj ruci, nisu odigrane). */
function unseenRanks(ctx: LeadContext, suit: Suit): string[] {
  const seen = new Set<string>(ctx.hand.map((c) => c.id));
  for (const t of ctx.tricks) for (const tc of t) seen.add(tc.card.id);
  return RANKS.filter((r) => !seen.has(`${r}${suit}`));
}

/** Moje karte u boji koje su jace od svih jos neodigranih tudjih. */
function masters(ctx: LeadContext, suit: Suit): Card[] {
  const unseen = unseenRanks(ctx, suit);
  const top = unseen.length ? Math.max(...unseen.map((r) => RANK_VALUE[r])) : -1;
  return cardsIn(ctx.legal, suit).filter((c) => RANK_VALUE[c.rank] > top);
}

/** Boje u kojima je igrac pokazao da je prazan (nije pratio vodjenu boju). */
function voidsOf(ctx: LeadContext, player: Position): Set<Suit> {
  const out = new Set<Suit>();
  for (const t of ctx.tricks) {
    const led = t[0]?.card.suit;
    const play = t.find((tc) => tc.player === player);
    if (led && play && play.card.suit !== led) out.add(led);
  }
  return out;
}

/** Poslednja boja koju sam ja otvorio ove ruke. */
function lastSuitILed(ctx: LeadContext): Suit | null {
  for (let i = ctx.tricks.length - 1; i >= 0; i--) {
    const t = ctx.tricks[i]!;
    if (t[0]?.player === ctx.myPosition) return t[0].card.suit;
  }
  return null;
}

/** As; inace vrh niza od dve susedne karte (K-D, D-J, J-10, 10-9...); inace null. */
function topOfSequence(cards: Card[]): Card | null {
  if (cards.length === 0) return null;
  if (cards[0]!.rank === 'A') return cards[0]!;
  for (let i = 0; i + 1 < cards.length; i++) {
    const a = RANKS.indexOf(cards[i]!.rank as (typeof RANKS)[number]);
    const b = RANKS.indexOf(cards[i + 1]!.rank as (typeof RANKS)[number]);
    if (a - b === 1) return cards[i]!;
  }
  return null;
}

// Boja koja se razvija bez asa: niz od K ili D (K,D / D,J...). Kod iste
// duzine ide pre boje sa asom — as ostaje ulaz (korisnik 2026-10-21, Sans,
// A,9,8 pik i K,D,7 herc: "igrao bih K herca, onda ga posle cekam u piku da
// uzmem Asem i onda nastavim sa hercom").
const isSequenceWithoutAce = (cards: Card[]) => cards[0]!.rank !== 'A' && topOfSequence(cards) !== null;

/** Najduza boja medju dozvoljenim (izjednaceno: niz bez asa, pa jaca najvisa karta), bez izuzetih. */
function longestSuit(ctx: LeadContext, exclude: Set<Suit>): Card[] | null {
  let best: Card[] | null = null;
  for (const s of SUITS) {
    if (exclude.has(s)) continue;
    const cards = cardsIn(ctx.legal, s);
    if (cards.length === 0) continue;
    if (!best || cards.length > best.length) {
      best = cards;
      continue;
    }
    if (cards.length < best.length) continue;
    const seq = isSequenceWithoutAce(cards);
    const bestSeq = isSequenceWithoutAce(best);
    if (seq !== bestSeq ? seq : desc(cards[0]!, best[0]!) < 0) best = cards;
  }
  return best;
}

const longerFirst = (a: Card[], b: Card[]) => b.length - a.length;

/**
 * Prvo otvaranje odbrane kad igraju oba pratioca: boja dokle je partner
 * licitirao (korisnik 2026-10-24: "ako je dosao do 4, mora herca da igra ...
 * Mora se pratiti dokle je ko licitovao", za sve igre). Protiv Sansa, ako
 * partner nije licitirao: tref, a ako je dao kontru: pik ("prvo licit, ako
 * ga nema onda se krece Trefom, ako je kontra onda Pik"). Karta: kad posle
 * mene igra nosilac najmanja, kad igra partner najveca ("kad god imas treceg
 * K ili trecu D, drugog K i sl, uvek igras ovako"); as se uvek naplati.
 */
export function partnerSuitLead(ctx: LeadContext): Card | null {
  if (ctx.twoHanded || ctx.partnerBidLevel === undefined) return null;
  if (ctx.tricks.some((t) => t[0] !== undefined && t[0].player !== ctx.declarer)) return null;
  let suit = BID_LEVEL_SUIT[ctx.partnerBidLevel] ?? null;
  if (!suit && ctx.trump === null && ctx.partnerBidLevel === 0) suit = ctx.partnerKontra ? '♠' : '♣';
  if (!suit || suit === ctx.trump) return null;
  const cards = cardsIn(ctx.legal, suit);
  if (cards.length === 0) return null;
  if (cards[0]!.rank === 'A' || ctx.nextToAct !== ctx.declarer) return cards[0]!;
  return cards[cards.length - 1]!;
}

/**
 * A,K pre svega ("jedino je bolji A,K"; i K,D kad je as vec pao), pa K,D
 * ("K,D su uvek solidan polaz") — korisnik 2026-10-24, partije #12/#13.
 * Kod vise takvih boja ide duza.
 */
function topSequenceLead(ctx: LeadContext, suits: Card[][]): Card | null {
  const twoMasters = suits.filter((c) => masters(ctx, c[0]!.suit).length >= 2).sort(longerFirst)[0];
  if (twoMasters) return twoMasters[0]!;
  const kingQueen = suits.filter((c) => c[0]!.rank === 'K' && c[1]?.rank === 'Q').sort(longerFirst)[0];
  return kingQueen ? kingQueen[0]! : null;
}

// As,D bez K ("makaze") se ne otvara osim sa 5+ karata — korisnik 2026-10-24:
// "ako nosilac odigra bilo koju kartu makaze uzimaju 2 stiha".
const isTenace = (cards: Card[]) =>
  cards.length < 5 && cards.some((c) => c.rank === 'A') && cards.some((c) => c.rank === 'Q') && !cards.some((c) => c.rank === 'K');

/**
 * Pratilac protiv adutske igre otvara: A,K, pa K,D, pa najjacu kartu (as)
 * NAJDUZE boje — ne suvog ili drugog asa (korisnik 2026-10-24: #13 ruka 3
 * suvi A tref umesto A,J,9,7 pik; ruka 9 A,J karo umesto A,9,8,7 herc).
 * Preskace boje u kojima je nosilac pokazao da je prazan i makaze.
 */
export function defenderSuitLead(ctx: LeadContext): Card | null {
  if (!ctx.trump) return null;
  const declarerVoid = voidsOf(ctx, ctx.declarer);
  const suits = SUITS.filter((s) => s !== ctx.trump && !declarerVoid.has(s) && unseenRanks(ctx, s).length > 0)
    .map((s) => cardsIn(ctx.legal, s))
    .filter((c) => c.length > 0);
  const top = topSequenceLead(ctx, suits);
  if (top) return top;
  const master = suits.filter((c) => masters(ctx, c[0]!.suit).length === 1 && !isTenace(c)).sort(longerFirst)[0];
  return master ? master[0]! : null;
}

export function sansDefenderLead(ctx: LeadContext): Card | null {
  const started = lastSuitILed(ctx);
  if (started) {
    const mine = cardsIn(ctx.legal, started);
    if (mine.length > 0) return mine[0]!;
  }
  const partner = partnerSuitLead(ctx);
  if (partner) return partner;
  // #13 ruka 8: Bora D,J,10,9,8 pik i K,D herc — "bolje je otvoriti K herc
  // jer izlaz iz K,D je dobar"
  const top = topSequenceLead(ctx, SUITS.map((s) => cardsIn(ctx.legal, s)).filter((c) => c.length > 0));
  if (top) return top;
  const suit = longestSuit(ctx, new Set());
  if (!suit) return null;
  return topOfSequence(suit) ?? suit[suit.length - 1]!;
}

export function declarerLead(ctx: LeadContext): Card | null {
  if (!ctx.trump) return null;
  // boje u kojima je neki pratilac pokazao da je prazan — tamo bi mi as bio isecen
  const defenders = ([0, 1, 2] as Position[]).filter((p) => p !== ctx.myPosition);
  const risky = new Set<Suit>(defenders.flatMap((p) => [...voidsOf(ctx, p)]));
  let best: Card[] | null = null;
  for (const s of SUITS) {
    if (s === ctx.trump || risky.has(s)) continue;
    if (unseenRanks(ctx, s).length === 0) continue; // niko vise nema boju — ne trosi je sada
    const m = masters(ctx, s);
    if (m.length === 0) continue;
    if (!best || m.length > best.length) best = m;
  }
  return best ? best[0]! : null;
}

/**
 * Pratilac protiv Sansa nema trazenu boju: cuva boju koju razvija (onu koju
 * je otvorio, ili bi otvorio) i asa kao ulaz, a prvo baca male karte ispod
 * svog asa (korisnik 2026-10-21, A,9,8 pik / K,D,7 herc / J,8 tref: "cuvao
 * herc a osusio As pik, ostavio ga samog", "vjerovatno bih bacio 9 i 8
 * pik"). Bez takvih karata: najniza karta van te boje koja nije A ni K.
 */
export function sansDefenderDiscard(ctx: LeadContext): Card | null {
  const developing = lastSuitILed(ctx) ?? longestSuit({ ...ctx, legal: ctx.hand }, new Set())?.[0]!.suit ?? null;
  const lowest = (cards: Card[]) => cards.slice().sort(desc)[cards.length - 1] ?? null;
  const underAce = SUITS.filter((s) => s !== developing)
    .map((s) => cardsIn(ctx.legal, s))
    .filter((cards) => cards.length >= 2 && cards[0]!.rank === 'A')
    .map((cards) => cards[cards.length - 1]!);
  if (underAce.length > 0) return lowest(underAce);
  return lowest(ctx.legal.filter((c) => c.suit !== developing && c.rank !== 'A' && c.rank !== 'K'));
}

/**
 * Pratilac protiv aduta kad nema sta da naplati: ne otvara boju u kojoj ima
 * kralja (ili damu) bez jace karte iz niza — K,x / D,x cekaju da nosilac sam
 * otvori tu boju. Korisnik 2026-10-21 (partija #11, ruka 5: Bora 10,9 tref /
 * K,10 herc / K,7 pik protiv nosiocevih A,D herc i A,D pik, odigrao 7 pik i
 * izgubio kralja): "trebalo je tref da igra jer druge 2 boje ceka da mu se
 * otvore i ima stihove". Vraca najnizu kartu iz bezbedne boje, ili null.
 * Udvoje se boja otvara najjacom kartom ("udvoje se igra uvek jacom u
 * boji"; K,8 pik koji mora da otvori: "K pik") — i kad bezbedne boje nema.
 * Isto ceka i makaze (isTenace).
 */
export function waitsForDeclarer(cards: Card[]): boolean {
  const has = (r: string) => cards.some((c) => c.rank === r);
  const bareKing = has('K') && !has('A') && !has('Q');
  const bareQueen = has('Q') && !has('A') && !has('K') && !has('J');
  return bareKing || bareQueen || isTenace(cards);
}

export function defenderSafeExit(ctx: LeadContext): Card | null {
  if (!ctx.trump) return null;
  const safe: Card[] = [];
  for (const s of SUITS) {
    if (s === ctx.trump) continue;
    const cards = cardsIn(ctx.legal, s);
    if (!waitsForDeclarer(cards)) safe.push(...cards);
  }
  const lowest = safe.sort(desc)[safe.length - 1];
  if (!ctx.twoHanded) return lowest ?? null;
  const suit = lowest?.suit;
  const pool = suit ? cardsIn(ctx.legal, suit) : ctx.legal.filter((c) => c.suit !== ctx.trump).sort(desc);
  return pool[0] ?? null;
}
