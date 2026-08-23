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
  discard: Card[];
  currentTrick: TrickCard[];
  tricks: TrickCard[][];
  trickCount: number;
  followChoices: (FollowChoice | null)[];
  caller: Position | null;
  kontraPlayer: Position | null;
  kontraLevel: ContraLevel | null;
  mozeCount: number;
  refeUsed: boolean;
  refeOccurred: boolean;
  igraPlayer: Position | null;
  scores: [number, number, number];
  bulas: [number, number, number];
  refeCount: [number, number, number];
}

export interface ScoreUpdate {
  bulas: [number, number, number];
  supeDelta: [number, number, number];
  refeConsumed?: Position;
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
