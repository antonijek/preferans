// AI heuristike za Preferans — Dodjem/Ne dodjem (follow), Kontra, i
// Zovem/Sam (call-or-alone). Koriste se iz app.js za AI igrače.

import { RANK_VALUE, SUITS } from './constants.js';
import type { Card, Game, Suit, Position, ContraLevel } from './types.js';
import {
  trumpOnlySafeTricks, countSafeTricks, getTrumpSuitFromGame, sequentialRunFromAce, countDeclarerTricks, countSansTricks,
} from './aiHandEval.js';

// === FOLLOW STRATEGIJA (Dodjem / Ne dodjem) ===
//
// Pravilo: dolazis ako mislis da mozes uhvatiti NAJMANJE 2 stiha.
//   - 2 adutska sigurna stiha (A+K u adutu, ili 2 najjaca aduta)
//   - 2 asa u razlicitim bojama
//   - 3 K u razlicitim bojama
//   - kombinacija (adut A + as van aduta, itd.)

export type FollowAction = 'DODJEM' | 'NE_DODJEM';

export interface FollowContext {
  hand: Card[];
  declaredGame: Game;
}

export function chooseFollow(ctx: FollowContext): FollowAction {
  const trump = getTrumpSuitFromGame(ctx.declaredGame);
  const isPik = ctx.declaredGame === 'Pik' || ctx.declaredGame === 'Igra-Pik';
  if (isPik) {
    // Pik nosi OBAVEZNU kontru (RULES 7.1.1 — bez ikakve kontre se
    // ponistava/redeal), pa je dolazak stroziji (korisnikov zahtev, uzivo
    // potvrdjeno 2026-09-06): treba ili 2 sigurna ADUTSKA stiha, ili 2 (bilo
    // koja, i adutska i vanadutska) asa — ne bilo koja mesovita kombinacija
    // koja bi inace zadovoljila opsti prag (bio 2, od 2026-10-21 je 3).
    const trumpTricks = trumpOnlySafeTricks(ctx.hand, trump);
    const totalAces = ctx.hand.filter(c => c.rank === 'A').length;
    return (trumpTricks >= 2 || totalAces >= 2) ? 'DODJEM' : 'NE_DODJEM';
  }
  const isSans = ctx.declaredGame === 'Sans' || ctx.declaredGame === 'Igra-Sans';
  if (isSans) {
    // Sans (istrazivanje 2026-09-18, profipreferans.blogspot.com "prica o
    // praznom pistolju"): "ne pratite sans ako imate zadrsku samo u jednoj
    // boji" — bez aduta nema izvlacenja, pa odbrana koncentrisana u JEDNOJ
    // boji (npr. As+Kralj iste boje = 2 sigurna stiha) ne pomaze: nosilac
    // prosto izbegava tu boju dok se ne isprazni kod pratioca, ostatak
    // ruke prolazi neometano. Treba sirina — sigurni stihovi rasprostranjeni
    // kroz BAR 2 razlicite boje, ne samo ukupan broj.
    const suitTricks = SUITS.map(s => sansDefenderTricks(ctx.hand, s));
    const total = suitTricks.reduce((sum, n) => sum + n, 0);
    const suitsWithTricks = suitTricks.filter(n => n > 0).length;
    // Izuzetak: duga boja sa A,K (5+ karata) je sama dovoljna — korisnik
    // 2026-10-21, partija #11 ruka 3, A,K,J,10,8 herc: "obavezno dolazim ...
    // osim ako nema trecu damu on sigurno pada".
    const longRun = SUITS.some(s => ctx.hand.filter(c => c.suit === s).length >= 5 && sequentialRunFromAce(ctx.hand, s) >= 2);
    return (total >= 2 && suitsWithTricks >= 2) || longRun ? 'DODJEM' : 'NE_DODJEM';
  }
  // Adutska igra: 3 rezona, ne 2 (korisnik 2026-10-21: "treba 3 rezona da bi
  // dosao ... jer vecinom jedan rezon sece nosilac"). Pik i Sans gore imaju
  // svoja pravila i ostaju kakvi su.
  return countSafeTricks(ctx.hand, trump) >= 3 ? 'DODJEM' : 'NE_DODJEM';
}

// Pratilac protiv Sansa: niz od asa (A, A,K...) kao ranije, a bez asa i
// K,D (=1, sa J =2) ili D,J,10 (=1) — kad as izadje, ostatak niza nosi.
// Korisnik u partiji #10 dolazio sa K,D,10 / K,D,J,10,7 / K,D i rusio Sans.
function sansDefenderTricks(hand: Card[], suit: Suit): number {
  const fromAce = sequentialRunFromAce(hand, suit);
  if (fromAce > 0) return fromAce;
  const has = (r: string) => hand.some(c => c.suit === suit && c.rank === r);
  if (has('K') && has('Q')) return has('J') ? 2 : 1;
  if (has('Q') && has('J') && has('10')) return 1;
  return 0;
}

// === KONTRA STRATEGIJA ===
//
// "Kontra ako imaš 4+ aduta"
// "Kontra ako imaš 3 aduta i 2+ visoke karte u ostalim bojama"
// "Inače Moze"

export type KontraAction = 'KONTRA' | 'MOZE';

export interface KontraContext {
  hand: Card[];
  trump: Suit | null;
  currentLevel: number; // 0 = nema, 1 = KONTRA, 2 = REKONTRA, 3 = SUBKONTRA, 4 = MORTKONTRA
  // Da li je DRUGI pratilac rekao "Dođem" (javna informacija u trenutku
  // kontre — praćenje je vec zavrseno). Podrazumevano true (stari pozivi
  // bez ovog polja zadrzavaju staro ponasanje) — vidi ispravku ispod.
  partnerCame?: boolean;
  // Odlucuje NOSILAC (rekontra/mortkontra), ne pratilac. Vidi ispravku ispod.
  isDeclarer?: boolean;
}

// ISPRAVKA (2026-10-03, uzivo prijavljeno + potvrdjeno rezultatom — nosilac
// 7 stihova, odbrana samo 3 od potrebnih 5): Istok je dao kontru sa 4 aduta
// (Q,9,8,7 tref — SAMO Dama kao casna karta, ostalo sitne) dok je Zapad VEC
// rekao "Ne dođem" PRE kontre — javna informacija da partner signalizira
// slabu ruku. Staro pravilo "4+ aduta = kontra" ne gleda uopste da li
// partner dolazi — racuna da ce partner nadoknaditi razliku do 5 cak i kad
// je partner vec rekao da nema cime. Kad partner NIJE dosao, cista duzina
// (bez casnih karata) vise nije dovoljna — podigni prag: ili 5+ aduta, ili
// 4+ aduta ALI sa bar 2 casne (isti kvalitetni prag kao grana za 3 aduta).
export function chooseKontra(ctx: KontraContext): KontraAction {
  // Uzivo prijavljen bag (2026-10-20, analiza korisnikove partije #9, ruka
  // 5): nosilac je o rekontri/mortkontri odlucivao po pravilu za PRATIOCA
  // ("4+ aduta = kontra") — nosilac skoro uvek ima 4+ aduta, pa je podizao
  // SVAKU kontru (Milan: A,K,10,8 karo, rekontra pa mortkontra, pao). Kontras
  // je upravo objavio da drzi adute; nosilac podize samo sa viskom: rekontra
  // sa 7+ sigurnih stihova (potrebno 6), mortkontra posle subkontre sa 8+.
  if (ctx.isDeclarer) {
    const sure = ctx.trump === null ? countSansTricks(ctx.hand) : countDeclarerTricks(ctx.hand, ctx.trump);
    return sure >= (ctx.currentLevel >= 3 ? 8 : 7) ? 'KONTRA' : 'MOZE';
  }
  if (ctx.trump === null) return 'MOZE';
  const trumps = ctx.hand.filter(c => c.suit === ctx.trump);
  const highTrumps = trumps.filter(c => RANK_VALUE[c.rank] >= 4).length;
  const partnerCame = ctx.partnerCame ?? true;
  // Drugi pratilac nije dosao: sa 3 aduta nema kontre ni uz jake sporedne
  // karte (korisnik 2026-10-21, K,D,9 herc + A,K pik + A tref: "plasim se da
  // ima puno karo a posto on prvi igra krenuo bi odatle. Dakle nema kontre").
  if (!partnerCame) {
    if (trumps.length >= 5) return 'KONTRA';
    if (trumps.length >= 4 && highTrumps >= 2) return 'KONTRA';
    return 'MOZE';
  }
  // 4+ aduta → kontra
  if (trumps.length >= 4) return 'KONTRA';
  // 3 aduta sa 2+ visoke → kontra
  if (trumps.length >= 3 && highTrumps >= 2) return 'KONTRA';
  // Inače moze
  return 'MOZE';
}

// === CALL OR ALONE STRATEGIJA ===
//
// Pratilac koji je dosao (drugi je rekao "ne dodjem") bira: zvati ga
// ("idemo zajedno", treba im 4 stiha) ili igrati sam (2 stiha). Korisnik
// 2026-10-21: "Kad sam jak a iz njegove licitacije zakljucujem sta on ima.
// Ako je licitovao pa stao na 3 ili 2 ili 4 onda znaci da ima tu boju."
// Zove kad je drugi licitacijom pokazao sporednu boju koju on sam nema ili
// ima malo (A,K,D pik + A,K,8 tref + 9,8 karo, drugi stao na 3: "ako on ima
// karo, ja ostalo ... mi nosimo sigurno 4, zvao bih ga"); a kad i sam ima
// tu boju — "imam 3 karoa ... nosilac nema to", ne zove. Bez licitacije
// drugog: "sve mi isto", igra sam. Racunar ne gleda tudje karte.

export type CallOrAloneAction = 'CALL' | 'ALONE';

export interface CallOrAloneContext {
  callerHand: Card[];       // ruka pratioca koji je dosao
  partnerBidLevel: number;  // dokle je licitirao onaj koji nije dosao (0 = nije)
  declaredGame: Game;
}

const BID_SUIT: Partial<Record<number, Suit>> = { 2: '♠', 3: '♦', 4: '♥', 5: '♣' };

export function chooseCallOrAlone(ctx: CallOrAloneContext): CallOrAloneAction {
  const trump = getTrumpSuitFromGame(ctx.declaredGame);
  const partnerSuit = BID_SUIT[ctx.partnerBidLevel];
  if (!partnerSuit || partnerSuit === trump) return 'ALONE';
  const mine = ctx.callerHand.filter((c) => c.suit === partnerSuit).length;
  return mine <= 2 ? 'CALL' : 'ALONE';
}
