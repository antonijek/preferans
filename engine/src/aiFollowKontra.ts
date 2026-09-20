// AI heuristike za Preferans — Dodjem/Ne dodjem (follow), Kontra, i
// Zovem/Sam (call-or-alone). Koriste se iz app.js za AI igrače.

import { RANK_VALUE, SUITS } from './constants.js';
import type { Card, Game, Suit, Position, ContraLevel } from './types.js';
import { trumpOnlySafeTricks, countSafeTricks, getTrumpSuitFromGame, sequentialRunFromAce } from './aiHandEval.js';

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
    // koja inace zadovoljava opsti prag od 2.
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
    const suitTricks = SUITS.map(s => sequentialRunFromAce(ctx.hand, s));
    const total = suitTricks.reduce((sum, n) => sum + n, 0);
    const suitsWithTricks = suitTricks.filter(n => n > 0).length;
    return total >= 2 && suitsWithTricks >= 2 ? 'DODJEM' : 'NE_DODJEM';
  }
  const safe = countSafeTricks(ctx.hand, trump);
  // Dodji ako ima najmanje 2 sigurna stiha
  return safe >= 2 ? 'DODJEM' : 'NE_DODJEM';
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
}

export function chooseKontra(ctx: KontraContext): KontraAction {
  if (ctx.trump === null) return 'MOZE';
  const trumps = ctx.hand.filter(c => c.suit === ctx.trump);
  const highTrumps = trumps.filter(c => RANK_VALUE[c.rank] >= 4).length;
  // 4+ aduta → kontra
  if (trumps.length >= 4) return 'KONTRA';
  // 3 aduta sa 2+ visoke → kontra
  if (trumps.length >= 3 && highTrumps >= 2) return 'KONTRA';
  // Inače moze
  return 'MOZE';
}

// === CALL OR ALONE STRATEGIJA ===
//
// Pozivalac (DODJEM) bira: zvati NE_DODJEM sparinga ili igrati sam sa nosiocem.
// Pravilo: zovi ako smatras da NE_DODJEM moze uhvatiti NAJMANJE 1 stih.
//   - ima adutski A (siguran)
//   - ima adutski K + bar 1 malu adutsku kartu
//   - ima adutsku D + bar 2 male adutske karte
//   - ima As bilo koji (van aduta — uvek hvata stih)
// Inace igraj sam sa nosiocem (NE_DODJEM sedi i ceka).

export type CallOrAloneAction = 'CALL' | 'ALONE';

export interface CallOrAloneContext {
  caller: Position;        // DODJEM igrac koji bira
  neDodjemHand: Card[];    // ruka NE_DODJEM igraca
  declaredGame: Game;
}

export function chooseCallOrAlone(ctx: CallOrAloneContext): CallOrAloneAction {
  const trump = getTrumpSuitFromGame(ctx.declaredGame);
  const hand = ctx.neDodjemHand;

  // As bilo koji (van aduta) — siguran stih
  const anyAce = hand.some(c => c.rank === 'A');
  if (anyAce) return 'CALL';

  // Adut probe
  if (trump !== null) {
    const trumps = hand.filter(c => c.suit === trump);
    const hasTrumpA = trumps.some(c => c.rank === 'A');
    const hasTrumpK = trumps.some(c => c.rank === 'K');
    const hasTrumpD = trumps.some(c => c.rank === 'Q');
    const trumpLen = trumps.length;

    if (hasTrumpA) return 'CALL';
    // Adut K + bar 1 mala adutska (K je drugi najjaci kad A izadje)
    if (hasTrumpK && trumpLen >= 2) return 'CALL';
    // Adut D + bar 2 male (kad A i K izadju, D hvata)
    if (hasTrumpD && trumpLen >= 3) return 'CALL';
  }

  // Nema sigurnog stiha — igraj sam
  return 'ALONE';
}
