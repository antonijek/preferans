// PREFERANS — konstante iz RULES.md sekcija 3.1, 6.6, 7

import type { Game, Suit, ContraLevel } from './types.js';

export const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES: Record<Suit, string> = {
  '♠': 'Pik',
  '♥': 'Herc',
  '♦': 'Karo',
  '♣': 'Tref',
};

export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export const ALL_RANKS = RANKS;
export const RANK_VALUE: Record<string, number> = {
  '7': 0, '8': 1, '9': 2, '10': 3, 'J': 4, 'Q': 5, 'K': 6, 'A': 7,
};

export const GAME_VALUES: Record<Game, number> = {
  'Pik': 2,
  'Karo': 3,
  'Herc': 4,
  'Tref': 5,
  'Betl': 6,
  'Sans': 7,
  'Igra-Pik': 3,
  'Igra-Karo': 4,
  'Igra-Herc': 5,
  'Igra-Tref': 6,
  'Igra-Betl': 7,
  'Igra-Sans': 8,
};

export const STANDARD_GAMES = ['Pik', 'Karo', 'Herc', 'Tref', 'Betl', 'Sans'] as const;
export const IGRA_GAMES = [
  'Igra-Pik', 'Igra-Karo', 'Igra-Herc',
  'Igra-Tref', 'Igra-Betl', 'Igra-Sans',
] as const;

export const CONTRA_MULTIPLIERS = {
  NONE: 1,
  KONTRA: 2,
  REKONTRA: 4,
  SUBKONTRA: 8,
  MORTKONTRA: 16,
} as const;

export const CONTRA_LEVELS: readonly ContraLevel[] = [
  'KONTRA', 'REKONTRA', 'SUBKONTRA', 'MORTKONTRA',
] as const;

export const REFE_MULTIPLIER = 2;

export const DEFAULT_REFE_PER_PLAYER = 2;

export const REQUIRED_TRICKS: Record<Game, number> = {
  'Pik': 6, 'Karo': 6, 'Herc': 6, 'Tref': 6, 'Betl': 0, 'Sans': 6,
  'Igra-Pik': 6, 'Igra-Karo': 6, 'Igra-Herc': 6,
  'Igra-Tref': 6, 'Igra-Betl': 0, 'Igra-Sans': 6,
};

export const BETL_FIXED_SUPE: Partial<Record<Game, number>> = {
  'Betl': 60,
  'Igra-Betl': 70,
};

export const INITIAL_BULAS = 100;
export const CARDS_PER_PLAYER = 10;
export const TALON_SIZE = 2;
export const TRICKS_PER_HAND = 10;
