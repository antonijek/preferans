// Testovi za Monte Carlo determinizacionu pretragu (aiSearch.ts) — vidi
// plan "toasty-rolling-sparkle" (2026-09-05).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { makeCard } from '../src/cards.ts';
import { computeVoidSuits, determinize, autoPlayToHandEnd } from '../src/aiSearch.ts';
import type { GameState, Position } from '../src/types.ts';

// Deterministicki RNG za testove (isti LCG kao deal.test.ts).
function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function baseState(): GameState {
  return new Game({ seed: 1 }).state;
}

test('computeVoidSuits: igrac koji ne prati boju je prazan u toj boji', () => {
  const s = baseState();
  s.trump = '♠';
  s.tricks = [
    [
      { player: 0 as Position, card: makeCard('♥', 'A') },
      { player: 1 as Position, card: makeCard('♦', '7') }, // ne prati Herc, ne udara Pikom -> prazan i u Herc i u Pik
      { player: 2 as Position, card: makeCard('♥', 'K') },
    ],
  ];
  const voidSuits = computeVoidSuits(s);
  assert.ok(voidSuits[1].has('♥'), 'igrac 1 nije pratio Herc -> prazan u Herc');
  assert.ok(voidSuits[1].has('♠'), 'igrac 1 nije udario ni adutom -> prazan i u adutu');
  assert.ok(!voidSuits[0].has('♥'), 'igrac 0 je vodio Herc, nije prazan u njemu');
  assert.ok(!voidSuits[2].has('♥'), 'igrac 2 je pratio Herc, nije prazan u njemu');
});

test('computeVoidSuits: igrac koji udari adutom NIJE prazan u adutu, samo u vodjenoj boji', () => {
  const s = baseState();
  s.trump = '♠';
  s.tricks = [
    [
      { player: 0 as Position, card: makeCard('♥', 'A') },
      { player: 1 as Position, card: makeCard('♠', '7') }, // ne prati Herc, ALI udara adutom
      { player: 2 as Position, card: makeCard('♥', 'K') },
    ],
  ];
  const voidSuits = computeVoidSuits(s);
  assert.ok(voidSuits[1].has('♥'));
  assert.ok(!voidSuits[1].has('♠'), 'udario je adutom -> NIJE prazan u adutu');
});

test('determinize: sopstvena ruka se nikad ne dira, velicine tudjih ruku ostaju tacne', () => {
  const game = new Game({ seed: 7 });
  game.newHand(0);
  const rng = makeRng(42);
  for (let i = 0; i < 50; i++) {
    const sampled = determinize(game.state, 0 as Position, rng);
    assert.deepEqual(
      sampled.players[0]!.hand.map((c) => c.id).sort(),
      game.state.players[0]!.hand.map((c) => c.id).sort(),
      'moja ruka se ne sme menjati',
    );
    assert.equal(sampled.players[1]!.hand.length, game.state.players[1]!.hand.length);
    assert.equal(sampled.players[2]!.hand.length, game.state.players[2]!.hand.length);
  }
});

test('determinize: uzorak rekonstruise pun spil bez duplikata (32 karte)', () => {
  const game = new Game({ seed: 11 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const rng = makeRng(99);
  for (let i = 0; i < 50; i++) {
    const sampled = determinize(game.state, 1 as Position, rng);
    const all = [
      ...sampled.players[0]!.hand,
      ...sampled.players[1]!.hand,
      ...sampled.players[2]!.hand,
      ...sampled.talon,
    ];
    assert.equal(all.length, 32, `iteracija ${i}: ukupno karata mora biti 32`);
    const ids = new Set(all.map((c) => c.id));
    assert.equal(ids.size, 32, `iteracija ${i}: sve karte moraju biti razlicite`);
  }
});

test('determinize: dokazano prazan igrac nikad ne dobije tu boju u uzorku', () => {
  const game = new Game({ seed: 21 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  // Namerno NE Pik — "Pik bez kontre" (RULES 7.1.1) redealuje/dodeljuje refu
  // umesto da predje u PLAYING, sto ovom testu ne treba.
  game.declareGame(1, 'Karo');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  // Rucno konstruisi JEDAN stih uzimajuci STVARNE karte iz stvarnih ruku
  // (uklanjajuci ih odatle) da ukupan spil ostane konzistentan (32 karte
  // rasporedjene medju rukama+stihom+odbacajem) — determinize() to strogo
  // proverava. Igrac 2 (Zapad) "igra" kartu koja NIJE ni vodjena boja ni
  // adut, sto ga cini dokazano praznim u obe.
  const trumpSuit = game.state.trump!; // Karo -> '♦'
  // Vodjena boja mora biti nesto sto i Istok STVARNO drzi, da Istok ostane
  // NE-prazan (samo Zapad treba da ispadne dokazano prazan ovde).
  const jugSuits = new Set(game.state.players[0]!.hand.map((c) => c.suit));
  const istokMatch = game.state.players[1]!.hand.find((c) => jugSuits.has(c.suit))!;
  assert.ok(istokMatch, 'test pretpostavlja zajednicku boju izmedju Juga i Istoka');
  const leadCard = game.state.players[0]!.hand.find((c) => c.suit === istokMatch.suit)!;
  game.state.players[0]!.hand = game.state.players[0]!.hand.filter((c) => c.id !== leadCard.id);
  const zapadOffCard = game.state.players[2]!.hand.find(
    (c) => c.suit !== leadCard.suit && c.suit !== trumpSuit,
  )!;
  assert.ok(zapadOffCard, 'test pretpostavlja da Zapad ima bar jednu kartu van vodjene boje i aduta');
  game.state.players[2]!.hand = game.state.players[2]!.hand.filter((c) => c.id !== zapadOffCard.id);
  const istokCard = istokMatch; // Istok prati vodjenu boju -> ostaje NE-prazan
  game.state.players[1]!.hand = game.state.players[1]!.hand.filter((c) => c.id !== istokCard.id);
  game.state.tricks = [
    [
      { player: 0 as Position, card: leadCard },
      { player: 2 as Position, card: zapadOffCard },
      { player: 1 as Position, card: istokCard },
    ],
  ];

  const rng = makeRng(123);
  for (let i = 0; i < 100; i++) {
    // Perspektiva 0 (Jug) — 2 (Zapad) je jedan od dva skrivena protivnika.
    const sampled = determinize(game.state, 0 as Position, rng);
    const zapadHand = sampled.players[2]!.hand;
    assert.ok(
      zapadHand.every((c) => c.suit !== leadCard.suit && c.suit !== trumpSuit),
      `iteracija ${i}: Zapad je dokazano prazan u vodjenoj boji i adutu, ne sme ih dobiti u uzorku`,
    );
  }
});

test('determinize: lastTalon karte se nikad ne uzorkuju u pogresnog pratioca', () => {
  const game = new Game({ seed: 33 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  // lastTalon je sad popunjen (2 karte koje su bile u talonu).
  assert.equal(game.state.lastTalon.length, 2);
  const talonIds = new Set(game.state.lastTalon.map((c) => c.id));

  const rng = makeRng(77);
  for (let i = 0; i < 100; i++) {
    // Perspektiva 2 (Zapad, drugi pratilac) — talon karte NIKAD ne smeju
    // zavrsiti u ruci igraca 0 (Jug, TAKODJE pratilac) u ovom uzorku.
    const sampled = determinize(game.state, 2 as Position, rng);
    const jugHand = sampled.players[0]!.hand;
    for (const c of jugHand) {
      assert.ok(!talonIds.has(c.id), `iteracija ${i}: talon karta ${c.id} ne sme biti kod DRUGOG pratioca`);
    }
  }
});

test('autoPlayToHandEnd: odigrava celu ruku do kraja preko mnogo seed-ova bez greske', () => {
  const rng = makeRng(555);
  let scored = 0;
  let unscored = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const game = new Game({ seed });
    game.newHand(0);
    const ok = autoPlayToHandEnd(game, rng);
    if (ok) {
      scored++;
      assert.ok(
        game.state.phase === 'GAME_OVER' || game.state.phase === 'MATCH_OVER',
        `seed ${seed}: obracunata ruka mora zavrsiti u GAME_OVER/MATCH_OVER`,
      );
      assert.ok(game.state.lastHandResult !== null, `seed ${seed}: obracunata ruka mora imati lastHandResult`);
    } else {
      unscored++;
    }
  }
  // Ne tvrdimo tacan broj (zavisi od nasumicnih deljenja), samo da mehanizam
  // radi konzistentno na velikom uzorku i da SVAKI slucaj zavrsi u jednom
  // od dva ocekivana ishoda (ni jedan test-run ne baca gresku/visi).
  assert.equal(scored + unscored, 100);
});
