import type { Game } from '../../../engine/dist/game.js';
import type {
  Game as GameT,
  Position,
  FollowChoice,
  ContraLevel,
} from '../../../engine/dist/types.js';

export type GameAction =
  | { type: 'bid'; player: Position; value: number }
  | { type: 'pass'; player: Position }
  | { type: 'sayIgra'; player: Position }
  | { type: 'declareIgra'; player: Position; game: GameT }
  | { type: 'discard'; player: Position; cardIds: [string, string] }
  | { type: 'declareGame'; player: Position; game: GameT }
  | { type: 'follow'; player: Position; choice: FollowChoice }
  | { type: 'call'; caller: Position; callee: Position }
  | { type: 'continueWithoutCall' }
  | { type: 'kontra'; player: Position; level: ContraLevel }
  | { type: 'moze'; player: Position }
  | { type: 'playCard'; player: Position; cardId: string };

/**
 * Overwrites the actor field(s) of a client-submitted action with the seat
 * the SERVER knows this socket occupies. Never trust a client-supplied
 * `player`/`caller` value directly — a socket for seat 0 must not be able to
 * act as seat 1 just by putting a different number in the payload.
 */
export function withAuthenticatedActor(action: GameAction, actorSeat: Position): GameAction {
  if (action.type === 'call') {
    return { ...action, caller: actorSeat };
  }
  if (action.type === 'continueWithoutCall') {
    return action;
  }
  return { ...action, player: actorSeat };
}

export function applyAction(game: Game, action: GameAction): boolean {
  switch (action.type) {
    case 'bid':
      return game.bid(action.player, action.value);
    case 'pass':
      return game.pass(action.player);
    case 'sayIgra':
      return game.sayIgra(action.player);
    case 'declareIgra':
      return game.declareIgra(action.player, action.game);
    case 'discard':
      return game.discard(action.player, action.cardIds);
    case 'declareGame':
      return game.declareGame(action.player, action.game);
    case 'follow':
      return game.follow(action.player, action.choice);
    case 'call':
      return game.call(action.caller, action.callee);
    case 'continueWithoutCall':
      return game.continueWithoutCall();
    case 'kontra':
      return game.kontra(action.player, action.level);
    case 'moze':
      return game.moze(action.player);
    case 'playCard':
      return game.playCard(action.player, action.cardId);
    default:
      return false;
  }
}
