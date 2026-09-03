// Testovi za refe mehanizam (RULES.md sekcija 7)
// + IGRA tok (RULES.md sekcija 3.4)
//
// - IGRA bidding je samo "Igra" (bez konkretne igre). Konkretna Igra-X proglašava se na kraju.
// - Refa se automatski koristi (nema useRefe/skipRefe javne metode).
// - MODEL (potvrđeno uživo od korisnika, 2026-08-29): kad refe "okine" (svi
//   dalje, ili Pik bez kontre sa slobodnim budžetom kod nosioca) — SVA TRI
//   igrača dobijaju po JEDNU refu "na raspolaganju" (state.refePending), ne
//   samo budući nosilac. To je odvojeno od "iskorišćeno" (state.refeCount).
//   Svaki igrač troši SVOJU raspoloživu refu sam, automatski, PRVI put kad
//   ON LIČNO postane nosilac neke ruke (ne mora biti odmah sledeća ruka za
//   onog ko je prvi ne potroši — ostaje "na čekanju" dok se ne iskoristi).
//   Ranije (dve prethodne, međusobno suprotne verzije) — v1: sva trojica su
//   ODMAH dobijala "iskorišćeno" (bag, "tabela pokazivala 1/2 svima iako je
//   samo jedan odigrao"). v2: NIKO osim budućeg nosioca nije dobijao ništa
//   vidljivo (bag prijavljen uživo: "opet nema refe, iako nismo iskoristili
//   nijednu"). v3 (ovaj fajl) razdvaja dodelu (svima, na raspolaganju) od
//   potrošnje (pojedinačno, tek kad LIČNO postanu nosilac).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';

test('igra tok: sayIgra samo reč, winner mora proglašavati', () => {
  const game = new Game({ seed: 999 });
  game.newHand(0);
  // P1 pass, P2 kaže Igra
  game.pass(1);
  game.sayIgra(2);
  // Phase treba biti BIDDING (winner nije postavljen, winnerGame = null)
  assert.equal(game.state.phase, 'BIDDING');
  assert.equal(game.state.igraPlayer, 2);
  assert.equal(game.state.winner, null);
  assert.equal(game.state.winnerGame, null);
  // P0 treba da odluči
  assert.equal(game.state.currentBidder, 0);
  // Ako P0 kaže "dalje" (pass) — winner postaje P2 (igraPlayer)
  game.pass(0);
  assert.equal(game.state.winner, 2);
  assert.equal(game.state.phase, 'DECLARING');
  // Winner sada proglašava
  const ok = game.declareIgra(2, 'Igra-Karo');
  assert.equal(ok, true);
  assert.equal(game.state.winnerGame, 'Igra-Karo');
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
});

test('igra tok: bidding winner logika ne postavlja winner prerano', () => {
  const game = new Game({ seed: 1002 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  // Svi passed → ruka se poništava, nova ruka (BIDDING)
  assert.equal(game.state.phase, 'BIDDING');
  assert.equal(game.state.refeOccurred, true);
});

test('refe: "svi dalje" dodeljuje po JEDNU refu na raspolaganju SVA TRI igrača, ne menja iskorišćeno', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refeOccurred, true);
  assert.equal(game.state.refeCount.join(','), '0,0,0', 'niko jos nista nije potrosio');
  assert.equal(game.state.refePending.join(','), '1,1,1', 'sva tri igraca dobijaju po 1 refu na raspolaganju');
  assert.equal(game.state.phase, 'BIDDING');
});

test('refe: posle "svi dalje", NOSILAC sledece ruke troši TAČNO SVOJU raspoloživu refu kad se ona završi (RULES 7.3) — ostala dvojica je zadržavaju', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refePending.join(','), '1,1,1');

  // Sledeca ruka se igra normalno — P1 pobedjuje licitaciju i postaje nosilac
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  game.state.players[1]!.tricksWon = 7; // nosilac prolazi
  game.state.players[0]!.tricksWon = 2;
  game.state.players[2]!.tricksWon = 1;
  const result = game.endHand();

  // SAMO P1 (nosilac te ruke) trosi SVOJU refu — P0 i P2 zadrzavaju svoju
  // (jos neiskoriscenu) raspolozivu refu za neku BUDUCU rundu kad oni licno
  // postanu nosioci.
  assert.equal(game.state.refeCount.join(','), '0,1,0', 'samo nosilac (P1) trosi refu, ne sva trojica');
  assert.equal(game.state.refePending.join(','), '1,0,1', 'P0 i P2 zadrzavaju svoju raspolozivu refu neiskoriscenu');
  // Refe-multiplikator (x2) je stvarno bio aktivan — bula nosioca je -16
  // (Herc 8 * refe 2), ne -8 kao bez refe.
  assert.equal(result.bulas[1], 100 - 16, 'bula pod refeom je DUPLIRANA (8*2)');
  assert.equal(result.refeConsumed, 1);
});

test('refe: raspoloziva refa se NE TROSI (ostaje blokirana) dok je BILO KO u seširu, cak i ako nosilac nije taj u seširu', () => {
  // Uzivo prijavljen bag: jedan igrac je usao u sesir, drugi je imao
  // neiskoriscenu refu na raspolaganju — kad je ODIGRAO rucu, refa se
  // POTROSILA i duplirala ishod, iako RULES 7.2/7.3 kazu da sesir blokira
  // CEO refe mehanizam (i potrosnju, ne samo novo dodeljivanje).
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0); // svi dalje -> refePending svima
  assert.equal(game.state.refePending.join(','), '1,1,1');

  // P0 (NIJE nosilac sledece ruke) upada u sesir iz nekog drugog razloga —
  // simuliramo direktno preko state-a (kao i ostali testovi u ovom fajlu).
  game.state.bulas = [-5, 100, 100];

  // Sledeca ruka — P1 postaje nosilac i ima svoju raspolozivu refu (P1 SAM
  // nije u seširu, ali P0 JESTE).
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(0);
  game.moze(2);
  game.state.players[1]!.tricksWon = 7; // nosilac prolazi
  const bulaP1Before = game.state.bulas[1];
  const result = game.endHand();

  assert.equal(result.refeConsumed, null, 'refa se NE trosi dok je P0 u seširu');
  assert.equal(game.state.refePending.join(','), '1,1,1', 'niciji refePending se ne menja — P1-ova ostaje blokirana, ne izgubljena');
  assert.equal(result.bulas[1], bulaP1Before - 8, 'bula NIJE duplirana (samo Herc*2=8, ne *2*2=16)');
});

test('refe: igrač koji zadrži raspoloživu refu je troši KASNIJE kad on lično postane nosilac (ne mora biti odmah sledeća ruka)', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refePending.join(','), '1,1,1');

  // P1 postaje nosilac i trosi svoju refu (kao gore)
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  let hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(0);
  game.moze(2);
  game.endHand();
  assert.equal(game.state.refePending.join(','), '1,0,1');

  // Nova ruka (bez novog refe-triggera) — P0 sad pobedjuje i postaje nosilac.
  // On JOS UVEK ima svoju raspolozivu refu iz PRE dve ruke — mora je potrositi sad.
  game.newHand(2); // dealer=2 -> prvi bidder = P0
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  hand = game.state.players[0]!.hand;
  game.discard(0, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(0, 'Herc');
  game.follow(1, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(1);
  game.moze(2);
  game.state.players[0]!.tricksWon = 7;
  const bulaP0Before = game.state.bulas[0];
  const result = game.endHand();

  assert.equal(result.refeConsumed, 0, 'P0 sad trosi SVOJU davno dodeljenu raspolozivu refu');
  assert.equal(game.state.refeCount.join(','), '1,1,0');
  assert.equal(game.state.refePending.join(','), '0,0,1', 'P2 i dalje cuva svoju za kasnije');
  assert.equal(result.bulas[0], bulaP0Before - 16, 'bula P0 duplirana refeom (Herc 4*2*2)');
});

test('refe: dodela se preskače za igrača koji je već na budžetskom maksimumu', () => {
  const game = new Game({ seed: 1, refePerPlayer: 1 });
  game.state.refeCount = [1, 0, 0]; // P0 vec potrosio svoju jedinu refu
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refePending.join(','), '0,1,1', 'P0 je vec na maksimumu (1/1), ne dobija dodatnu');
});

test('refe: Pik bez kontre + neko u šeširu → regularan prolaz bez igranja, bez dodele (RULES 7.1.1)', () => {
  const game = new Game({ seed: 200, refePerPlayer: 2 });
  game.state.bulas = [-10, 100, 100]; // P0 u šeširu
  game.newHand(0);
  game.bid(1, 2); // Pik
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  const bulasBefore = [...game.state.bulas];
  game.moze(0);
  game.moze(2);
  // Ide direktno u GAME_OVER bez igranja karata — regularan prolaz, bez množenja
  assert.equal(game.state.phase, 'GAME_OVER');
  assert.equal(game.state.bulas[1], bulasBefore[1]! - 2 * 2);
  assert.equal(game.state.refeCount.join(','), '0,0,0');
  assert.equal(game.state.refePending.join(','), '0,0,0', 'niko ne dobija refu u ovom izuzetku');
});

test('refe: Pik bez kontre + nosilac ima slobodnu refu → dodela SVA TRI igrača (RULES 7.1.1)', () => {
  const game = new Game({ seed: 210, refePerPlayer: 2 });
  game.newHand(0);
  game.bid(1, 2); // Pik
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // Simuliraj "stale" lastHandResult od neke ranije, stvarno odigrane ruke —
  // ponistena ruka NE sme ostaviti ovo netaknuto (fuzz-otkriven bag).
  game.state.lastHandResult = { bulas: [90, 100, 110], supeDelta: [0, 0, 0], passed: true, winner: 0, winnerGame: 'Karo', kontraLevel: null, refeConsumed: null, refeActive: false, bulasAfter: [90, 100, 110] };
  game.moze(0);
  game.moze(2);
  // Refa se okida (isti mehanizam kao "svi kazu dalje"), nova ruka, bule
  // nepromenjene, ALI dodela ide SVA TRI igraca, ne samo nosioca ove ruke.
  assert.equal(game.state.phase, 'BIDDING');
  assert.equal(game.state.refeCount.join(','), '0,0,0');
  assert.equal(game.state.refePending.join(','), '1,1,1');
  assert.equal(game.state.lastHandResult, null, 'ponistena ruka ne sme ostaviti stari lastHandResult');
});

test('refe: Pik bez kontre, nosilac bez slobodnog budžeta, niko u šeširu → ruka se poništava, BEZ dodele (RULES 7.1.1)', () => {
  const game = new Game({ seed: 220, refePerPlayer: 0 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  const bulasBefore = [...game.state.bulas];
  game.state.lastHandResult = { bulas: [90, 100, 110], supeDelta: [0, 0, 0], passed: true, winner: 0, winnerGame: 'Karo', kontraLevel: null, refeConsumed: null, refeActive: false, bulasAfter: [90, 100, 110] };
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'BIDDING'); // nova ruka
  assert.equal(game.state.refeCount.join(','), '0,0,0');
  assert.equal(game.state.refePending.join(','), '0,0,0', 'refePerPlayer=0 -> niko nema budzeta, nema dodele');
  assert.deepEqual(game.state.bulas, bulasBefore);
  assert.equal(game.state.lastHandResult, null, 'ponistena ruka ne sme ostaviti stari lastHandResult');
});

test('refe: refeCount per-player konfigurabilan', () => {
  const game = new Game({ seed: 1, refePerPlayer: 3 });
  assert.equal(game.refePerPlayer, 3);
});

test('refe: NIKO NE PRATI (RULES 5.4) prati istu tri-granu logiku kao Pik bez kontre — refe se pise (ne "prolaz"), potvrdjeno uzivo', () => {
  // Korisnik je uzivo ispravio raniju pretpostavku: "niko ne prati" NIJE
  // prosto "nosilac automatski pobedjuje" — to vazi SAMO kad je neko u
  // seširu (vidi e2e.test.ts). Inace refe se pise (dodela svima, ruka se
  // ponistava BEZ promene bula) ako ima budzeta, ili se ruka prosto ponavlja
  // ako nema. Fresh igra, niko u seširu, svi imaju pun budzet.
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  const bulasBefore = [...game.state.bulas];
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'NE_DODJEM');

  assert.equal(game.state.phase, 'BIDDING', 'ruka se ponistava, NE GAME_OVER');
  assert.deepEqual(game.state.bulas, bulasBefore, 'bule NEPROMENJENE — nema automatskog pada bez seširam');
  assert.equal(game.state.refePending.join(','), '1,1,1', 'refe dodeljena SVA TRI igraca (P1 nosilac imao je slobodan budzet)');
  assert.equal(game.state.refeCount.join(','), '0,0,0', 'nista jos potroseno — ovo NIJE odigrana ruka');
});

test('refe: NIKO NE PRATI, nosilac VEC ima raspolozivu refu iz ranije — dodatna dodela (jos je ima budzeta), ruka se i dalje samo ponistava', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refePending.join(','), '1,1,1');

  // Sledeca ruka — P1 pobedjuje licitaciju (vec ima refePending=1), ali OBA
  // pratioca kazu Ne dodjem. P1 jos ima mesta u budzetu (0+1 < 2) -> dodela
  // se PONAVLJA za sva tri (ruka se opet samo ponistava, ne "trosi" staru).
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  const bulasBefore = [...game.state.bulas];
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'NE_DODJEM');

  assert.equal(game.state.phase, 'BIDDING', 'opet se samo ponistava');
  assert.deepEqual(game.state.bulas, bulasBefore, 'bule i dalje nepromenjene');
  assert.equal(game.state.refePending.join(','), '2,2,2', 'svi imaju jos mesta u budzetu (0+1<2) -> dodatna dodela svima');
  assert.equal(game.state.refeCount.join(','), '0,0,0', 'jos nista stvarno potroseno');
});

test('refe: NIKO NE PRATI, nosilac na budzetskom maksimumu — ruka se prosto ponavlja, BEZ dodele', () => {
  const game = new Game({ seed: 1, refePerPlayer: 0 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Pik');
  const bulasBefore = [...game.state.bulas];
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'NE_DODJEM');

  assert.equal(game.state.phase, 'BIDDING');
  assert.deepEqual(game.state.bulas, bulasBefore);
  assert.equal(game.state.refePending.join(','), '0,0,0', 'refePerPlayer=0 -> nema budzeta, nema dodele');
});

test('refe: raspoloziva refa OPSTAJE kroz vise redeljenih ruka dok se ne iskoristi (newHand() je ne dira)', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  game.pass(1);
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refePending.join(','), '1,1,1');

  // Nekoliko dodatnih redeljenih ruka bez ikakvog refe-triggera niti
  // ikakvog nosioca koji trosi — refePending mora ostati netaknut.
  game.newHand(1);
  game.newHand(2);
  game.newHand(0);
  assert.equal(game.state.refePending.join(','), '1,1,1', 'newHand() ne dira vec dodeljene raspolozive refe');
});
