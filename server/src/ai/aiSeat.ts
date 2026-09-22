import type { Game } from '../../../engine/dist/game.js';
import type { Position } from '../../../engine/dist/types.js';
import { STANDARD_GAMES, IGRA_GAMES } from '../../../engine/dist/constants.js';
import {
  evaluateHand,
  chooseBidAction,
  chooseDiscard,
  chooseFollow,
  chooseCallOrAlone,
  chooseKontra,
  choosePlayCard,
  chooseDeclareGame,
  isIgraWorthy,
} from '../../../engine/dist/ai.js';
import type { GameAction } from '../socket/gameEvents.js';

// Server-side port of the AI orchestration in app.js (aiBidTurn/aiChooseGame/
// aiChooseIgraGame/aiDiscard/renderFollowing/renderKontra/aiPlayCard) for
// driving a seat abandoned via `game:leave`. Same decision functions from
// engine/dist/ai.js, same heuristics — only the trigger differs (no
// render()/DOM here, the caller polls via getLegalActions() instead).
//
// Uzivo prijavljen bag (2026-09-22, audit posle korisnikovog "pogledaj
// dobro, popravi sve"): ovaj fajl je DUPLIRAO chooseStandardGame/
// chooseIgraGame lokalno (identicno app.js/aiAutoplay.ts pre istog dana
// popravljenih), sa ISTIM bagovima — declare bez Betl/Sans poredjenja,
// Igra-declare po najduzoj boji umesto po countDeclarerTricks, i
// igraPlayer-tiebreak grana u BIDDING sa zastarelim inline pragom umesto
// isIgraWorthy(). Ova putanja se koristi kad covek napusti online partiju
// (`game:leave`) i NE ide kroz searchChooseAction — bila bi jedina AI
// putanja koja NIKAD ne bi dobila nijednu od danasnjih popravki da nije
// ovde eksplicitno ispravljena. Sad delegira na chooseDeclareGame()
// (aiBidding.ts) i isIgraWorthy() — istu logiku kao svuda drugde.

const KONTRA_NEXT: Record<string, 'KONTRA' | 'REKONTRA' | 'SUBKONTRA' | 'MORTKONTRA'> = {
  NONE: 'KONTRA',
  KONTRA: 'REKONTRA',
  REKONTRA: 'SUBKONTRA',
  SUBKONTRA: 'MORTKONTRA',
};

function isBetlGame(g: string | null): boolean {
  return g === 'Betl' || g === 'Igra-Betl';
}

function chooseStandardGame(hand: { suit: string }[], currentBid: number): string {
  return chooseDeclareGame(hand as never, currentBid, STANDARD_GAMES as never) as never;
}

function chooseIgraGame(hand: { suit: string }[], currentBid: number): string {
  return chooseDeclareGame(hand as never, currentBid, IGRA_GAMES as never) as never;
}

/**
 * Computes the next action for `seat` given the current game state. Caller
 * is responsible for confirming it's actually this seat's turn (via
 * getLegalActions()) before calling this.
 */
export function computeAiAction(game: Game, seat: Position): GameAction | null {
  const s = game.state;

  switch (s.phase) {
    case 'BIDDING': {
      const hand = s.players[seat]!.hand;
      // Igra frozen — mirrors app.js aiBidTurn's igraPlayer tiebreak branch.
      if (s.igraPlayer !== null && s.igraPlayer !== seat) {
        const canIgra = s.players[seat]!.igraEligible && isIgraWorthy(hand as never);
        return canIgra ? { type: 'sayIgra', player: seat } : { type: 'pass', player: seat };
      }
      const passedPlayers = new Set(
        s.players.map((_p, i) => i).filter((i) => s.players[i]!.hasPassedBid),
      );
      const action = chooseBidAction({
        hand,
        currentBid: s.currentBid,
        bidStartPlayer: s.bidStartPlayer,
        currentBidder: s.currentBidder,
        passedPlayers: passedPlayers as never,
        playerBidLevel: s.players[seat]!.bidLevel,
        bids: s.bids,
      } as never);
      if (action.type === 'IGRA' && !s.players[seat]!.igraEligible) {
        return { type: 'pass', player: seat };
      }
      switch (action.type) {
        case 'PASS':
          return { type: 'pass', player: seat };
        case 'IGRA':
          return { type: 'sayIgra', player: seat };
        case 'BID':
        case 'MOGU':
          return { type: 'bid', player: seat, value: action.value };
        default:
          return { type: 'pass', player: seat };
      }
    }

    case 'DISCARDING': {
      const hand = s.players[seat]!.hand;
      const best = evaluateHand(hand as never).bestSuit;
      const intendedTrump = best ? best.suit : null;
      const [c1, c2] = chooseDiscard(hand as never, intendedTrump as never);
      return { type: 'discard', player: seat, cardIds: [c1.id, c2.id] };
    }

    case 'DECLARING': {
      if (s.igraCompetitors !== null) {
        // RULES 3.4.1 tiebreak — declarer is s.currentBidder, always Igra-suit.
        const hand = s.players[seat]!.hand;
        return { type: 'declareIgra', player: seat, game: chooseIgraGame(hand as never, s.currentBid) as never };
      }
      const isIgra = s.igraPlayer === seat;
      const hand = s.players[seat]!.hand;
      if (isIgra) {
        return { type: 'declareIgra', player: seat, game: chooseIgraGame(hand as never, s.currentBid) as never };
      }
      return {
        type: 'declareGame',
        player: seat,
        game: chooseStandardGame(hand as never, s.currentBid) as never,
      };
    }

    case 'FOLLOW_DECLARING': {
      if (s.followChoices[seat] === null) {
        const hand = s.players[seat]!.hand;
        const willFollow =
          chooseFollow({ hand: hand as never, declaredGame: s.declaredGame as never }) === 'DODJEM';
        return { type: 'follow', player: seat, choice: willFollow ? 'DODJEM' : 'NE_DODJEM' };
      }
      // Both followers decided, exactly one DODJEM (=seat) + one NE_DODJEM, no
      // caller yet — seat must choose call-or-solo (RULES 5.3).
      const followers = ([0, 1, 2] as Position[]).filter((p) => p !== s.winner);
      const neDodjem = followers.find((p) => s.followChoices[p] === 'NE_DODJEM');
      if (neDodjem === undefined) return null;
      const neDodjemHand = s.players[neDodjem]!.hand;
      const action = chooseCallOrAlone({
        caller: seat,
        neDodjemHand: neDodjemHand as never,
        declaredGame: s.declaredGame as never,
      } as never);
      return action === 'CALL'
        ? { type: 'call', caller: seat, callee: neDodjem }
        : { type: 'continueWithoutCall' };
    }

    case 'KONTRA_DECLARING': {
      const hand = s.players[seat]!.hand;
      const levelNum =
        ({ KONTRA: 1, REKONTRA: 2, SUBKONTRA: 3, MORTKONTRA: 4 } as Record<string, number>)[
          s.kontraLevel ?? ''
        ] ?? 0;
      const willKontra =
        s.kontraLevel !== 'MORTKONTRA' &&
        chooseKontra({ hand: hand as never, trump: s.trump as never, currentLevel: levelNum }) === 'KONTRA';
      if (willKontra) {
        const nextLevel = KONTRA_NEXT[s.kontraLevel ?? 'NONE']!;
        return { type: 'kontra', player: seat, level: nextLevel };
      }
      return { type: 'moze', player: seat };
    }

    case 'PLAYING': {
      const legal = game.getLegalCards(seat);
      if (legal.length === 0) return null;
      if (legal.length === 1) return { type: 'playCard', player: seat, cardId: legal[0]!.id };
      const isDeclarer = seat === s.winner;
      const avoidTricks = isDeclarer && isBetlGame(s.declaredGame);
      const card = choosePlayCard({
        hand: s.players[seat]!.hand as never,
        currentTrick: s.currentTrick as never,
        trump: s.trump as never,
        declaredGame: s.declaredGame as never,
        winnerTricks: s.players[s.winner!]!.tricksWon,
        avoidTricks,
        isDeclarer,
        kontraLevel: s.kontraLevel as never,
        trickCount: s.trickCount,
        myPosition: seat,
        declarer: s.winner,
        tricks: s.tricks as never,
        nextActivePosition: game.nextActivePlayer(seat) as never,
      } as never);
      return { type: 'playCard', player: seat, cardId: card ? card.id : legal[0]!.id };
    }

    default:
      return null;
  }
}
