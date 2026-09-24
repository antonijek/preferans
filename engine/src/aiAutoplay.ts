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
import {
  evaluateHand,
  chooseBidAction,
  chooseDiscard,
  chooseFollow,
  chooseCallOrAlone,
  chooseKontra,
  choosePlayCard,
  chooseDeclareGame,
} from './ai.js';
import { IGRA_GAMES } from './constants.js';
import type { Card, Game as GameT } from './types.js';

const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValue = (r: string): number => RANK_ORDER.indexOf(r);

const KONTRA_NEXT: Record<string, 'KONTRA' | 'REKONTRA' | 'SUBKONTRA' | 'MORTKONTRA'> = {
  NONE: 'KONTRA',
  KONTRA: 'REKONTRA',
  REKONTRA: 'SUBKONTRA',
  SUBKONTRA: 'MORTKONTRA',
};

function isBetlGame(g: GameT | null): boolean {
  return g === 'Betl' || g === 'Igra-Betl';
}

function chooseStandardGame(hand: Card[], currentBid: number): GameT {
  return chooseDeclareGame(hand, currentBid);
}

// Uzivo prijavljen bag (2026-09-22): ranija verzija je birala PROSTO
// najduzu boju, bez provere da li stvarno ima 6 sigurnih stihova (razlicito
// od isIgraWorthy(), koje je opravdalo sam Igra-poziv), i nikad nije
// razmatrala Igra-Betl/Igra-Sans — vidi chooseDeclareGame() u aiBidding.ts
// za pun kontekst. Sad ista, jedinstvena logika kao standardno
// proglasavanje, samo nad IGRA_GAMES.
function chooseIgraGame(hand: Card[], currentBid: number): GameT {
  return chooseDeclareGame(hand, currentBid, IGRA_GAMES);
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
        game.declareIgra(seat, chooseIgraGame(hand, s.currentBid));
        return 'acted';
      }
      const seat = s.winner!;
      const hand = s.players[seat]!.hand;
      if (s.igraPlayer === seat) {
        game.declareIgra(seat, chooseIgraGame(hand, s.currentBid));
      } else {
        game.declareGame(seat, chooseStandardGame(hand, s.currentBid));
      }
      return 'acted';
    }

    case 'FOLLOW_DECLARING': {
      // Uzivo prijavljen bag (2026-09-24, otkriveno preko Istokove Igra-Herc
      // ruke koja je dobijala sumnjivo nizak simulacioni skor): ranija verzija
      // je birala PRVOG nedecided pratioca po POZICIONOM redosledu (0,1,2 sa
      // izbacenim winner-om), a NE po stvarnom RULES 5.1 redosledu (desni od
      // nosioca prvi — expectedFollowPlayerPublic()). Za nosioca na sedistu 1
      // (followers=[0,2] u pozicionom redosledu, ali desni je 2, ne 0) ovo je
      // znacilo game.follow(0,...) svaki put — follow() ODBIJA pogresan
      // redosled (vraca false, ali povratna vrednost se nije ni proveravala),
      // pa se FOLLOW_DECLARING NIKAD nije pomerio i cela simulacija je
      // zaglavila do maxSteps (60), tiho vracajuci nagradu 0 za taj uzorak —
      // ovo je sistematski obaralo simulacioni skor SVAKOG kandidata (BIDDING
      // Igra/bid, DECLARING izbor igre...) cija rukoveza zavrsi sa nosiocem na
      // sedistu 1, u PRIBLIZNO trecini svih uzorkovanih ruku.
      const undecided = game.expectedFollowPlayerPublic();
      if (undecided !== null) {
        const hand = s.players[undecided]!.hand;
        const willFollow =
          chooseFollow({ hand, declaredGame: s.declaredGame! }) === 'DODJEM';
        const ok = game.follow(undecided, willFollow ? 'DODJEM' : 'NE_DODJEM');
        return ok ? 'acted' : 'no_actor';
      }
      // Oba pratioca odlucila, tacno 1 DODJEM + 1 NE_DODJEM, jos nema caller-a
      // — DODJEM igrac bira Zovi/Igraj sam (RULES 5.3).
      const followers = ([0, 1, 2] as Position[]).filter((p) => p !== s.winner);
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
          tricks: s.tricks,
          nextActivePosition: game.nextActivePlayer(seat),
          bidLevels: [s.players[0]!.bidLevel, s.players[1]!.bidLevel, s.players[2]!.bidLevel],
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
