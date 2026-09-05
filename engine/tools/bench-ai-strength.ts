// Objektivno meri da li je search-based AI (aiSearch.ts) STVARNO bolji od
// stare heuristike (ai.ts), umesto da se veruje na rec. Simulira mnogo
// punih ruka gde JEDNO sediste bira karte preko searchChoosePlayCard(),
// ostala dva preko obicne heuristike (aiAutoplay.ts), i poredi prosecan
// rezultat po ruci. Rotira koje sediste dobija search AI da otkaze
// pozicionu prednost (ko licitira prvi itd.).
// Pokretanje: cd D:\preferans\engine && node --import tsx tools/bench-ai-strength.ts [broj-ruka] [uzoraka]

import { Game } from '../src/game.js';
import { applyHeuristicTurn } from '../src/aiAutoplay.js';
import { searchChoosePlayCard } from '../src/aiSearch.js';
import type { Position } from '../src/types.js';

function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const HANDS = parseInt(process.argv[2] || '600', 10);
const SAMPLES = parseInt(process.argv[3] || '100', 10);

function playOneHand(searchSeat: Position, seed: number, rng: () => number): { reward: number } | null {
  const g = new Game({ seed });
  g.newHand(0);
  const preHandBula = g.state.bulas[searchSeat];
  let steps = 0;
  while (steps++ < 80) {
    const phase = g.state.phase;
    if (phase === 'GAME_OVER' || phase === 'MATCH_OVER') {
      if (g.state.lastHandResult === null) return null; // ponisteno/neobracunato
      const r = g.state.lastHandResult;
      return { reward: -(r.bulas[searchSeat] - preHandBula) + r.supeDelta[searchSeat] };
    }
    if (phase === 'PLAYING' && g.state.currentPlayer === searchSeat) {
      const legal = g.getLegalCards(searchSeat);
      if (legal.length > 1) {
        const card = searchChoosePlayCard(g.state, searchSeat, SAMPLES, rng);
        g.playCard(searchSeat, card.id);
        continue;
      }
    }
    const result = applyHeuristicTurn(g);
    if (result === 'no_actor') return null;
  }
  return null;
}

console.log(`=== bench-ai-strength: search AI (PLAYING) vs heuristika, ${HANDS} ruka, ${SAMPLES} uzoraka/odluka ===\n`);

const rng = makeRng(2026);
const totals: [number, number, number] = [0, 0, 0];
const counts: [number, number, number] = [0, 0, 0];
const start = Date.now();

for (let i = 0; i < HANDS; i++) {
  const searchSeat = (i % 3) as Position; // rotira poziciju da otkaze prednost
  const seed = Math.floor(rng() * 1e9);
  const result = playOneHand(searchSeat, seed, rng);
  if (result === null) continue; // ponistena ruka — ne racuna se ni za koga
  totals[searchSeat] += result.reward;
  counts[searchSeat]++;
  if ((i + 1) % 100 === 0) {
    console.log(`  ...${i + 1}/${HANDS} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  }
}

console.log('\n=== Rezultat (prosecna nagrada po ruci kad je TO sediste imalo search AI) ===');
const POS = ['Jug', 'Istok', 'Zapad'];
let sumAvg = 0;
for (let s = 0; s < 3; s++) {
  const avg = counts[s]! > 0 ? totals[s]! / counts[s]! : 0;
  console.log(`  ${POS[s]}: ${avg.toFixed(3)} (preko ${counts[s]} ruka)`);
  sumAvg += avg;
}
console.log(`\nProsek preko sve tri pozicije: ${(sumAvg / 3).toFixed(3)}`);
console.log('(Baseline heuristika-protiv-heuristike bi trebalo da bude ~0 u proseku — pozitivno ovde znaci da search AI stvarno igra bolje.)');
console.log(`Ukupno vreme: ${((Date.now() - start) / 1000).toFixed(1)}s`);
