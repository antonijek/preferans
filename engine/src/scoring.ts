// PREFERANS scoring — čiste funkcije, bez UI/AI/engine state-a
// Svaka funkcija odgovara jednom testnom scenariju iz RULES.md

import {
  GAME_VALUES,
  CONTRA_MULTIPLIERS,
  REFE_MULTIPLIER,
  REQUIRED_TRICKS,
  BETL_FIXED_SUPE,
} from './constants.js';
import type { Game, Position } from './types.js';

export type Multiplier = 1 | 2 | 4 | 8 | 16;

export function getGameValue(game: Game): number {
  const v = GAME_VALUES[game];
  if (v === undefined) throw new Error(`Unknown game: ${game}`);
  return v;
}

// 9.2 — Bule za nosioca
// prolaz: -igra * 2 * contraMultiplier * refeMultiplier
// pad:    +igra * 2 * contraMultiplier * refeMultiplier
export function calculateBulaChange(
  declarerTricks: number,
  game: Game,
  contraMultiplier: Multiplier = CONTRA_MULTIPLIERS.NONE,
  refeMultiplier: Multiplier = 1,
): number {
  const gameValue = getGameValue(game);
  const base = gameValue * 2;
  const totalMultiplier = contraMultiplier * refeMultiplier;
  if (game === 'Betl' || game === 'Igra-Betl') {
    return declarerTricks === 0 ? -base * totalMultiplier : base * totalMultiplier;
  }
  const required = REQUIRED_TRICKS[game];
  return declarerTricks >= required ? -base * totalMultiplier : base * totalMultiplier;
}

export interface FollowerConfig {
  active: Position[];
  kontraš: Position | null;
  pozivalac: Position | null;
  pozvani?: Position | null;
  // Broj stihova svakog NEZAVISNOG pratioca (bez poziva/kontre). Ako je dato,
  // primenjuje se RULES 5.2: nezavisni pratilac treba BAREM 2 stiha da
  // "prodje" (bez promene bule) — NJEGOVA bula zavisi SAMO od NJEGOVOG
  // sopstvenog rezultata, NIKAD automatski od toga da li je NOSILAC uspeo ili
  // pao (potvrdjeno direktno od korisnika). Pratilac koji ne dodje do 2 UVEK
  // RASTE (podize se) za PUN iznos |declarerDelta|, u OBA smera. Potvrdjeno
  // iz REFERENTNI_PRIMERI.md (runde #2,#3,#6,#8,#15). Bez ovog polja, koristi
  // se stari flat pola-pola / sve-jednom fallback.
  tricksWon?: Partial<Record<Position, number>>;
  // RULES 9.4.1 — Betl/Igra-Betl NIKAD ne daje bulu independentnim
  // pratiocima (ni pri uspehu ni pri padu nosioca) — samo fiksne supe,
  // racunate posebno u game.ts. Uzivo prijavljen bag: pratioci su dobijali
  // -6 bule (pola od 12) kad je nosilac pao na Betlu.
  isBetl?: boolean;
}

// 9.3.1 / 9.4 / 5.2 — Raspodela bule među protivnicima
export function calculateBulaDistribution(
  declarerDelta: number,
  followersConfig: FollowerConfig,
): Record<Position, number | undefined> {
  const deltas: Record<Position, number | undefined> = {
    0: undefined, 1: undefined, 2: undefined,
  };
  const kontraPlayer = followersConfig.kontraš;
  const callerPlayer = followersConfig.pozivalac;

  if (kontraPlayer !== null) {
    // RULES 6.3/9.3.2 — kontra je "opklada": kontras SNOSI punu promenu bule
    // SAMO kad IZGUBI (nosilac ipak uspe, declarerDelta<0 — kontras je
    // pogresio). Kad kontras POBEDI (obori nosioca, declarerDelta>0), NJEGOVA
    // bula se NE MENJA — dobija samo supe (racunato posebno u game.ts, na
    // osnovu nosiočevih stihova). Potvrdjeno kroz SVE primere sa kontrom u
    // REFERENTNI_PRIMERI.md: kad nosilac padne (runda #11), kontras (Janko)
    // nema promenu bule, samo supe; u svim primerima gde nosilac uspe uprkos
    // kontri, kontras dobija PUNU promenu bule. Uzivo prijavljen bag: sistem
    // je nosioca spustao ALI I kontrasa koji je pobedio, sto ne sme.
    if (declarerDelta < 0) {
      deltas[kontraPlayer] = -declarerDelta;
    }
  } else if (callerPlayer !== null) {
    // RULES 5.3 — pozivalac+pozvani MORAJU ZAJEDNO uhvatiti bar 4 stiha da
    // "prodju" (bez promene bule) — DVOSTRUKO vise od praga za jednog
    // samostalnog pratioca (2), jer su dvojica protiv nosioca. Ispod 4,
    // pozivalac (nikad pozvani) RASTE za CEO iznos |declarerDelta|, bez
    // obzira na ishod nosioca. Uzivo prijavljeno i potvrdjeno direktno od
    // korisnika (prag 4, ne 2 — NIJE bio u RULES.md pre ovoga). Raniji bag:
    // kod je bezuslovno dizao/spustao pozivaoca za declarerDelta cak i sa
    // 4+ zajednickih stihova — validacija kroz REFERENTNI_PRIMERI.md je
    // uvek imala i kontru pored poziva, pa je KONTRA grana (iznad) tiho
    // hvatala te primere; cist poziv-bez-kontre nikad nije bio proveren.
    const tricksWon = followersConfig.tricksWon;
    const callee = followersConfig.pozvani ?? null;
    if (tricksWon !== undefined) {
      const combined = (tricksWon[callerPlayer] ?? 0) + (callee !== null ? (tricksWon[callee] ?? 0) : 0);
      if (combined < 4) deltas[callerPlayer] = Math.abs(declarerDelta);
    } else {
      deltas[callerPlayer] = -declarerDelta;
    }
  } else if (followersConfig.isBetl) {
    // RULES 9.4.1 — Betl nikad ne daje bulu pratiocima, ni pri uspehu ni pri
    // padu nosioca. Svi ostaju undefined (bez promene bule) — samo fiksne
    // supe, racunate posebno u game.ts.
  } else {
    const followers = followersConfig.active;
    const tricksWon = followersConfig.tricksWon;
    if (tricksWon !== undefined && followers.length > 0) {
      // RULES 5.2 — svaki nezavisni pratilac treba BAREM 2 stiha da "prodje"
      // svoj licni prag. Pratilac ISPOD praga (< 2) UVEK PADA (bula RASTE)
      // za CEO iznos |declarerDelta|, nezavisno, BEZ OBZIRA da li je nosilac
      // uspeo ili pao. Pratilac NA PRAGU ILI IZNAD (>= 2) NIKAD ne dobija
      // promenu bule — SAMO supe, opet bez obzira na ishod nosioca. (Uzivo
      // eksplicitno potvrdjeno i ISPRAVLJENO nazad na ovo posle kratkog
      // pokusaja "simetricne nagrade" koji je korisnik odbio: "njemu ide
      // supe a ne smes da ga spustas" — pratilac se NIKAD ne nagradjuje
      // spustanjem bule, cak ni kad nosilac padne.)
      const magnitude = Math.abs(declarerDelta);
      for (const p of followers) {
        if ((tricksWon[p] ?? 0) < 2) deltas[p] = magnitude;
      }
    } else if (followers.length === 1) {
      // Fallback (nosilac pao, ili nema podataka o stihovima): sve na jednog
      deltas[followers[0]!] = -declarerDelta;
    } else if (followers.length === 2) {
      // Fallback: pola-pola
      const half = -declarerDelta / 2;
      deltas[followers[0]!] = half;
      deltas[followers[1]!] = half;
    }
  }
  return deltas;
}

// 9.4 — Supe za jednog pratioca
export function calculateSupaForFollower(
  followerTricks: number,
  game: Game,
  contraMultiplier: Multiplier = CONTRA_MULTIPLIERS.NONE,
  refeMultiplier: Multiplier = 1,
): number {
  const gameValue = getGameValue(game);
  const base = followerTricks * gameValue * 2;
  return base * contraMultiplier * refeMultiplier;
}

// 9.4.1 — Betl specifične supe (fiksno)
export function calculateBetlSupa(
  game: Game,
  contraMultiplier: Multiplier = CONTRA_MULTIPLIERS.NONE,
  refeMultiplier: Multiplier = 1,
): number {
  const fixed = BETL_FIXED_SUPE[game];
  if (fixed === undefined) throw new Error(`Not a betl game: ${game}`);
  return fixed * contraMultiplier * refeMultiplier;
}

// 10 — Finalni rezultat
// finalni_rezultat = -supa_protiv + supe_za + finalni_broj_bula * 10
export function calculateFinalScore(args: {
  supeZa: number;
  supeProtiv: number;
  finalneBule: number;
}): number {
  return -args.supeProtiv + args.supeZa + args.finalneBule * 10;
}

// 9.6 — Otpisivanje
// Logika iz RULES.md i Dodatak A:
//   - Svako dobija ceiling(total/3) baza
//   - Jedan igrač dobija floor(total/3) — onaj koji je NAJVIŠE bula (najbolji)
//   - Tako najgori ostaje u najdubljem minusu (posle otpisa)
export interface WriteOffResult {
  writeOff: [number, number, number];
  finalBule: [number, number, number];
}

export function calculateWriteOff(bule: [number, number, number]): WriteOffResult {
  const total = bule[0] + bule[1] + bule[2];
  if (total <= 0) {
    return {
      writeOff: [0, 0, 0],
      finalBule: [bule[0], bule[1], bule[2]],
    };
  }
  const playerCount = 3;
  const ceiling = Math.ceil(total / playerCount);
  const base = Math.floor(total / playerCount);
  const remainder = total % playerCount;
  const ws: [number, number, number] = [0, 0, 0];
  const finalB: [number, number, number] = [0, 0, 0];
  const sorted = ([0, 1, 2] as Position[])
    .map(p => ({ p, b: bule[p] }))
    .sort((a, b) => b.b - a.b);
  sorted.forEach((pl, idx) => {
    const off = idx < remainder ? ceiling : base;
    ws[pl.p] = off;
    finalB[pl.p] = bule[pl.p] - off;
  });
  return { writeOff: ws, finalBule: finalB };
}

// Helper: da li igra zahteva 6+ štihova za prolaz
export function isBetl(game: Game): boolean {
  return game === 'Betl' || game === 'Igra-Betl';
}

export function isSans(game: Game): boolean {
  return game === 'Sans' || game === 'Igra-Sans';
}

export function isNoTrump(game: Game): boolean {
  return isBetl(game) || isSans(game);
}

export function isIgra(game: Game): boolean {
  return (game as string).startsWith('Igra-');
}

// Odredi suit iz igre (null za bezaduta)
export function getTrumpSuit(game: Game): import('./types.js').Suit | null {
  if (isNoTrump(game)) return null;
  switch (game) {
    case 'Pik':
    case 'Igra-Pik':
      return '♠';
    case 'Herc':
    case 'Igra-Herc':
      return '♥';
    case 'Karo':
    case 'Igra-Karo':
      return '♦';
    case 'Tref':
    case 'Igra-Tref':
      return '♣';
    default:
      return null;
  }
}
