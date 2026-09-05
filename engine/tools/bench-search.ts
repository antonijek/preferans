// Meri stvarnu cenu (ms) building-blokova Monte Carlo pretrage na OVOJ
// masini, da se broj uzoraka po odluci bira na osnovu stvarnih brojki, ne
// nagadjanja — vidi plan "toasty-rolling-sparkle" (2026-09-05), Faza 0.
// Pokretanje: cd D:\preferans\engine && node --import tsx tools/bench-search.ts

import { Game } from '../src/game.js';
import { determinize, autoPlayToHandEnd } from '../src/aiSearch.js';
import type { Position } from '../src/types.js';

function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function time(label: string, iterations: number, fn: () => void): void {
  // Zagrevanje (JIT) pre merenja.
  for (let i = 0; i < Math.min(20, iterations); i++) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();
  const totalMs = Number(end - start) / 1e6;
  console.log(`${label}: ${(totalMs / iterations).toFixed(4)}ms/poziv (${iterations} poziva, ukupno ${totalMs.toFixed(1)}ms)`);
}

console.log('=== bench-search: cena building-blokova Monte Carlo pretrage ===\n');

// --- 1. structuredClone ---
const seedGame = new Game({ seed: 1 });
seedGame.newHand(0);
time('structuredClone(state)', 2000, () => {
  structuredClone(seedGame.state);
});

// --- 2. determinize() iz sredine ruke (posle bidding-a, pre igranja) ---
{
  const g = new Game({ seed: 2 });
  g.newHand(0);
  g.bid(1, 2); g.pass(2); g.pass(0);
  const hand = g.state.players[1]!.hand;
  g.discard(1, [hand[0]!.id, hand[1]!.id]);
  g.declareGame(1, 'Karo');
  g.follow(0, 'DODJEM'); g.follow(2, 'DODJEM');
  g.moze(0); g.moze(2);
  const rng = makeRng(10);
  time('determinize() (perspektiva pratioca, PLAYING pocetak)', 2000, () => {
    determinize(g.state, 0 as Position, rng);
  });
}

// --- 3. autoPlayToHandEnd() od sredine ruke (PLAYING pocetak) — najkraci rollout ---
{
  const rng = makeRng(20);
  time('autoPlayToHandEnd() od PLAYING pocetka', 200, () => {
    const g = new Game({ seed: Math.floor(rng() * 1e9) });
    g.newHand(0);
    g.bid(1, 2); g.pass(2); g.pass(0);
    const hand = g.state.players[1]!.hand;
    g.discard(1, [hand[0]!.id, hand[1]!.id]);
    g.declareGame(1, 'Karo');
    g.follow(0, 'DODJEM'); g.follow(2, 'DODJEM');
    g.moze(0); g.moze(2);
    autoPlayToHandEnd(g, rng);
  });
}

// --- 4. autoPlayToHandEnd() od SAMOG POCETKA (najduzi mogaci rollout — BIDDING) ---
{
  const rng = makeRng(30);
  time('autoPlayToHandEnd() od pocetka BIDDING-a (najduzi slucaj)', 200, () => {
    const g = new Game({ seed: Math.floor(rng() * 1e9) });
    g.newHand(0);
    autoPlayToHandEnd(g, rng);
  });
}

console.log('\n=== Projekcija za jednu PLAYING odluku (2-5 kandidata x N uzoraka) ===');
{
  const rng = makeRng(40);
  const g = new Game({ seed: 3 });
  g.newHand(0);
  g.bid(1, 2); g.pass(2); g.pass(0);
  const hand = g.state.players[1]!.hand;
  g.discard(1, [hand[0]!.id, hand[1]!.id]);
  g.declareGame(1, 'Karo');
  g.follow(0, 'DODJEM'); g.follow(2, 'DODJEM');
  g.moze(0); g.moze(2);

  const start = process.hrtime.bigint();
  const SAMPLES = 100;
  for (let i = 0; i < SAMPLES; i++) {
    const sampled = determinize(g.state, 0 as Position, rng);
    const gg = new Game();
    gg.state = sampled;
    autoPlayToHandEnd(gg, rng);
  }
  const end = process.hrtime.bigint();
  const perSample = Number(end - start) / 1e6 / SAMPLES;
  console.log(`1 uzorak (determinize + rollout): ${perSample.toFixed(4)}ms`);
  for (const [candidates, samples] of [[2, 60], [5, 150], [66, 150]] as const) {
    const total = candidates * samples * perSample;
    console.log(`  ${candidates} kandidata x ${samples} uzoraka = ${(candidates * samples)} rollout-a -> ~${total.toFixed(0)}ms`);
  }
}
