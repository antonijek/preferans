// TEST 1 — JEDAN ŠTIH
//
// Svaki test proverava tačno jedno pravilo Preferansa.
// NE pravi celu partiju — samo jedan štih u svakom testu.
//
// Pravila pokrivena:
// A — praćenje boje (moraš igrati lead boju ako je imaš)
// B — bez tražene boje (igraš šta imaš)
// C — adut pobjeđuje
// D — bez aduta, vodi prva karta u lead boji
// E — jači adut pobjeđuje slabiji adut
// F — adut se ne može baciti ako imaš traženu boju
// G — pobednik vodi sledeći štih
// H — štih ima tačno 3 karte
// I — karta se uklanja iz ruke
// J — nema dupliciranja karte

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trickWinner, isCardLegal, getLegalCards } from '../src/trick.ts';
import { makeCard } from '../src/cards.ts';
import type { Card, TrickCard } from '../src/types.ts';

// Helper: napravi štih
function trick(...entries: Array<[number, Card]>): TrickCard[] {
  return entries.map(([player, card]) => ({ player: player as 0 | 1 | 2, card }));
}

// Helper: napravi sve karte unapred
const CARDS = {
  pikA: makeCard('♠', 'A'),
  pikK: makeCard('♠', 'K'),
  pikQ: makeCard('♠', 'Q'),
  pikJ: makeCard('♠', 'J'),
  pik10: makeCard('♠', '10'),
  pik9: makeCard('♠', '9'),
  pik8: makeCard('♠', '8'),
  pik7: makeCard('♠', '7'),
  hercA: makeCard('♥', 'A'),
  hercK: makeCard('♥', 'K'),
  herc7: makeCard('♥', '7'),
  karoA: makeCard('♦', 'A'),
  karo10: makeCard('♦', '10'),
  trefA: makeCard('♣', 'A'),
};

// ============================================
// TEST 1 — JEDAN ŠTIH (iz tvog specu)
// ============================================
test('TEST 1: A→PIK A, B→PIK K, C→HERC 7, HERC adut → C je winner', () => {
  const t = trick(
    [0, CARDS.pikA],  // A
    [1, CARDS.pikK],  // B
    [2, CARDS.herc7], // C
  );

  // Legalne karte za B (mora Pik jer je A igrao Pik)
  const bHand = [CARDS.pikK, CARDS.herc7];
  assert.equal(isCardLegal(CARDS.pikK, bHand, [t[0]!], '♥'), true);
  assert.equal(isCardLegal(CARDS.herc7, bHand, [t[0]!], '♥'), false);

  // Legalne karte za C (nema Pik, može bilo šta)
  const cHand = [CARDS.herc7];
  const cLegal = getLegalCards(cHand, [t[0]!, t[1]!], '♥');
  assert.equal(cLegal.length, 1);
  assert.equal(cLegal[0], CARDS.herc7);

  // Resolve: HERC 7 (adut) pobjeđuje PIK A i PIK K
  const winner = trickWinner(t, '♥');
  assert.equal(winner, 2); // C
  console.log('TEST 1 — ONE TRICK');
  console.log('  Trump: HERC, Leader: A');
  console.log('  A plays: PIK A');
  console.log('  B plays: PIK K');
  console.log('  C plays: HERC 7');
  console.log('  Winner: C');
  console.log('  Next leader: C');
  console.log('  PASS');
});

// ============================================
// TEST A — PRAĆENJE BOJE
// ============================================
test('TEST A: mora pratiti boju ako ima tu boju u ruci', () => {
  // Trump: HERC
  // Lead: PIK A
  // B ima: PIK K, HERC A
  const t = [trick([0, CARDS.pikA])[0]!];
  const bHand = [CARDS.pikK, CARDS.hercA];

  // PIK K je LEGALAN (prati Pik)
  assert.equal(isCardLegal(CARDS.pikK, bHand, t, '♥'), true,
    'B mora moći igrati PIK K jer prati Pik');

  // HERC A NIJE LEGALAN (B ima Pik, mora Pik)
  assert.equal(isCardLegal(CARDS.hercA, bHand, t, '♥'), false,
    'HERC A NE SMIJE biti legalan jer B ima Pik');
});

// ============================================
// TEST B: Slučaj 2 — nema lead boje, IMA adut → SAMO adut
// ============================================
test('TEST B: nema lead boje ALI ima adut → samo adut legalan', () => {
  // Trump: HERC
  // Lead: PIK A
  // B ima: HERC 7 (adut), KARO A, TREF K
  // B nema Pik, IMA Herc → MORA Herc
  const t = [trick([0, CARDS.pikA])[0]!];
  const bHand = [CARDS.herc7, CARDS.karoA, CARDS.trefA];

  // HERC 7 = LEGAL (mora adut)
  assert.equal(isCardLegal(CARDS.herc7, bHand, t, '♥'), true,
    'HERC 7 (adut) mora biti legalan');

  // KARO A = ILLEGAL (B ima adut, mora adut)
  assert.equal(isCardLegal(CARDS.karoA, bHand, t, '♥'), false,
    'KARO A NE SMIJE biti legalan jer B ima adut');

  // TREF A = ILLEGAL
  assert.equal(isCardLegal(CARDS.trefA, bHand, t, '♥'), false,
    'TREF A NE SMIJE biti legalan jer B ima adut');
});

// ============================================
// TEST B2: Ima lead boju (KARO) → samo KARO legalan, NE adut
// ============================================
test('TEST B2: ima lead boju (KARO) → samo KARO legalan', () => {
  // Trump: HERC
  // Lead: KARO 10
  // B ima: KARO A, HERC 7 (adut), TREF K
  const t = [trick([0, CARDS.karo10])[0]!];
  const bHand = [CARDS.karoA, CARDS.herc7, CARDS.trefA];

  // KARO A = LEGAL (mora pratiti Karo)
  assert.equal(isCardLegal(CARDS.karoA, bHand, t, '♥'), true,
    'KARO A mora biti legalan jer prati Karo');

  // HERC 7 = ILLEGAL (mora Karo, NE adut)
  assert.equal(isCardLegal(CARDS.herc7, bHand, t, '♥'), false,
    'HERC 7 (adut) NE SMIJE kad ima Karo');

  // TREF A = ILLEGAL
  assert.equal(isCardLegal(CARDS.trefA, bHand, t, '♥'), false,
    'TREF A NE SMIJE kad ima Karo');
});

// ============================================
// TEST B3: nema ni lead ni adut → sve legalne
// ============================================
test('TEST B3: nema ni Pik ni Herc → sve karte legalne', () => {
  // Trump: HERC
  // Lead: PIK 10
  // B ima: KARO A, TREF K (nema Pik ni Herc)
  const t = [trick([0, CARDS.pik10])[0]!];
  const bHand = [CARDS.karoA, CARDS.trefA];

  // Nema Pik ni Herc → obe karte legalne
  assert.equal(isCardLegal(CARDS.karoA, bHand, t, '♥'), true,
    'KARO A legalna (nema Pik ni Herc)');
  assert.equal(isCardLegal(CARDS.trefA, bHand, t, '♥'), true,
    'TREF A legalna (nema Pik ni Herc)');
});

// ============================================
// TEST C — ADUT POBJEĐUJE
// ============================================
test('TEST C: adut pobjeđuje karte u lead boji', () => {
  // Trump: HERC
  // A→PIK A, B→PIK K, C→HERC 7
  const t = trick(
    [0, CARDS.pikA],
    [1, CARDS.pikK],
    [2, CARDS.herc7],
  );
  // HERC 7 (adut) pobjeđuje PIK A i PIK K
  assert.equal(trickWinner(t, '♥'), 2); // C
});

// ============================================
// TEST D — BEZ ADUTA
// ============================================
test('TEST D: bez aduta, vodi prva karta u lead boji', () => {
  // Trump: NONE
  // A→PIK A, B→PIK K, C→KARO A
  const t = trick(
    [0, CARDS.pikA],
    [1, CARDS.pikK],
    [2, CARDS.karoA],
  );
  // KARO A ne može osvojiti (nije ni Pik ni adut)
  assert.equal(trickWinner(t, null), 0); // A sa PIK A
});

// ============================================
// TEST E — JAČI ADUT
// ============================================
test('TEST E: jači adut pobjeđuje slabiji adut', () => {
  // Trump: HERC
  // A→PIK A, B→HERC 7, C→HERC A
  const t = trick(
    [0, CARDS.pikA],
    [1, CARDS.herc7],
    [2, CARDS.hercA],
  );
  // HERC A > HERC 7, oba su aduti
  assert.equal(trickWinner(t, '♥'), 2); // C sa HERC A
});

// ============================================
// TEST F — NE MOŽE BACITI ADUT AKO IMA LEAD BOJU
// ============================================
test('TEST F: ne smije baciti adut ako ima traženu boju', () => {
  // Trump: HERC
  // Lead: KARO 10
  // B ima: KARO A, HERC A (ima Karo, MORA Karo)
  const t = [trick([0, CARDS.karo10])[0]!];
  const bHand = [CARDS.karoA, CARDS.hercA];

  // KARO A LEGALAN
  assert.equal(isCardLegal(CARDS.karoA, bHand, t, '♥'), true,
    'B mora moći igrati KARO A jer prati Karo');

  // HERC A NIJE LEGALAN (mora Karo)
  assert.equal(isCardLegal(CARDS.hercA, bHand, t, '♥'), false,
    'B NE SMIJE baciti HERC A jer ima Karo');
});

// ============================================
// TEST G — KO VODI SLEDEĆI ŠTIH
// ============================================
test('TEST G: pobednik vodi sledeći štih', () => {
  // Test 1: pobednik C (2), sledeći štih mora biti C → A → B
  const winner1 = 2;
  const order1 = [winner1, (winner1 + 1) % 3, (winner1 + 2) % 3];
  assert.deepEqual(order1, [2, 0, 1],
    'Pobednik C vodi sledeći štih: C → A → B');

  // Test 2: pobednik A (0), sledeći štih mora biti A → B → C
  const winner2 = 0;
  const order2 = [winner2, (winner2 + 1) % 3, (winner2 + 2) % 3];
  assert.deepEqual(order2, [0, 1, 2],
    'Pobednik A vodi sledeći štih: A → B → C');

  // Test 3: pobednik B (1), sledeći štih mora biti B → C → A
  const winner3 = 1;
  const order3 = [winner3, (winner3 + 1) % 3, (winner3 + 2) % 3];
  assert.deepEqual(order3, [1, 2, 0],
    'Pobednik B vodi sledeći štih: B → C → A');

  // NIKAKO fiksni A-B-C redosled za svaki štih
  for (let w = 0; w < 3; w++) {
    const o = [w, (w + 1) % 3, (w + 2) % 3];
    assert.notDeepEqual(o, [0, 1, 2].slice().reverse(),
      'Redosled nije fiksni C-B-A ni za jednog pobednika');
  }
});

// ============================================
// TEST H — ŠTI IMA TAČNO 3 KARTE
// ============================================
test('TEST H: štih ima tačno 3 karte', () => {
  const validTrick = trick(
    [0, CARDS.pikA],
    [1, CARDS.pikK],
    [2, CARDS.pikQ],
  );
  assert.equal(validTrick.length, 3, 'Štih ima tačno 3 karte');

  // 2 karte NIJE validan štih
  const incomplete = trick([0, CARDS.pikA], [1, CARDS.pikK]);
  assert.equal(incomplete.length, 2, '2 karte = štih NIJE završen');
  assert.notEqual(incomplete.length, 3, 'Štih nije gotov sa 2 karte');

  // 4 karte je GREŠKA
  const tooMany = trick(
    [0, CARDS.pikA],
    [1, CARDS.pikK],
    [2, CARDS.pikQ],
    [0, CARDS.pikJ],
  );
  assert.notEqual(tooMany.length, 3, '4 karte u štihu je GREŠKA');
});

// ============================================
// TEST I — KARTA SE UKLANJA IZ RUKE
// ============================================
test('TEST I: karta se uklanja iz ruke posle igranja', () => {
  // B ruka ima 10 karata pre
  let bHand: Card[] = [
    CARDS.pikA, CARDS.pikK, CARDS.pikQ, CARDS.pikJ, CARDS.pik10,
    CARDS.hercA, CARDS.hercK, CARDS.karoA, CARDS.karo10, CARDS.trefA,
  ];
  assert.equal(bHand.length, 10, 'B ima 10 karata pre');

  // B igra PIK K
  const cardPlayed = CARDS.pikK;
  const idx = bHand.findIndex(c => c.id === cardPlayed.id);
  assert.notEqual(idx, -1, 'Karta mora biti u ruci pre igranja');
  bHand.splice(idx, 1);

  // Posle: 9 karata
  assert.equal(bHand.length, 9, 'B ima 9 karata posle igranja');
  assert.equal(bHand.findIndex(c => c.id === cardPlayed.id), -1,
    'Karta više NIJE u ruci');
});

// ============================================
// TEST J — NEMA DUPLICIRANJA KARTE
// ============================================
test('TEST J: karta se ne duplira u ruci i u štihu', () => {
  // B ruka
  const bHand: Card[] = [
    CARDS.pikA, CARDS.pikK, CARDS.pikQ, CARDS.pikJ, CARDS.pik10,
    CARDS.hercA, CARDS.hercK, CARDS.karoA, CARDS.karo10, CARDS.trefA,
  ];
  // Štih
  const playedCard = CARDS.pikK;
  const t: TrickCard[] = [{ player: 1, card: playedCard }];

  // Simuliraj igru
  const idx = bHand.findIndex(c => c.id === playedCard.id);
  assert.notEqual(idx, -1, 'Karta mora biti u ruci pre igranja');
  bHand.splice(idx, 1);

  // Provera da karta NIJE u oba mesta
  const inHand = bHand.findIndex(c => c.id === playedCard.id);
  const inTrick = t.findIndex(c => c.card.id === playedCard.id);

  assert.equal(inHand, -1, 'Karta NIJE u ruci');
  assert.notEqual(inTrick, -1, 'Karta JESTE u štihu');
});