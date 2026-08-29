// Test cele partije — igra se dok god niko nije u šeširu (bule >= 0)
// Maksimalno 200 rundi za sigurnost
// Pokretanje: cd D:\preferans\engine && node --import tsx tools/test-full-game.ts [seed]

import { Game } from '../src/game.js';
import {
  chooseBidAction,
  chooseDiscard,
  chooseFollow,
  chooseKontra,
  choosePlayCard,
  chooseUseRefe,
} from '../src/ai.js';
import { GAME_VALUES } from '../src/constants.js';

const SEED = parseInt(process.argv[2] || '12345', 10);
const MAX_ROUNDS = 200;
const HAT_THRESHOLD = 0; // bule < HAT_THRESHOLD znači "u šeširu"

const g = new Game({ seed: SEED });
console.log(`=== Test cele partije (seed=${SEED}) ===`);
console.log(`Kriterijum kraja: neko u šeširu (bule < ${HAT_THRESHOLD}), max ${MAX_ROUNDS} rundi\n`);

let totalRounds = 0;
let totalRefe = 0;
let totalPlayed = 0;
let statsByGame: Record<string, { won: number; lost: number }> = {};

function playOneRound(dealer: number) {
  g.newHand(dealer as 0 | 1 | 2);
  let safety = 0;
  while (g.state.phase !== 'GAME_OVER' && g.state.phase !== 'REFE' && safety < 300) {
    const phase = g.state.phase;
    if (phase === 'BIDDING') {
      const p = g.state.currentBidder;
      const hand = g.state.players[p].hand;
      const passedSet = new Set<number>();
      for (let j = 0; j < 3; j++) {
        if (g.state.players[j].hasPassedBid) passedSet.add(j);
      }
      const action = chooseBidAction({
        hand,
        currentBid: g.state.currentBid,
        bidStartPlayer: g.state.bidStartPlayer,
        currentBidder: g.state.currentBidder,
        passedPlayers: passedSet,
      });
      if (action.type === 'PASS') g.pass(p);
      else if (action.type === 'IGRA') g.sayIgra(p);
      else g.bid(p, action.value);
    } else if (phase === 'DISCARDING') {
      const winner = g.state.winner!;
      const hand = g.state.players[winner].hand;
      const trump = g.state.trump;
      const [c1, c2] = chooseDiscard(hand, trump);
      g.discard(winner, [c1.id, c2.id]);
    } else if (phase === 'DECLARING') {
      const winner = g.state.winner!;
      const hand = g.state.players[winner].hand;
      const action = chooseBidAction({
        hand,
        currentBid: g.state.currentBid,
        bidStartPlayer: g.state.bidStartPlayer,
        currentBidder: g.state.currentBidder,
        passedPlayers: new Set(),
      });
      if (action.type === 'IGRA') {
        g.declareIgra(action.game);
      } else {
        const suits = ['♠', '♥', '♦', '♣'];
        let bestSuit = suits[0], bestCount = 0;
        for (const su of suits) {
          const c = hand.filter(card => card.suit === su).length;
          if (c > bestCount) { bestCount = c; bestSuit = su; }
        }
        const suitMap: Record<string, string> = { '♠': 'Pik', '♥': 'Herc', '♦': 'Karo', '♣': 'Tref' };
        const candidate = suitMap[bestSuit]!;
        if (GAME_VALUES[candidate] >= g.state.currentBid) {
          g.declareGame(winner, candidate);
        } else {
          g.declareGame(winner, 'Pik');
        }
      }
    } else if (phase === 'FOLLOW_DECLARING') {
      const followers = [0, 1, 2].filter(p => p !== g.state.winner);
      const undecided = followers.find(p => g.state.followChoices[p] === null);
      if (undecided !== undefined) {
        const choice = chooseFollow({
          hand: g.state.players[undecided].hand,
          declaredGame: g.state.declaredGame!,
        });
        g.follow(undecided, choice);
      } else if (g.state.caller === null) {
        g.continueWithoutCall();
      }
    } else if (phase === 'KONTRA_DECLARING') {
      const exp = g.expectedKontraPlayerPublic();
      if (exp !== null) {
        const levelMap: Record<string, number> = {
          null: 0, 'KONTRA': 1, 'REKONTRA': 2, 'SUBKONTRA': 3, 'MORTKONTRA': 4,
        };
        const cur = levelMap[g.state.kontraLevel ?? 'null'] ?? 0;
        const action = chooseKontra({
          hand: g.state.players[exp].hand,
          trump: g.state.trump,
          currentLevel: cur,
        });
        if (action === 'KONTRA') {
          const nextLevel = ({ null: 'KONTRA', 'KONTRA': 'REKONTRA', 'REKONTRA': 'SUBKONTRA', 'SUBKONTRA': 'MORTKONTRA' } as Record<string, any>)[g.state.kontraLevel ?? 'null'];
          g.kontra(exp, nextLevel);
        } else {
          g.moze(exp);
        }
      }
    } else if (phase === 'REFE') {
      // AI odlučuje da li koristiti refe
      const candidate = g.refeCandidate();
      if (candidate !== null) {
        const use = chooseUseRefe({
          hand: g.state.players[candidate].hand,
          refeCount: g.state.refeCount[candidate]!,
          refePerPlayer: 2,
        });
        if (use) g.useRefe(candidate);
        else g.skipRefe();
      } else {
        g.skipRefe();
      }
    } else if (phase === 'PLAYING') {
      const player = g.state.currentPlayer;
      const card = choosePlayCard({
        hand: g.state.players[player].hand,
        currentTrick: g.state.currentTrick,
        trump: g.state.trump,
        declaredGame: g.state.declaredGame!,
        winnerTricks: g.state.winner !== null ? g.state.players[g.state.winner].tricksWon : 0,
      });
      if (card) g.playCard(player, card.id);
      else break;
    }
    safety++;
  }
}

function reportRound(roundNum: number): { played: boolean; inHat: boolean; winnerGame?: string } {
  const phase = g.state.phase;
  const bulas = g.state.bulas;
  const tricksWon = g.state.players.map(p => p.tricksWon);
  const inHat = bulas.some(b => b < HAT_THRESHOLD);
  if (phase === 'GAME_OVER' && g.state.winner !== null && g.state.winnerGame !== null) {
    const winner = g.state.winner;
    const winnerGame = g.state.winnerGame;
    const declarerTricks = g.state.players[winner!].tricksWon;
    const passed = winnerGame.includes('Betl') ? declarerTricks === 0 : declarerTricks >= 6;
    if (!statsByGame[winnerGame]) statsByGame[winnerGame] = { won: 0, lost: 0 };
    if (passed) statsByGame[winnerGame].won++;
    else statsByGame[winnerGame].lost++;
    const result = `${winnerGame} (${passed ? '✓' : '✗'}) by P${winner} (${declarerTricks} štihova)`;
    console.log(`R${roundNum.toString().padStart(3)} [D:P${g.state.dealer}] | ${result.padEnd(38)} | Bule: ${bulas[0].toString().padStart(4)}/${bulas[1].toString().padStart(4)}/${bulas[2].toString().padStart(4)} | Štihovi: ${tricksWon.join(',')}`);
    return { played: true, inHat, winnerGame };
  } else if (phase === 'REFE') {
    totalRefe++;
    console.log(`R${roundNum.toString().padStart(3)} [D:P${g.state.dealer}] | REFE${' '.repeat(33)} | Bule: ${bulas[0].toString().padStart(4)}/${bulas[1].toString().padStart(4)}/${bulas[2].toString().padStart(4)}`);
    return { played: false, inHat };
  }
  // GAME_OVER bez winner = REFE završio partiju (refeExhausted)
  if (phase === 'GAME_OVER') {
    console.log(`R${roundNum.toString().padStart(3)} [D:P${g.state.dealer}] | REFE iscrpljen${' '.repeat(28)} | Bule: ${bulas[0].toString().padStart(4)}/${bulas[1].toString().padStart(4)}/${bulas[2].toString().padStart(4)}`);
    return { played: false, inHat };
  }
  return { played: false, inHat };
}

// Igraj runde dok god niko nije u šeširu
let round = 0;
while (round < MAX_ROUNDS) {
  round++;
  const dealer = (round - 1) % 3;
  playOneRound(dealer);
  const result = reportRound(round);
  if (result.played) totalPlayed++;
  if (result.inHat) {
    console.log(`\n⚠️  KRAJ PARTIJE u rundi ${round} — neko u šeširu!`);
    break;
  }
}

totalRounds = round;
console.log(`\n=== STATISTIKA ===`);
console.log(`Ukupno rundi: ${totalRounds}`);
console.log(`Odigrano partija (winner): ${totalPlayed}`);
console.log(`REFE: ${totalRefe}`);
console.log(`Po igrama:`);
for (const [game, s] of Object.entries(statsByGame).sort()) {
  console.log(`  ${game.padEnd(12)} ✓${s.won} ✗${s.lost}`);
}

// Final writeOff
const writeOffResult = g.writeOff();
console.log(`\n=== WRITE-OFF (kraj partije) ===`);
console.log(`Bule pre otpisa: ${g.state.bulas.join(', ')} (ukupno ${g.state.bulas.reduce((a, b) => a + b, 0)})`);
console.log(`Otpis:           ${writeOffResult.writeOff.join(', ')}`);
console.log(`Finalne bule:    ${writeOffResult.finalBule.join(', ')} (suma ${writeOffResult.finalBule.reduce((a, b) => a + b, 0)})`);
const minFinal = Math.min(...writeOffResult.finalBule);
if (minFinal < 0) {
  console.log(`ℹ️  Najgori igrač (P${writeOffResult.finalBule.indexOf(minFinal)}) je u minusu (-${Math.abs(minFinal)}) — to je ispravno po RULES.md`);
}
const maxFinal = Math.max(...writeOffResult.finalBule);
console.log(`\nPobednik: P${writeOffResult.finalBule.indexOf(maxFinal)} (${maxFinal} bule)`);