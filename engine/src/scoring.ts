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
}

// 9.3.1 / 9.4 — Raspodela bule među protivnicima
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
    deltas[kontraPlayer] = -declarerDelta;
  } else if (callerPlayer !== null) {
    deltas[callerPlayer] = -declarerDelta;
  } else {
    const followers = followersConfig.active;
    if (followers.length === 1) {
      deltas[followers[0]!] = -declarerDelta;
    } else if (followers.length === 2) {
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
