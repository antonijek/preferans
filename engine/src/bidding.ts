// Licitacija po RULES.md sekcija 3

import { GAME_VALUES, STANDARD_GAMES, IGRA_GAMES } from './constants.js';
import { isIgra } from './scoring.js';
import type { BidRecord, Game, Position } from './types.js';

export interface BiddingState {
  currentBid: number;
  currentBidder: Position;
  bidStartPlayer: Position;
  bids: BidRecord[];
  passedPlayers: Set<Position>;
  winner: Position | null;
  winnerGame: Game | null;
}

export function createBiddingState(startPlayer: Position): BiddingState {
  return {
    currentBid: 0,
    currentBidder: startPlayer,
    bidStartPlayer: startPlayer,
    bids: [],
    passedPlayers: new Set(),
    winner: null,
    winnerGame: null,
  };
}

// 3.2 — Sledeći igrač
export function nextBidder(state: BiddingState): Position {
  const order: Position[] = [0, 1, 2];
  let idx = order.indexOf(state.currentBidder);
  let next = (idx + 1) % 3;
  let safety = 0;
  while (state.passedPlayers.has(order[next]!) && safety < 3) {
    next = (next + 1) % 3;
    safety++;
  }
  return order[next]!;
}

// 3.2 — Igrač kaže "dalje"
export function pass(state: BiddingState, player: Position): BiddingState {
  if (player !== state.currentBidder) return state;
  const passedPlayers = new Set(state.passedPlayers);
  passedPlayers.add(player);
  const bids = [...state.bids, { player, type: 'PASS' as const }];
  // Ako su svi prošli — partija se ne igra, refe
  const allPassed = passedPlayers.size === 3;
  let winner: Position | null = null;
  if (!allPassed) {
    const remaining = ([0, 1, 2] as Position[]).filter(p => !passedPlayers.has(p));
    if (remaining.length === 1) {
      winner = remaining[0]!;
    }
  }
  return {
    ...state,
    bids,
    passedPlayers,
    currentBidder: nextBidder({ ...state, passedPlayers }),
    winner,
  };
}

// 3.2 — Licitacija vrednosti
export function bid(state: BiddingState, player: Position, value: number): BiddingState {
  if (player !== state.currentBidder) return state;
  if (value <= state.currentBid || value < 2 || value > 7) return state;
  const bids = [...state.bids, { player, type: 'BID' as const, value }];
  return {
    ...state,
    bids,
    currentBid: value,
    currentBidder: nextBidder(state),
  };
}

// 3.3 — "Mogu"
export function mogu(state: BiddingState, player: Position, value: number): BiddingState {
  if (player !== state.currentBidder) return state;
  if (value !== state.currentBid) return state;
  const bids = [...state.bids, { player, type: 'MOGU' as const, value, mogu: true }];
  return {
    ...state,
    bids,
    currentBidder: nextBidder(state),
  };
}

// 3.4 — "Igra"
export function igra(state: BiddingState, player: Position, game: Game): BiddingState {
  if (player !== state.currentBidder) return state;
  if (!isIgra(game)) return state;
  const bids = [...state.bids, { player, type: 'IGRA' as const, game }];
  return {
    ...state,
    bids,
    winner: player,
    winnerGame: game,
  };
}

// Da li su svi igrači rekli "dalje"?
export function allPassed(state: BiddingState): boolean {
  return state.passedPlayers.size === 3;
}

export { STANDARD_GAMES, IGRA_GAMES, GAME_VALUES };
