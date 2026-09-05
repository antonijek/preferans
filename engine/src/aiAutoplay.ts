// Headless "odigraj ceo tok" pokretac AI heuristika — koristi se kao rollout
// politika unutar Monte Carlo pretrage (aiSearch.ts), ne od strane
// stvarne igre (app.js/server i dalje imaju svoje setTimeout-bazirane
// pozive iste ai.ts logike, pojedinacno po fazi).
//
// Ovo je PORT (ne import — engine ne sme da zavisi od server/) dispatch
// tabele iz server/src/ai/aiSeat.ts::computeAiAction, prepravljen da
// DIREKTNO mutira Game instancu (poziva game.<mutator>()) umesto da vraca
// opis akcije, i da sam odredjuje ciji je red u SVAKOJ fazi (aiSeat.ts je
// dobijao "seat" spolja, pošto je odgovarao samo na "koji je sledeci potez
// OVOG sedista" — ovde treba da odigra CEO tok, za sva tri sedista).
import type { Game } from './game.js';
import type { Position } from './types.js';
import { GAME_VALUES, STANDARD_GAMES, IGRA_GAMES } from './constants.js';
import {
  evaluateHand,
  chooseBidAction,
  chooseDiscard,
  chooseFollow,
  chooseCallOrAlone,
  chooseKontra,
  choosePlayCard,
} from './ai.js';
import type { Game as GameT, Suit } from './types.js';

const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValue = (r: string): number => RANK_ORDER.indexOf(r);

const KONTRA_NEXT: Record<string, 'KONTRA' | 'REKONTRA' | 'SUBKONTRA' | 'MORTKONTRA'> = {
  NONE: 'KONTRA',
  KONTRA: 'REKONTRA',
  REKONTRA: 'SUBKONTRA',
  SUBKONTRA: 'MORTKONTRA',
};

const SUIT_TO_GAME: Record<Suit, GameT> = { '♠': 'Pik', '♥': 'Herc', '♦': 'Karo', '♣': 'Tref' };
const SUIT_TO_IGRA: Record<Suit, GameT> = {
  '♠': 'Igra-Pik',
  '♥': 'Igra-Herc',
  '♦': 'Igra-Karo',
  '♣': 'Igra-Tref',
};

function isBetlGame(g: GameT | null): boolean {
  return g === 'Betl' || g === 'Igra-Betl';
}

function chooseStandardGame(hand: { suit: Suit }[], currentBid: number): GameT {
  const best = evaluateHand(hand as never).bestSuit;
  const candidate = best ? SUIT_TO_GAME[best.suit] : null;
  if (candidate && GAME_VALUES[candidate] >= currentBid) return candidate;
  for (const g of STANDARD_GAMES) {
    if (GAME_VALUES[g] >= currentBid) return g;
  }
  return 'Pik';
}

function chooseIgraGame(hand: { suit: Suit }[]): GameT {
  const suits: Suit[] = ['♠', '♥', '♦', '♣'];
  let bestSuit = suits[0]!;
  let bestCount = 0;
  for (const su of suits) {
    const c = hand.filter((card) => card.suit === su).length;
    if (c > bestCount) {
      bestCount = c;
      bestSuit = su;
    }
  }
  return SUIT_TO_IGRA[bestSuit];
}

export type AutoplayStepResult = 'acted' | 'no_actor';

/**
 * Primenjuje TAČNO JEDNU heuristički odabranu akciju na `game`, za koje god
 * sedište je trenutno na potezu u njegovoj trenutnoj fazi. Pretpostavlja da
 * `game.state.phase` NIJE terminalna (GAME_OVER/MATCH_OVER) — pozivalac
 * (autoPlayToHandEnd) to proverava pre poziva.
 */
export function applyHeuristicTurn(game: Game): AutoplayStepResult {
  const s = game.state;

  switch (s.phase) {
    case 'BIDDING': {
      const seat = s.currentBidder;
      const hand = s.players[seat]!.hand;
      // Igra zamrznuta — isto kao aiSeat.ts/app.js aiBidTurn tiebreak grana.
      if (s.igraPlayer !== null && s.igraPlayer !== seat) {
        const best = evaluateHand(hand).bestSuit;
        const canIgra =
          s.players[seat]!.igraEligible &&
          !!best &&
          best.count >= 6 &&
          best.highCards >= 2 &&
          !!best.topCard &&
          rankValue(best.topCard.rank) >= 4;
        if (canIgra) game.sayIgra(seat);
        else game.pass(seat);
        return 'acted';
      }
      const passedPlayers = new Set(
        ([0, 1, 2] as Position[]).filter((i) => s.players[i]!.hasPassedBid),
      );
      const action = chooseBidAction({
        hand,
        currentBid: s.currentBid,
        bidStartPlayer: s.bidStartPlayer,
        currentBidder: s.currentBidder,
        passedPlayers,
        playerBidLevel: s.players[seat]!.bidLevel,
        bids: s.bids,
      });
      if (action.type === 'IGRA' && !s.players[seat]!.igraEligible) {
        game.pass(seat);
        return 'acted';
      }
      switch (action.type) {
        case 'PASS':
          game.pass(seat);
          break;
        case 'IGRA':
          game.sayIgra(seat);
          break;
        case 'BID':
        case 'MOGU':
          game.bid(seat, action.value);
          break;
      }
      return 'acted';
    }

    case 'DISCARDING': {
      const seat = s.winner!;
      const hand = s.players[seat]!.hand;
      const best = evaluateHand(hand).bestSuit;
      const intendedTrump = best ? best.suit : null;
      const [c1, c2] = chooseDiscard(hand, intendedTrump);
      game.discard(seat, [c1.id, c2.id]);
      return 'acted';
    }

    case 'DECLARING': {
      if (s.igraCompetitors !== null) {
        // RULES 3.4.1 tiebreak — deklarant je s.currentBidder, uvek Igra boja.
        const seat = s.currentBidder;
        const hand = s.players[seat]!.hand;
        game.declareIgra(seat, chooseIgraGame(hand));
        return 'acted';
      }
      const seat = s.winner!;
      const hand = s.players[seat]!.hand;
      if (s.igraPlayer === seat) {
        game.declareIgra(seat, chooseIgraGame(hand));
      } else {
        game.declareGame(seat, chooseStandardGame(hand, s.currentBid));
      }
      return 'acted';
    }

    case 'FOLLOW_DECLARING': {
      const followers = ([0, 1, 2] as Position[]).filter((p) => p !== s.winner);
      const undecided = followers.find((p) => s.followChoices[p] === null);
      if (undecided !== undefined) {
        const hand = s.players[undecided]!.hand;
        const willFollow =
          chooseFollow({ hand, declaredGame: s.declaredGame! }) === 'DODJEM';
        game.follow(undecided, willFollow ? 'DODJEM' : 'NE_DODJEM');
        return 'acted';
      }
      // Oba pratioca odlucila, tacno 1 DODJEM + 1 NE_DODJEM, jos nema caller-a
      // — DODJEM igrac bira Zovi/Igraj sam (RULES 5.3).
      const neDodjem = followers.find((p) => s.followChoices[p] === 'NE_DODJEM');
      const callerCandidate = followers.find((p) => s.followChoices[p] === 'DODJEM');
      if (neDodjem === undefined || callerCandidate === undefined) return 'no_actor';
      const neDodjemHand = s.players[neDodjem]!.hand;
      const action = chooseCallOrAlone({
        caller: callerCandidate,
        neDodjemHand,
        declaredGame: s.declaredGame!,
      });
      if (action === 'CALL') game.call(callerCandidate, neDodjem);
      else game.continueWithoutCall();
      return 'acted';
    }

    case 'KONTRA_DECLARING': {
      const seat = game.expectedKontraPlayerPublic();
      if (seat === null) return 'no_actor';
      const hand = s.players[seat]!.hand;
      const levelNum =
        ({ KONTRA: 1, REKONTRA: 2, SUBKONTRA: 3, MORTKONTRA: 4 } as Record<string, number>)[
          s.kontraLevel ?? ''
        ] ?? 0;
      const willKontra =
        s.kontraLevel !== 'MORTKONTRA' &&
        chooseKontra({ hand, trump: s.trump, currentLevel: levelNum }) === 'KONTRA';
      if (willKontra) {
        const nextLevel = KONTRA_NEXT[s.kontraLevel ?? 'NONE']!;
        game.kontra(seat, nextLevel);
      } else {
        game.moze(seat);
      }
      return 'acted';
    }

    case 'PLAYING': {
      const seat = s.currentPlayer;
      const legal = game.getLegalCards(seat);
      if (legal.length === 0) return 'no_actor';
      let cardId: string;
      if (legal.length === 1) {
        cardId = legal[0]!.id;
      } else {
        const isDeclarer = seat === s.winner;
        const avoidTricks = isDeclarer && isBetlGame(s.declaredGame);
        const card = choosePlayCard({
          hand: s.players[seat]!.hand,
          currentTrick: s.currentTrick,
          trump: s.trump,
          declaredGame: s.declaredGame!,
          winnerTricks: s.players[s.winner!]!.tricksWon,
          avoidTricks,
          isDeclarer,
          kontraLevel: s.kontraLevel,
          trickCount: s.trickCount,
          myPosition: seat,
          declarer: s.winner,
        });
        cardId = card ? card.id : legal[0]!.id;
      }
      game.playCard(seat, cardId);
      return 'acted';
    }

    default:
      return 'no_actor';
  }
}
