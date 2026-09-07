// Testovi za Monte Carlo determinizacionu pretragu (aiSearch.ts) — vidi
// plan "toasty-rolling-sparkle" (2026-09-05).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { makeCard } from '../src/cards.ts';
import { computeVoidSuits, determinize, autoPlayToHandEnd, searchChooseAction } from '../src/aiSearch.ts';
import { makeDeck, shuffle as shuffleDeck } from '../src/deck.ts';
import { applyHeuristicTurn } from '../src/aiAutoplay.ts';
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

test('determinize: stres — hiljade poziva kroz CELE odigrane ruke (uzivo prijavljen bag 2026-09-05: pohlepno nasumicno uzorkovanje je "zaglavilo" u kasnoj PLAYING fazi posle 25 pokusaja; zamenjeno backtracking-om)', () => {
  const rng = makeRng(2026);
  let totalCalls = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const game = new Game({ seed });
    game.newHand(0);
    let steps = 0;
    while (steps++ < 80) {
      const phase = game.state.phase;
      if (phase === 'GAME_OVER' || phase === 'MATCH_OVER') break;
      // Na SVAKOM koraku, za SVE TRI perspektive, pozovi determinize —
      // ovo namerno udara i na kasne, jako ogranicene PLAYING trenutke
      // (malo preostalih karata + mnogo akumuliranih void-ogranicenja),
      // tacno onaj scenario koji je prijavljen kao bag.
      for (const perspective of [0, 1, 2] as Position[]) {
        determinize(game.state, perspective, rng); // baca ako ne uspe — test bi tada pao
        totalCalls++;
      }
      const result = applyHeuristicTurn(game);
      if (result === 'no_actor') break;
    }
  }
  assert.ok(totalCalls > 1000, `ocekivano mnogo poziva radi stvarnog stresa, dobijeno ${totalCalls}`);
  console.log(`  (stres test: ${totalCalls} determinize() poziva, nijedan nije bacio gresku)`);
});

// === searchChooseAction — BIDDING (Faza 3: korisnikov zahtev 2026-09-02:
// "licitirao je AI a nije analizirao koliko stihova moze da ima" — ovo
// dokazuje da nova pretraga STVARNO razlikuje ruku koja ne moze da napravi
// 6 stihova (REQUIRED_TRICKS je 6 za SVE standardne igre, constants.ts) od
// ruke koja moze, umesto fiksnog praga "4+ karte u boji". ===

// Deljenje 2 -> firstBidder = nextPlayer(2) = 0 (isto sto i newHand(2)).
function biddingFixture(myHand: ReturnType<typeof makeDeck>, rng: () => number): Game {
  const game = new Game({ seed: 999 });
  game.newHand(2);
  const myIds = new Set(myHand.map((c) => c.id));
  const rest = shuffleDeck(makeDeck().filter((c) => !myIds.has(c.id)), rng);
  game.state.players[0]!.hand = myHand.slice();
  game.state.players[1]!.hand = rest.slice(0, 10);
  game.state.players[2]!.hand = rest.slice(10, 20);
  game.state.talon = rest.slice(20, 22);
  assert.equal(game.state.currentBidder, 0, 'fixture pretpostavka: igrac 0 licitira prvi');
  return game;
}

test('searchChooseAction (BIDDING): slaba ruka bez sigurnih stihova -> DALJE', () => {
  const rng = makeRng(555);
  // 10 najslabijih karata BI bila i savrsena Betl prilika (0 visokih) — dva
  // Herc-a su namerno visoka BEZ ijedne niske podrske u toj boji (D,J, 0
  // karata 7-10) da ruka ostane genuinski bezvredna i van Betl dometa (vidi
  // isSuitBetlSafe: bez asa treba niske >= visoke, ovde 0 niskih < 2 visoke).
  const myHand = [
    makeCard('♠', '7'), makeCard('♠', '8'), makeCard('♠', '9'),
    makeCard('♥', 'Q'), makeCard('♥', 'J'),
    makeCard('♦', '7'), makeCard('♦', '8'), makeCard('♦', '9'),
    makeCard('♣', '7'), makeCard('♣', '8'),
  ];
  const game = biddingFixture(myHand, rng);
  const action = searchChooseAction(game.state, 0 as Position, 25, rng);
  assert.equal(action.type, 'pass', `ocekivano DALJE za bezvrednu ruku, dobijeno ${JSON.stringify(action)}`);
});

test('searchChooseAction (BIDDING): jaka ruka sa realnim adutskim izvlacenjem (Tref A,K,J,10 + Herc A,K,10) -> BID, ne DALJE', () => {
  // NAPOMENA: raniji test ovde je koristio ruku koja drzi SVA 4 asa (7 pikova
  // A-K-Q-J.. + 3 preostala asa) i ocekivao BID — ali korisnikova uzivo
  // kalibracija (2026-09-06) je pokazala da bas TAKVA, EKSTREMNO dominantna
  // ruka realno cesto ispravno bira DALJE: kad je toliko jaka da su OBA
  // protivnika garantovano jako slaba, cekanje da neko od njih bude
  // prisiljen da postane bespomocni nosilac (pa ih se obara na odbrani, ili
  // se "Pik bez kontre" ponisti bez rizika) moze doneti VECI ocekivani
  // rezultat nego samo-prijavljivanje. To NIJE bag — to je bas ono sto
  // pretraga treba da otkrije umesto fiksne heuristike. Ovaj test sada
  // koristi Ruku 11 iz uzivo kalibracije (♠7 · ♥A,K,10 · ♦K,10 · ♣A,K,J,10),
  // gde je korisnik eksplicitno potvrdio BID (racunato: Tref puna duzina=4 +
  // Herc sporedna boja posle izvlacenja=2 → 6 stihova) BEZ te "cekaj i obori"
  // dinamike, jer protivnici ovde NISU garantovano bespomocni.
  const rng = makeRng(2026);
  const myHand = [
    makeCard('♠', '7'),
    makeCard('♥', 'A'), makeCard('♥', 'K'), makeCard('♥', '10'),
    makeCard('♦', 'K'), makeCard('♦', '10'),
    makeCard('♣', 'A'), makeCard('♣', 'K'), makeCard('♣', 'J'), makeCard('♣', '10'),
  ];
  const game = biddingFixture(myHand, rng);
  const action = searchChooseAction(game.state, 0 as Position, 40, rng);
  assert.notEqual(action.type, 'pass', `ocekivano BID/IGRA, dobijeno ${JSON.stringify(action)}`);
});
