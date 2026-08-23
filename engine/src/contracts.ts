// Kontrakti / igre — šta može da se igra posle koje licitacije

import { GAME_VALUES, STANDARD_GAMES, IGRA_GAMES } from './constants.js';
import { isIgra, getTrumpSuit } from './scoring.js';
import type { Game, Suit } from './types.js';

export function canDeclareGame(currentBid: number, declaredGame: Game, isIgraBid: boolean): boolean {
  const min = isIgraBid ? Math.max(currentBid, 2) + 1 : currentBid;
  return GAME_VALUES[declaredGame] >= min;
}

// Sve igre ≥ currentBid (standardne)
export function availableGames(currentBid: number): Game[] {
  return [...STANDARD_GAMES]
    .filter(g => GAME_VALUES[g] >= currentBid) as Game[];
}

// Igra igre (koje su dozvoljene za "Igra" proglašenje)
export function availableIgraGames(): Game[] {
  return [...IGRA_GAMES] as Game[];
}

// Da li igra zahteva talon
export function requiresTalon(game: Game, wasIGra: boolean): boolean {
  // "Igra" proglašenje ne uzima talon, ostalo uzima
  return !wasIGra;
}

export { isIgra, getTrumpSuit };
