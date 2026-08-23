// CLI za igranje jedne Preferans partije u terminalu
// Pokretanje: cd engine && npm run play

import { Game } from '../engine/src/game.ts';
import { POS_LABELS } from '../engine/src/game.ts';
import { cardToString } from '../engine/src/cards.ts';
import type { Game as GameT, Position, GameState } from '../engine/src/types.ts';
import { GAME_VALUES, STANDARD_GAMES } from '../engine/src/constants.ts';

const SUIT_NAMES: Record<string, string> = { '♠': 'Pik', '♥': 'Herc', '♦': 'Karo', '♣': 'Tref' };
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function fmt(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit}`;
}

function printState(game: Game, label = ''): void {
  const s = game.state;
  console.log(`\n=== ${label || 'Stanje'} | Runda ${s.round} | Faza: ${s.phase} ===`);
  console.log(`Bule: [${s.bulas.join(', ')}]  Refe: [${s.refeCount.join(', ')}]`);
  for (let i = 0; i < 3; i++) {
    const p = s.players[i]!;
    console.log(`${POS_LABELS[i]}: [${p.hand.map(fmt).join(' ')}] (tricks:${p.tricksWon})`);
  }
  if (s.declaredGame) console.log(`Proglašena igra: ${s.declaredGame} (vrednost ${GAME_VALUES[s.declaredGame]})`);
  if (s.kontraLevel) console.log(`Kontra: ${s.kontraLevel}`);
  if (s.talon.length > 0) console.log(`Talon: [${s.talon.map(fmt).join(' ')}]`);
}

function rankValue(r: string): number {
  return RANK_ORDER.indexOf(r);
}

// AI bidding heuristika
function aiBid(player: Position, state: GameState): { type: 'pass' } | { type: 'bid'; value: number } {
  const hand = state.players[player]!.hand;
  // Nađi najdužu boju
  const suits = ['♠', '♥', '♦', '♣'];
  let bestSuit = suits[0]!;
  let bestCount = 0;
  let bestHigh = 0;
  for (const s of suits) {
    const cards = hand.filter(c => c.suit === s);
    const high = cards.reduce((max, c) => Math.max(max, rankValue(c.rank)), 0);
    if (cards.length > bestCount || (cards.length === bestCount && high > bestHigh)) {
      bestCount = cards.length;
      bestSuit = s;
      bestHigh = high;
    }
  }
  if (bestCount < 4) return { type: 'pass' };
  // Igra vrednost prema boji
  const value = bestSuit === '♠' ? 2 : bestSuit === '♦' ? 3 : bestSuit === '♥' ? 4 : 5;
  // Ako već ima bid veći, ne možemo ništa
  if (value <= state.currentBid) {
    // Pokušaj veću ako možemo
    for (let v = value + 1; v <= 7; v++) {
      if (v > state.currentBid && v <= 7) {
        return { type: 'bid', value: v };
      }
    }
    return { type: 'pass' };
  }
  return { type: 'bid', value: value };
}

// AI bira igru
function aiChooseGame(player: Position, contract: number, hand: import('../engine/src/types.ts').Card[]): GameT {
  // Nađi najdužu boju, ako je 5+ igraj tu
  const suits = ['♠', '♥', '♦', '♣'];
  let bestSuit: string | null = null;
  let bestCount = 0;
  for (const s of suits) {
    const count = hand.filter(c => c.suit === s).length;
    if (count > bestCount) {
      bestCount = count;
      bestSuit = s;
    }
  }
  const suitMap: Record<string, GameT> = {
    '♠': 'Pik',
    '♥': 'Herc',
    '♦': 'Karo',
    '♣': 'Tref',
  };
  // Probaj standardnu igru najduže boje
  if (bestSuit && bestCount >= 4) {
    const candidate = suitMap[bestSuit]!;
    if (GAME_VALUES[candidate] >= contract) return candidate;
  }
  // Inače biraj prvu igru >= contract
  for (const g of STANDARD_GAMES) {
    if (GAME_VALUES[g] >= contract) return g;
  }
  return 'Pik';
}

// AI bira 2 karte za discard (najslabije)
function aiChooseDiscards(player: Position, hand: import('../engine/src/types.ts').Card[]): [string, string] {
  // Izbaci 2 najslabije karte koje NISU adut
  const trump = ''; // ne znamo još
  const sorted = hand.slice().sort((a, b) => {
    // Prioritet: van aduta, pa najslabija
    return rankValue(a.rank) - rankValue(b.rank);
  });
  return [sorted[0]!.id, sorted[1]!.id];
}

// AI igra kartu (najslabija legalna)
function aiPlayCard(player: Position, legal: import('../engine/src/types.ts').Card[]): string {
  const sorted = legal.slice().sort((a, b) => {
    const aVal = rankValue(a.rank);
    const bVal = rankValue(b.rank);
    return aVal - bVal;
  });
  return sorted[0]!.id;
}

async function main(): Promise<void> {
  console.log('=== PREFERANS CLI ===\n');
  const game = new Game({ seed: Date.now() & 0xffff });
  game.newHand(0);

  // 1. LICITACIJA
  console.log('--- LICITACIJA ---');
  while (game.state.phase === 'BIDDING') {
    const player = game.state.currentBidder;
    const decision = aiBid(player, game.state);
    if (decision.type === 'pass') {
      console.log(`${POS_LABELS[player]}: dalje`);
      game.pass(player);
    } else {
      console.log(`${POS_LABELS[player]}: ${decision.value}`);
      game.bid(player, decision.value);
    }
    if (game.state.phase === 'GAME_OVER') {
      console.log('\nSvi su rekli dalje.');
      return;
    }
    if (game.state.phase === 'REFE') {
      console.log('\nRefe!');
      return;
    }
  }

  // 2. DISCARDING ili Igra
  if (game.state.phase === 'DISCARDING' && game.state.winner !== null) {
    const winner = game.state.winner;
    const hand = game.state.players[winner]!.hand;
    const [id1, id2] = aiChooseDiscards(winner, hand);
    console.log(`\n--- DISCARDING ---`);
    console.log(`${POS_LABELS[winner]} baci: ${fmt(hand.find(c => c.id === id1)!)} i ${fmt(hand.find(c => c.id === id2)!)}`);
    game.discard(winner, [id1, id2]);
  }

  // 3. DECLARING
  if (game.state.phase === 'DECLARING' && game.state.winner !== null) {
    const winner = game.state.winner;
    const hand = game.state.players[winner]!.hand;
    const chosen = aiChooseGame(winner, game.state.currentBid, hand);
    console.log(`\n--- DECLARING ---`);
    console.log(`${POS_LABELS[winner]}: Igra ${chosen}`);
    game.declareGame(winner, chosen);
  }

  // 4. FOLLOW_DECLARING
  if (game.state.phase === 'FOLLOW_DECLARING') {
    console.log(`\n--- FOLLOW_DECLARING ---`);
    for (let i = 0; i < 3; i++) {
      if (i === game.state.winner) continue;
      game.follow(i as Position, 'DODJEM');
      console.log(`${POS_LABELS[i]}: Dodjem`);
    }
  }

  // 5. KONTRA_DECLARING (opciono)
  if (game.state.phase === 'KONTRA_DECLARING') {
    console.log(`\n--- KONTRA_DECLARING ---`);
    // Svi kažu Moze (nema kontre u ovom demo)
    for (let i = 0; i < 3; i++) {
      if (i === game.state.winner) continue;
      game.moze(i as Position);
      console.log(`${POS_LABELS[i]}: Moze`);
    }
  }

  // 6. PLAYING
  if (game.state.phase === 'PLAYING') {
    printState(game, 'PARTIJA');
    while (game.state.phase === 'PLAYING') {
      const player = game.state.currentPlayer;
      const legal = game.getLegalCards(player);
      if (legal.length === 0) {
        console.log(`${POS_LABELS[player]}: nema legalnih karata`);
        break;
      }
      const cardId = aiPlayCard(player, legal);
      const card = legal.find(c => c.id === cardId)!;
      const ok = game.playCard(player, cardId);
      if (!ok) {
        console.log(`${POS_LABELS[player]}: GREŠKA ${cardId}`);
        break;
      }
      console.log(`${POS_LABELS[player]}: ${cardToString(card)}`);
      if (game.state.currentTrick.length === 0 && game.state.tricks.length > 0) {
        const last = game.state.tricks[game.state.tricks.length - 1]!;
        console.log(`  → štih osvojio ${POS_LABELS[last[0]!.player]}`);
      }
    }
  }

  // 7. REZULTAT
  console.log('\n=== REZULTAT ===');
  const totalBule = game.state.bulas[0] + game.state.bulas[1] + game.state.bulas[2];
  console.log(`Bule: [${game.state.bulas.join(', ')}] (zbir: ${totalBule})`);
  console.log(`Štihovi: [${game.state.players.map(p => p.tricksWon).join(', ')}]`);
  console.log(`Proglašena igra: ${game.state.declaredGame}`);
  console.log(`Kontra nivo: ${game.state.kontraLevel ?? 'nema'}`);
}

main().catch(err => { console.error(err); process.exit(1); });
