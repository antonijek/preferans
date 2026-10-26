import type { GameState, Player, Card, Position } from '../../engine/dist/types.js';

export type Viewer =
  | { type: 'player'; seat: Position }
  | { type: 'spectator'; kibicSeats: Set<Position> };

export interface RedactedPlayer extends Omit<Player, 'hand'> {
  hand: Card[]; // real cards if this viewer may see them, [] otherwise
  handCount: number;
}

export interface RedactedGameState
  extends Omit<GameState, 'players' | 'talon' | 'lastTalon' | 'discard'> {
  players: [RedactedPlayer, RedactedPlayer, RedactedPlayer];
  talon: Card[];
  talonCount: number;
  lastTalon: Card[];
  lastTalonCount: number;
  discard: Card[];
  discardCount: number;
}

function canSeeSeat(viewer: Viewer, seat: Position): boolean {
  return viewer.type === 'player' ? viewer.seat === seat : viewer.kibicSeats.has(seat);
}

const TALON_PUBLIC_PHASES = new Set<GameState['phase']>(['DISCARDING', 'DECLARING', 'FOLLOW_DECLARING', 'KONTRA_DECLARING']);

/**
 * Redacts a full engine GameState down to what one specific viewer
 * (a seated player, or a spectator with 0+ kibic grants) is allowed to see.
 * Never send raw `game.state` to a socket directly — always go through this.
 */
export function redactStateFor(state: GameState, viewer: Viewer): RedactedGameState {
  // The talon's discarded cards (state.discard) are the declarer's private
  // burn pile — only the declarer (state.winner) may ever see them, and only
  // if this viewer IS that declarer (spectators never see it, even via kibic,
  // since kibic grants visibility into a player's *hand*, not their discard).
  const isDeclarer = viewer.type === 'player' && state.winner !== null && viewer.seat === state.winner;

  // The taken talon (lastTalon) was shown to the whole table when it was
  // taken, so it stays visible until the first trick is done: the followers
  // need it for Dođem/Ne dođem and kontra (user 2026-10-24/26 — before this
  // it vanished for them the moment the game was declared). After that it is
  // private to the declarer again.
  const talonIsPublic = TALON_PUBLIC_PHASES.has(state.phase) || (state.phase === 'PLAYING' && state.trickCount === 0);

  const players = state.players.map((p, i) => {
    const seat = i as Position;
    const visible = canSeeSeat(viewer, seat);
    return {
      ...p,
      hand: visible ? p.hand : [],
      handCount: p.hand.length,
    };
  }) as [RedactedPlayer, RedactedPlayer, RedactedPlayer];

  const lastTalon = talonIsPublic || isDeclarer ? state.lastTalon : [];
  const discard = isDeclarer ? state.discard : [];

  return {
    ...state,
    players,
    // face-down, not-yet-taken talon: nobody may see its contents before
    // it's taken (it empties itself once taken, per game.ts) — always masked
    talon: [],
    talonCount: state.talon.length,
    lastTalon,
    lastTalonCount: state.lastTalon.length,
    discard,
    discardCount: state.discard.length,
  };
}
