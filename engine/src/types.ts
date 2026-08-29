// SVI TIPOVI za Preferans engine
// Ovaj fajl definiše sve domenske tipove — ništa sem tipova.

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export type CardId = string;

export interface Card {
  id: CardId;
  suit: Suit;
  rank: Rank;
}

export type Position = 0 | 1 | 2;

export const POSITIONS: readonly Position[] = [0, 1, 2] as const;

export interface Player {
  id: string;
  name: string;
  position: Position;
  hand: Card[];
  tricksWon: number;
  stihi: Card[][];
  hasPassedBid: boolean;
  bidLevel: number;
  kontraLevel: ContraLevel | null;
  follows: FollowChoice | null;
}

export type FollowChoice = 'DODJEM' | 'NE_DODJEM';

export type ContraLevel = 'KONTRA' | 'REKONTRA' | 'SUBKONTRA' | 'MORTKONTRA';

export type Game =
  | 'Pik' | 'Karo' | 'Herc' | 'Tref' | 'Betl' | 'Sans'
  | 'Igra-Pik' | 'Igra-Karo' | 'Igra-Herc' | 'Igra-Tref' | 'Igra-Betl' | 'Igra-Sans';

export type StandardGame = Exclude<Game, `Igra-${string}`>;
export type IgraGame = Extract<Game, `Igra-${string}`>;
export type TrumpGame = Exclude<Game, 'Betl' | 'Sans' | 'Igra-Betl' | 'Igra-Sans'>;
export type NoTrumpGame = 'Betl' | 'Sans' | 'Igra-Betl' | 'Igra-Sans';

// Legalne akcije koje UI moze da prikaze
export type LegalAction =
  | { type: 'pass'; player: Position; label: string }
  | { type: 'bid'; player: Position; value: number; label: string }
  | { type: 'mogu'; player: Position; value: number; label: string }
  | { type: 'igra'; player: Position; label: string }
  | { type: 'discard-info'; player: Position; handSize: number; label: string }
  | { type: 'declare'; player: Position; game: Game; label: string }
  | { type: 'follow'; player: Position; choice: 'DODJEM' | 'NE_DODJEM'; label: string }
  | { type: 'call'; player: Position; callee: Position; label: string }
  | { type: 'continueWithoutCall'; player: Position; label: string }
  | { type: 'kontra'; player: Position; level: ContraLevel; label: string }
  | { type: 'moze'; player: Position; label: string }
  | { type: 'playCard'; player: Position; cardId: string; label: string };

export type GamePhase =
  | 'WAITING'
  | 'DEALING'
  | 'BIDDING'
  | 'TAKING_TALON'
  | 'DISCARDING'
  | 'DECLARING'
  | 'FOLLOW_DECLARING'
  | 'KONTRA_DECLARING'
  | 'PLAYING'
  | 'TRICK_RESULT'
  | 'SCORING'
  | 'REFE'
  | 'GAME_OVER';

export interface BidAction {
  type: 'BID';
  player: Position;
  value: number;
}

export interface PassAction {
  type: 'PASS';
  player: Position;
}

export interface MoguAction {
  type: 'MOGU';
  player: Position;
  value: number;
}

export interface IgraAction {
  type: 'IGRA';
  player: Position;
  game: Game;
}

export interface DeclareGameAction {
  type: 'DECLARE_GAME';
  player: Position;
  game: Game;
}

export interface FollowAction {
  type: 'FOLLOW';
  player: Position;
  follows: FollowChoice;
}

export interface CallAction {
  type: 'CALL';
  player: Position;
}

export interface KontraAction {
  type: 'KONTRA';
  player: Position;
  level: ContraLevel;
}

export interface MozeAction {
  type: 'MOZE';
  player: Position;
}

export interface DiscardAction {
  type: 'DISCARD';
  player: Position;
  cardIds: [CardId, CardId];
}

export interface PlayCardAction {
  type: 'PLAY_CARD';
  player: Position;
  cardId: CardId;
}

export type Action =
  | BidAction | PassAction | MoguAction | IgraAction
  | DeclareGameAction | FollowAction | CallAction
  | KontraAction | MozeAction | DiscardAction | PlayCardAction;

export interface BidRecord {
  player: Position;
  type: 'BID' | 'PASS' | 'MOGU' | 'IGRA';
  value?: number;
  game?: Game;
  mogu?: boolean;
}

export interface TrickCard {
  player: Position;
  card: Card;
}

export interface GameState {
  phase: GamePhase;
  round: number;
  dealer: Position;
  players: [Player, Player, Player];
  currentPlayer: Position;
  currentBidder: Position;
  currentBid: number;
  bids: BidRecord[];
  winner: Position | null;
  winnerGame: Game | null;
  bidStartPlayer: Position;
  declaredGame: Game | null;
  trump: Suit | null;
  talon: Card[];
  // Snimak talona u trenutku uzimanja (RULES: vidljivo dok nosilac ne
  // proglasi igru) — `talon` se prazni cim ga nosilac uzme u ruku, ovo polje
  // pamti koje su to karte bile do sledece podele.
  lastTalon: Card[];
  discard: Card[];
  currentTrick: TrickCard[];
  tricks: TrickCard[][];
  trickCount: number;
  followChoices: (FollowChoice | null)[];
  caller: Position | null;
  callee: Position | null;
  kontraPlayer: Position | null;
  kontraLevel: ContraLevel | null;
  mozeCount: number;
  refeUsed: boolean;
  refeOccurred: boolean;
  igraPlayer: Position | null;
  scores: [number, number, number];
  bulas: [number, number, number];
  refeCount: [number, number, number];
  lastHandResult: EndOfHandResult | null;
}

export interface ScoreUpdate {
  bulas: [number, number, number];
  supeDelta: [number, number, number];
  refeConsumed?: Position;
}

export interface EndOfHandResult {
  bulas: [number, number, number];
  supeDelta: [number, number, number];
  passed: boolean;
  winner: Position | null;
  winnerGame: Game | null;
  kontraLevel: ContraLevel | null;
  refeConsumed: Position | null;
  refeActive: boolean;
  bulasAfter: [number, number, number];
}

export function createEmptyPlayer(id: string, name: string, position: Position): Player {
  return {
    id,
    name,
    position,
    hand: [],
    tricksWon: 0,
    stihi: [],
    hasPassedBid: false,
    bidLevel: 0,
    kontraLevel: null,
    follows: null,
  };
}
