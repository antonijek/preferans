// End-to-end testovi: kompletni tokovi Preferansa

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { makeCard } from '../src/cards.ts';
import { GAME_VALUES } from '../src/constants.ts';

test('e2e: licitacija ide striktno redom — skok na vecu vrednost je odbijen', () => {
  const game = new Game({ seed: 50 });
  game.newHand(0);
  // Prvi bid mora biti tacno 2, ne bilo koja veca vrednost
  const jump = game.bid(1, 5);
  assert.equal(jump, false, 'Skok na 5 kao prvi bid ne bi trebalo da radi');
  assert.equal(game.state.currentBid, 0);
  const ok2 = game.bid(1, 2);
  assert.equal(ok2, true);
  // Sledeci bid mora biti tacno +1 (3), ne skok na 5
  const jump2 = game.bid(2, 5);
  assert.equal(jump2, false, 'Skok sa 2 na 5 ne bi trebalo da radi');
  assert.equal(game.state.currentBid, 2);
  const ok3 = game.bid(2, 3);
  assert.equal(ok3, true);
});

test('e2e: "Mogu X" nije dozvoljeno igracu koji NIJE UOPSTE licitirao u ovoj rundi', () => {
  const game = new Game({ seed: 51 });
  game.newHand(0); // bidStartPlayer = 1
  game.bid(1, 2);
  // P2 je sada currentBidder, NIJE jos licitirao — ne sme "mogu 2"
  const mogu = game.bid(2, 2);
  assert.equal(mogu, false, 'P2 ne sme "mogu 2" bez prethodnog licitiranja');
  assert.equal(game.state.currentBid, 2);
  // P2 MORA ili podici (3) ili reci dalje
  const raise = game.bid(2, 3);
  assert.equal(raise, true);
  // Sada je P0 na redu, ni P0 nije jos licitirao — ni P0 ne sme "mogu 3"
  const mogu2 = game.bid(0, 3);
  assert.equal(mogu2, false, 'P0 ne sme "mogu 3" bez prethodnog licitiranja');
  // P1 JE licitirao ranije (bidLevel=2>0) — pravo na "mogu" postoji cim si
  // BAREM JEDNOM licitirao u ovoj rundi, bez obzira na tacnu vrednost.
  game.pass(0);
  const p1mogu3 = game.bid(1, 3);
  assert.equal(p1mogu3, true, 'P1 sme "mogu 3" jer je vec licitirao (2) u ovoj rundi');
  // RULES 3.3 primer: posle "P1: mogu 3" licitacija NASTAVLJA na P2 (bira
  // izmedju "4" i "dalje") — "mogu" sam po sebi NIKAD ne zavrsava licitaciju,
  // cak ni kad oba preostala aktivna igraca "pokrivaju" istu vrednost.
  assert.equal(game.state.phase, 'BIDDING', 'licitacija ne sme zavrsiti posle "mogu"');
  assert.equal(game.state.winner, null);
  assert.equal(game.state.currentBidder, 2, 'red se vraca P2, koji bira 4 ili dalje');
});

test('e2e: Mogu-eligible igrac (vec licitirao, trenutno nadmasen) NE SME sam podici licitaciju', () => {
  // Uzivo potvrdjeno od korisnika kroz dva konkretna primera toka
  // licitacije: kad si "iza" (Mogu dostupno), tvoje JEDINE opcije su Mogu
  // ili Dalje — podizanje je rezervisano za onog ko trenutno NIJE nadmasen.
  const game = new Game({ seed: 51 });
  game.newHand(0); // bidStartPlayer = 1
  game.bid(1, 2);
  game.bid(2, 3);
  game.pass(0); // red se vraca na P1 — sada Mogu-eligible (bidLevel=2 < currentBid=3)
  const raiseAttempt = game.bid(1, 4);
  assert.equal(raiseAttempt, false, 'P1 ne sme sam podici na 4 dok je Mogu-eligible');
  assert.equal(game.state.currentBid, 3, 'currentBid ostaje nepromenjen');
  // getLegalActions() ne sme nuditi "bid" (podizanje) za P1 u ovom trenutku
  const actions = game.getLegalActions();
  assert.ok(!actions.some(a => a.type === 'bid'), 'getLegalActions ne sme nuditi podizanje dok je Mogu dostupno');
  assert.ok(actions.some(a => a.type === 'mogu'), 'getLegalActions MORA nuditi Mogu');
  // P1 i dalje MOZE potvrditi (Mogu 3) ili reci dalje
  const moguOk = game.bid(1, 3);
  assert.equal(moguOk, true, 'P1 sme potvrditi sa Mogu 3');
});

test('e2e: SAMO JEDAN igrac sme potvrditi (Mogu) datu vrednost — drugi koji je TAKODJE iza SME da podigne umesto', () => {
  // Uzivo potvrdjeno EKSPLICITNO i vise puta od korisnika: "ne mogu 2
  // igraca da kazu mogu X, to je totalno neispravno". Scenario tacno kao
  // uzivo prijavljen: P0 bid 2, P1 bid 3, P2 bid 4 — sad su P0 i P1 OBOJICA
  // iza (bidLevel < 4). Prvi koji potvrdi "zauzme" tu vrednost; drugi VISE
  // ne sme da je potvrdi — ALI (potvrdjeno uzivo 2026-08-29, drugi konkretan
  // primer: ekran je nudio SAMO "Dalje" bez opcije podizanja iako je
  // korisnik imao jaku ruku) SME da podigne na sledecu vrednost umesto da
  // ostane zaglavljen na Dalje.
  const game = new Game({ seed: 51 });
  game.newHand(2); // bidStartPlayer = 0
  game.bid(0, 2);
  game.bid(1, 3);
  game.bid(2, 4);
  // P0 na redu — Mogu-eligible (bidLevel=2 < 4), prvi koji potvrdjuje
  const p0mogu = game.bid(0, 4);
  assert.equal(p0mogu, true, 'P0 sme prvi potvrditi Mogu 4');
  // P1 na redu — TAKODJE Mogu-eligible (bidLevel=3 < 4), ali Mogu je VEC
  // zauzet od P0 — ne sme ni on da potvrdi
  const p1mogu = game.bid(1, 4);
  assert.equal(p1mogu, false, 'P1 NE SME da potvrdi istu vrednost koju je P0 vec potvrdio');
  assert.equal(game.state.currentBid, 4, 'currentBid ostaje nepromenjen');
  // getLegalActions() za P1 ne nudi mogu (zauzet), ALI nudi bid (podizanje)
  const actions = game.getLegalActions();
  assert.ok(!actions.some(a => a.type === 'mogu'), 'Mogu vec zauzet — ne nudi se P1');
  assert.ok(actions.some(a => a.type === 'bid' && a.value === 5), 'P1 SME da podigne na 5 kad je Mogu vec zauzet');
  assert.ok(actions.some(a => a.type === 'pass'), 'Dalje je i dalje ponudjeno');
  // P1 moze da podigne na 5
  const p1raise = game.bid(1, 5);
  assert.equal(p1raise, true, 'P1 sme da podigne na 5 kad Mogu vise nije dostupan');
  assert.equal(game.state.currentBid, 5);
});

test('e2e: igrac koji VEC drzi currentBid ne sme reci "mogu" za svoju sopstvenu vrednost', () => {
  // Potvrdjeno sa dva nezavisna izvora srpskih pravila Preferansa
  // (preferansklub.com, prefdamaherc.com) i uzivo prijavljenim bagom:
  // "Mogu X" je bilo ponudjeno igracu koji je sam poslednji postavio X.
  const game = new Game({ seed: 51 });
  game.newHand(0); // bidStartPlayer = 1
  game.bid(1, 2);
  game.bid(2, 3); // P2 sada drzi currentBid=3 (bidLevel=3)
  // P2 pokusava "mogu 3" za SVOJU sopstvenu vrednost — mora biti odbijeno
  const selfMogu = game.bid(2, 3);
  assert.equal(selfMogu, false, 'P2 ne sme "mogu" za vrednost koju vec sam drzi');
  assert.equal(game.state.currentBid, 3, 'currentBid ostaje nepromenjen');
  // getLegalActions() ne sme nuditi "Mogu 3" dugme za P2 u ovom trenutku
  const actions = game.getLegalActions();
  assert.ok(
    !actions.some(a => a.type === 'mogu'),
    'getLegalActions ne sme vratiti MOGU za igraca koji vec drzi currentBid',
  );
});

test('e2e: oba pratioca "Ne dodjem" na NE-PIK igri — nosilac automatski dobija 10 stihova, fiksan prolaz, BEZ REFE (RULES 5.4)', () => {
  // Potvrdjeno uzivo od korisnika (viseput, posle privremene pogresne
  // generalizacije): refe/sesir-grananje kod "niko ne prati" vazi SAMO kad
  // je declaredGame TACNO 'Pik' (vidi refe.test.ts za tu granu). Za SVAKU
  // drugu igru (Karo ovde, ali isto za Herc/Tref/Betl/Sans/Igra-*) uvek vazi
  // prost bezuslovan prolaz -igra*2, bez ikakvog obzira na sesir ili budzet.
  const game = new Game({ seed: 60 });
  game.state.bulas = [-5, 100, 100]; // P0 u seširu — NE SME uticati na Karo ishod
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Karo'); // vrednost 3
  const bulasBefore = [...game.state.bulas];
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'NE_DODJEM');
  // Partija se ne igra — direktno GAME_OVER, nosilac se spusta za igra*2
  assert.equal(game.state.phase, 'GAME_OVER');
  assert.equal(game.state.bulas[1], bulasBefore[1]! - 3 * 2);
  assert.equal(game.state.bulas[0], bulasBefore[0]);
  assert.equal(game.state.bulas[2], bulasBefore[2]);
});

test('e2e: oba pratioca "Ne dodjem" na NE-PIK igri, nosilac NEMA raspolozivu refu — prost prolaz, NEMA nove dodele', () => {
  const game = new Game({ seed: 60 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Karo');
  const bulasBefore = [...game.state.bulas];
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'NE_DODJEM');
  // Karo (ne Pik) -> prost prolaz -igra*2, NEMA novog trigerovanja refe.
  assert.equal(game.state.phase, 'GAME_OVER');
  assert.equal(game.state.bulas[1], bulasBefore[1]! - GAME_VALUES['Karo'] * 2, 'BEZ mnozenja refeom');
  assert.equal(game.state.refePending.join(','), '0,0,0', 'Karo ne trigeruje NOVU dodelu refe');
});

test('e2e: oba pratioca "Ne dodjem" na NE-PIK igri, nosilac VEC ima raspolozivu refu (dodeljenu ranije) — TROSI se ovde, ishod dupliran', () => {
  // Uzivo potvrdjeno: "kako bez refe kad je refa dodeljana rundu pre?" —
  // vec dodeljena raspoloziva refa je licna osobina igraca i primenjuje se
  // na NJEGOVU sledecu (ovako zakljucenu) ruku bez obzira na igru — samo
  // NOVO trigerovanje/dodela je ogranicena na Pik, ne i potrosnja postojece.
  const game = new Game({ seed: 60 });
  game.newHand(0);
  game.pass(1); // svi dalje -> dodela svima
  game.pass(2);
  game.pass(0);
  assert.equal(game.state.refePending.join(','), '1,1,1');
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Karo');
  const bulasBefore = [...game.state.bulas];
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'NE_DODJEM');
  assert.equal(game.state.phase, 'GAME_OVER');
  assert.equal(game.state.bulas[1], bulasBefore[1]! - GAME_VALUES['Karo'] * 2 * 2, 'DUPLIRANO — P1 je vec imao raspolozivu refu');
  assert.equal(game.state.refePending.join(','), '1,0,1', 'P1 trosi SVOJU vec dodeljenu refu; P0/P2 zadrzavaju svoju');
  assert.equal(game.state.lastHandResult?.refeConsumed, 1);
});

test('e2e: dva igraca kazu Igra — SVAKI mora proglasiti SVOJU igru, JACA pobedjuje (RULES 3.4.1)', () => {
  // Uzivo prijavljen bag: ranije se odmah proglasavao pobednik = PRVI koji
  // je rekao Igra, bez ikakvog trazenja da ostali koji su TAKODJE rekli
  // Igra proglase svoju igru i bez ikakvog poredjenja jacine — "svi kazu
  // igra... nema govorenja cija je koja, nego prvi odigrava".
  const game = new Game({ seed: 70 });
  game.newHand(0);
  game.pass(1);
  game.sayIgra(2); // prvi koji kaze Igra
  game.sayIgra(0); // drugi — TAKODJE mora konkurisati, ne samo "izgubiti"
  // Winner NIJE jos odredjen — oba moraju prvo proglasiti SVOJU igru.
  assert.equal(game.state.winner, null, 'winner cheka dok se ne uporede proglasene igre');
  assert.equal(game.state.phase, 'DECLARING');
  assert.deepEqual(game.state.igraCompetitors, [2, 0], 'redosled prijave: P2 prvi, P0 drugi');
  assert.equal(game.state.currentBidder, 2, 'prvi na potezu za proglasenje je prvi koji je rekao Igra');

  // getLegalActions() tokom tiebreak-a nudi IGRA opcije za TRENUTNOG (P2), ne za null
  const actions1 = game.getLegalActions();
  assert.ok(actions1.every(a => a.type !== 'declare' || a.player === 2));

  // P2 proglasava SLABIJU igru (Igra-Karo=4)
  assert.equal(game.declareIgra(2, 'Igra-Karo'), true);
  assert.equal(game.state.winner, null, 'jos se ceka P0 da proglasi');
  assert.equal(game.state.currentBidder, 0, 'red prelazi na P0');

  // P0 proglasava JACU igru (Igra-Herc=5) — P0 MORA pobediti uprkos tome sto
  // NIJE bio prvi koji je rekao "Igra" (to pravilo vazi samo za IZJEDNACENJE).
  assert.equal(game.declareIgra(0, 'Igra-Herc'), true);
  assert.equal(game.state.winner, 0, 'jaca igra (Igra-Herc) pobedjuje bez obzira ko je prvi rekao Igra');
  assert.equal(game.state.winnerGame, 'Igra-Herc');
  assert.equal(game.state.igraPlayer, 0, 'igraPlayer uskladjen sa stvarnim pobednikom');
  assert.equal(game.state.igraCompetitors, null, 'tiebreak zavrsen');
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
});

test('e2e: tri igraca kazu Igra, IZJEDNACENJE (ista vrednost) — pobedjuje PRVI koji je rekao Igra', () => {
  const game = new Game({ seed: 70 });
  game.newHand(2); // bidStartPlayer = 0
  game.sayIgra(0); // prvi
  game.sayIgra(1); // drugi
  game.sayIgra(2); // treci
  assert.deepEqual(game.state.igraCompetitors, [0, 1, 2]);
  // Sva trojica proglase ISTU igru (izjednacenje po vrednosti)
  assert.equal(game.declareIgra(0, 'Igra-Karo'), true);
  assert.equal(game.declareIgra(1, 'Igra-Karo'), true);
  assert.equal(game.declareIgra(2, 'Igra-Karo'), true);
  assert.equal(game.state.winner, 0, 'izjednacenje -> pobedjuje PRVI koji je rekao Igra (P0)');
  assert.equal(game.state.winnerGame, 'Igra-Karo');
});

test('e2e: Igra tiebreak — igrac ne sme proglasiti van svog reda niti dva puta', () => {
  const game = new Game({ seed: 70 });
  game.newHand(0);
  game.pass(1);
  game.sayIgra(2);
  game.sayIgra(0);
  assert.equal(game.state.currentBidder, 2);
  // P0 pokusava da proglasi van reda (na redu je P2)
  assert.equal(game.declareIgra(0, 'Igra-Karo'), false, 'ne sme van reda');
  assert.equal(game.declareIgra(2, 'Igra-Karo'), true);
  // P2 pokusava da proglasi DRUGI PUT (vec je proglasio)
  assert.equal(game.declareIgra(2, 'Igra-Sans'), false, 'vec je proglasio, ne sme ponovo');
});

test('e2e: bidding → DISCARDING → DECLARING → FOLLOW_DECLARING', () => {
  const game = new Game({ seed: 100 });
  game.newHand(0);
  // Bidding: P1 bid 2, P2 pass, P3 pass → P1 winner
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  // Winner je 1, faza DISCARDING
  assert.equal(game.state.phase, 'DISCARDING');
  assert.equal(game.state.winner, 1);
  // P1 ima 12 karata (10 + 2 talon)
  assert.equal(game.state.players[1]!.hand.length, 12);
  // Discard
  const hand = game.state.players[1]!.hand;
  const ok = game.discard(1, [hand[0]!.id, hand[1]!.id]);
  assert.equal(ok, true);
  assert.equal(game.state.phase, 'DECLARING');
  assert.equal(game.state.players[1]!.hand.length, 10);
  assert.equal(game.state.discard.length, 2);
  // Declare Karo
  const declareOk = game.declareGame(1, 'Karo');
  assert.equal(declareOk, true);
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
  assert.equal(game.state.trump, '♦');
  assert.equal(game.state.declaredGame, 'Karo');
});

test('e2e: Igra tok — bez talona, ide pravo u FOLLOW_DECLARING', () => {
  const game = new Game({ seed: 200 });
  game.newHand(0);
  // biddingStart = nextPlayer(dealer=0) = 1
  // P1 kaže "dalje", pa P2 (sledeći) kaže "Igra" (samo reč, bez imena igre)
  game.pass(1);
  game.sayIgra(2);
  // P0 (biddingStart) mora da odgovori (pass ili Igra) pre nego se bidding završi
  game.pass(0);
  // Svi odgovorili: P1 pass, P2 Igra, P0 pass
  // Winner = P2 (igraPlayer), phase = DECLARING (winner tek sad imenuje igru)
  assert.equal(game.state.winner, 2);
  assert.equal(game.state.winnerGame, null);
  assert.equal(game.state.phase, 'DECLARING');
  // Winner (P2) proglašava Igra-Karo
  const ok = game.declareIgra(2, 'Igra-Karo');
  assert.equal(ok, true);
  assert.equal(game.state.winnerGame, 'Igra-Karo');
  assert.equal(game.state.trump, '♦');
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
  // P2 ima 10 karata (nije uzeo talon)
  assert.equal(game.state.players[2]!.hand.length, 10);
  // Talon je netaknut
  assert.equal(game.state.talon.length, 2);
});

test('e2e: Betl — svi automatski prate, prelaz u KONTRA_DECLARING', () => {
  const game = new Game({ seed: 300 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  // DISCARDING
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  // Declare Betl
  game.declareGame(1, 'Betl');
  // Betl: svi automatski prate (RULES 5.1), ali kontra je i dalje moguca (RULES 6.9)
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  assert.equal(game.state.declaredGame, 'Betl');
  assert.equal(game.state.trump, null);
  assert.deepEqual(game.state.followChoices, ['DODJEM', 'DODJEM', 'DODJEM']);
  // Bez kontre — oba pratioca Moze, ide u PLAYING
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');
});

test('e2e: DODJEM + NE_DODJEM — DODJEM bira: Zovem ili Igram sa winnerom', () => {
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  // P0 DODJE, P2 NE DODJE
  game.follow(0, 'DODJEM');
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
  game.follow(2, 'NE_DODJEM');
  // Po novom pravilu: DODJEM (P0) treba da bira: Zovem NE_DODJEM ili Igram sa winnerom
  // Pozivamo continueWithoutCall — winner + DODJEM igraju, NE_DODJEM preskače
  const r = game.continueWithoutCall();
  assert.equal(r, true);
  // Pošto Herc može imati kontra, faza je KONTRA_DECLARING (ili PLAYING ako nema kontre)
  assert.ok(['PLAYING', 'KONTRA_DECLARING'].includes(game.state.phase), 'Treba preći u PLAYING ili KONTRA_DECLARING');
  assert.equal(game.state.caller, null);
  // NE_DODJEM (P2) ne igra karte
  const legalForP2 = game.getLegalCards(2);
  assert.equal(legalForP2.length, 0);
});

test('e2e: pozvani igrač (RULES 5.3) — supe pozivaoca racunaju SABRANE stihove pozivaoca i pozvanog', () => {
  // Uzivo prijavljen bag: formula je koristila SAMO pozivaočeve sopstvene
  // stihove, gubeci stihove pozvanog partnera. RULES 5.3: "njegovi [pozvanog]
  // bodovi idu pratiocu koji ga je pozvao" — stihovi se SABIRAJU.
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc'); // vrednost 4, bula vrednost 8
  // P0 NE DODJE, P2 DODJE i zove P0
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'DODJEM');
  const called = game.call(2, 0);
  assert.equal(called, true);
  assert.equal(game.state.caller, 2);
  assert.equal(game.state.callee, 0);

  // Preskoci eventualnu kontru (Moze/Moze) da stignemo do PLAYING
  if (game.state.phase === 'KONTRA_DECLARING') {
    game.moze(2);
  }
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac(P1) 7, pozivalac P2 2, pozvani P0 1 — zajedno 3
  game.state.players[1]!.tricksWon = 7;
  game.state.players[2]!.tricksWon = 2;
  game.state.players[0]!.tricksWon = 1;
  const result = game.endHand();

  assert.equal(result.passed, true);
  assert.equal(result.bulas[1], 100 - 8, 'nosilac spusta se 8');
  // Pozivalac+pozvani ZAJEDNO imaju 2+1=3 stiha — ISPOD praga od 4 (RULES
  // 5.3: paru treba DVOSTRUKO vise nego samostalnom pratiocu, 4 ne 2), pa
  // pozivalac RASTE za ceo iznos.
  assert.equal(result.bulas[2], 100 + 8, 'pozivalac (3<4 zajedno) RASTE za CEO iznos');
  assert.equal(result.bulas[0], 100, 'pozvani ne upisuje bodove (RULES 5.3)');
  assert.equal(result.supeDelta[2], 24, 'pozivalac supe = (2+1 SABRANO) * 4 * 2 = 24, ne 2*4*2=16');
  assert.equal(result.supeDelta[0], 0, 'pozvani ne upisuje supe');
});

test('e2e: pozivalac+pozvani ZAJEDNO ispod praga od 4 — pozivalac RASTE za CEO iznos (RULES 5.3)', () => {
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc'); // vrednost 4, bula vrednost 8
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'DODJEM');
  const called = game.call(2, 0);
  assert.equal(called, true);
  if (game.state.phase === 'KONTRA_DECLARING') game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac(P1) prolazi sa 9, pozivalac P2 1, pozvani P0 0 — zajedno SAMO 1 (<4)
  game.state.players[1]!.tricksWon = 9;
  game.state.players[2]!.tricksWon = 1;
  game.state.players[0]!.tricksWon = 0;
  const result = game.endHand();

  assert.equal(result.passed, true);
  assert.equal(result.bulas[1], 100 - 8, 'nosilac spusta se 8');
  assert.equal(result.bulas[2], 100 + 8, 'pozivalac (1<4 zajedno) RASTE za CEO iznos');
  assert.equal(result.bulas[0], 100, 'pozvani ne upisuje bodove (RULES 5.3)');
});

test('e2e: pozivalac+pozvani ZAJEDNO TACNO 4 stiha — prolaze, NEMA promenu bule (RULES 5.3)', () => {
  // Uzivo prijavljen scenario: "zapad igra tref, uhvati 6 stihova, ja zovem
  // istoka i zajedno uhvatimo 4, ali mene si podigao 10 u bulama. Nepravilno."
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref'); // vrednost 5, bula vrednost 10
  game.follow(0, 'NE_DODJEM');
  game.follow(2, 'DODJEM');
  const called = game.call(2, 0);
  assert.equal(called, true);
  if (game.state.phase === 'KONTRA_DECLARING') game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac(P1) prolazi sa 6, pozivalac P2 3, pozvani P0 1 — zajedno TACNO 4
  game.state.players[1]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 3;
  game.state.players[0]!.tricksWon = 1;
  const result = game.endHand();

  assert.equal(result.passed, true);
  assert.equal(result.bulas[1], 100 - 10, 'nosilac spusta se 10 (Tref 5*2)');
  assert.equal(result.bulas[2], 100, 'pozivalac (4>=4 zajedno) — NEMA promenu bule, samo supe');
  assert.equal(result.bulas[0], 100, 'pozvani ne upisuje bodove (RULES 5.3)');
});

test('e2e: pozvani "Ne dodjem" igrac NE SME dati kontru — samo onaj ko je STVARNO dosao', () => {
  // RULES 5.1: "Kontra – daje onaj KOJI JE DOSAO (ne pozvani)". Potvrdjeno i
  // spoljnim izvorima (preferansklub.com/prefdamaherc.com) i uzivo
  // prijavljenim bagom: pozvani NE_DODJEM partner je dobijao opciju Kontra.
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(0, 'DODJEM');
  game.follow(2, 'NE_DODJEM');
  // P0 (DODJEM) zove P2 (NE_DODJEM) kao partnera — "Zovem X"
  const called = game.call(0, 2);
  assert.equal(called, true);
  assert.equal(game.state.phase, 'KONTRA_DECLARING', 'Herc dozvoljava kontru');
  // P2 JESTE aktivan za igranje karata (pozvani partner igra)...
  assert.ok(game.isPlayerActive(2), 'Pozvani NE_DODJEM partner igra karte');
  // ...ALI nema pravo glasa oko kontre — SAMO P0 (stvarni DODJEM) odlucuje
  assert.equal(game.expectedKontraPlayerPublic(), 0, 'Samo P0 (dosao) odlucuje o kontri, ne pozvani P2');
  const kontraByCallee = game.kontra(2, 'KONTRA');
  assert.equal(kontraByCallee, false, 'Pozvani P2 ne sme dati kontru');
  const mozeByCallee = game.moze(2);
  assert.equal(mozeByCallee, false, 'Pozvani P2 ne sme ni reci Moze');
  // getLegalActions() ne sme nuditi kontra/moze za P2
  const actions = game.getLegalActions();
  assert.ok(!actions.some(a => a.player === 2), 'P2 ne sme imati NIJEDNU KONTRA_DECLARING akciju');
  // P0 moze normalno reci Moze da zavrsi kontra fazu
  const mozeByP0 = game.moze(0);
  assert.equal(mozeByP0, true);
  assert.equal(game.state.phase, 'PLAYING');
});

test('e2e: kontras koji POBEDI (obori nosioca) NEMA promenu bule — samo supe (RULES 6.3/9.3.2)', () => {
  // Uzivo prijavljen bag: kontras koji je oborio nosioca je DOBIJAO promenu
  // bule (spustao se), a to sme SAMO kad kontras IZGUBI (nosilac ipak uspe).
  // Potvrdjeno REFERENTNI_PRIMERI.md rundom #11: kontras (Janko) kad obori
  // nosioca dobija SAMO supe, bula mu ostaje NEPROMENJENA.
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc'); // vrednost 4, bula vrednost 8
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.kontra(0, 'KONTRA'); // P0 daje kontru
  game.moze(1); // nosilac prihvata (bez rekontre)
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac(P1) PADA sa 3 stiha (Herc trazi 6). P0(kontras) 4, P2 samo 1 —
  // ZAJEDNO odbrana ima TACNO 5 (invarijanta automatskog prekida runde), sto
  // je NAMERNO razlicito od nosiočevih stihova (3), da razdvoji staru
  // (pogresnu) formulu koristi nosiočeve stihove od tacne koja koristi
  // ZBIR odbrane. Vrednosti po REFERENTNI_PRIMERI.md rundi #11: "5 x 8 x 2
  // = 80" gde je 5 = odbrambeni stihovi ZAJEDNO, ne nosiočevi.
  game.state.players[1]!.tricksWon = 3;
  game.state.players[0]!.tricksWon = 4;
  game.state.players[2]!.tricksWon = 1;
  const result = game.endHand();

  assert.equal(result.passed, false, 'nosilac je pao (3 < 6)');
  assert.equal(result.bulas[1], 100 + 16, 'nosilac dize se 16 (Herc 8 * kontra 2)');
  assert.equal(result.bulas[0], 100, 'kontras POBEDIO — bula NEPROMENJENA (samo supe)');
  assert.equal(result.bulas[2], 100, 'ne-kontras pratilac — bez promene bule i bez supe');
  assert.equal(result.supeDelta[0], 80, 'kontras supe = ODBRANA ZAJEDNO(4+1=5) * 4 * 2 * kontra(2), RULES runda #11');
  assert.equal(result.supeDelta[2], 0, 'ne-kontras pratilac ne upisuje supe');
});

test('e2e: nezavisni pratioci (bez poziva) — minimum 2 štiha za prolaz, ostatak PADA za CEO iznos (RULES 5.2)', () => {
  // Potvrdjeno iz REFERENTNI_PRIMERI.md rundi #2/#8 (identicna struktura) i
  // uzivo prijavljenim bagom: pratilac sa <2 stiha treba da PADNE za CEO
  // iznos (igra*2, ovde 8 za Herc), ne za polovinu (4) kao stari flat kod.
  const game = new Game({ seed: 400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc'); // vrednost 4, bula vrednost 8
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  // Simuliraj ishod runde #2/#8: nosilac(P1) 6, P0 3, P2 1
  game.state.players[1]!.tricksWon = 6;
  game.state.players[0]!.tricksWon = 3;
  game.state.players[2]!.tricksWon = 1;
  const result = game.endHand();

  assert.equal(result.passed, true, 'nosilac uspeo (6 >= potrebnih 6 za Herc)');
  assert.equal(result.bulas[1], 100 - 8, 'nosilac se spusta za 8 (Herc vrednost)');
  assert.equal(result.bulas[0], 100, 'P0 (3 stiha >=2) PROSAO — bez promene bule');
  assert.equal(result.bulas[2], 100 + 8, 'P2 (1 stih <2) PADA za CEO iznos (8, ne 4)');
  assert.equal(result.supeDelta[0], 24, 'P0 supe = 3 stiha * 8');
  assert.equal(result.supeDelta[2], 8, 'P2 supe = 1 stih * 8');
});

test('e2e: nezavisni pratioci — oba tacno na 2 stiha, OBA prolaze bez promene bule (RULES 5.2)', () => {
  // Potvrdjeno iz REFERENTNI_PRIMERI.md runde #6: kad oba nezavisna pratioca
  // dostignu tacno 2 stiha, NIJEDAN ne pada — bula ostaje nepromenjena za
  // oba, svaki i dalje dobija supe za svoje stihove.
  const game = new Game({ seed: 400 });
  game.newHand(0);
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

  game.state.players[1]!.tricksWon = 6;
  game.state.players[0]!.tricksWon = 2;
  game.state.players[2]!.tricksWon = 2;
  const result = game.endHand();

  assert.equal(result.bulas[1], 100 - 8);
  assert.equal(result.bulas[0], 100, 'P0 tacno 2 stiha — prolazi bez promene bule');
  assert.equal(result.bulas[2], 100, 'P2 tacno 2 stiha — prolazi bez promene bule');
  assert.equal(result.supeDelta[0], 16, 'P0 supe = 2 * 8');
  assert.equal(result.supeDelta[2], 16, 'P2 supe = 2 * 8');
});

test('e2e: nezavisni pratioci — ako OBA padnu (<2 stiha), OBA se podizu za CEO iznos, bez deljenja (RULES 5.2)', () => {
  // Uzivo potvrdjeno od korisnika: "ako je odigrao tref, a oba pratioca
  // padnu, oba se podizu za po 10" (Tref bula vrednost = 10) — NE za po 5
  // (sto bi bilo deljenje ukupnog iznosa medju njima).
  const game = new Game({ seed: 400 });
  game.newHand(2); // bidStartPlayer = 0
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  assert.equal(game.state.winner, 0);
  const hand = game.state.players[0]!.hand;
  game.discard(0, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(0, 'Tref'); // vrednost 5, bula vrednost 10
  game.follow(2, 'DODJEM');
  game.follow(1, 'DODJEM');
  if (game.state.phase === 'KONTRA_DECLARING') {
    const first = game.expectedKontraPlayerPublic()!;
    game.moze(first);
    const second = game.expectedKontraPlayerPublic();
    if (second !== null) game.moze(second);
  }
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac(P0) 8 stihova, P1 i P2 po 1 (oba <2 → oba padaju)
  game.state.players[0]!.tricksWon = 8;
  game.state.players[1]!.tricksWon = 1;
  game.state.players[2]!.tricksWon = 1;
  const result = game.endHand();

  assert.equal(result.passed, true);
  assert.equal(result.bulas[0], 100 - 10, 'nosilac spusta se 10 (Tref)');
  assert.equal(result.bulas[1], 100 + 10, 'P1 pada za CEO iznos 10, ne za polovinu (5)');
  assert.equal(result.bulas[2], 100 + 10, 'P2 pada za CEO iznos 10, ne za polovinu (5)');
  assert.equal(result.supeDelta[1], 10, 'P1 supe = 1 stih * 10');
  assert.equal(result.supeDelta[2], 10, 'P2 supe = 1 stih * 10');
});

test('e2e: nezavisni pratioci — nosilac PAO bez kontre — pratioci NIKAD ne dobijaju spustanje bule, samo supe (RULES 9.4/5.2)', () => {
  // Uzivo eksplicitno potvrdjeno (posle kratkog pogresnog pokusaja
  // "simetricne nagrade" koji je korisnik odmah odbio): "njemu ide supe a
  // ne smes da ga spustas". Pratilac se NIKAD ne nagradjuje spustanjem
  // bule, ni kad nosilac padne — SAMO ispod-praga (<2 stiha) pratilac
  // PADA (bula raste), iznad praga NIKAD nema promene bule, samo supe. I
  // ovde je otkriven pravi bag: nezavisni pratioci uopste nisu dobijali
  // NIKAKVE supe kad nosilac padne bez kontre (sad popravljeno).
  const game = new Game({ seed: 400 });
  game.newHand(2); // bidStartPlayer = 0
  game.bid(0, 2);
  game.pass(1);
  game.pass(2);
  const hand = game.state.players[0]!.hand;
  game.discard(0, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(0, 'Karo'); // vrednost 3, bula vrednost 6
  game.follow(2, 'DODJEM');
  game.follow(1, 'DODJEM');
  if (game.state.phase === 'KONTRA_DECLARING') {
    const first = game.expectedKontraPlayerPublic()!;
    game.moze(first);
    const second = game.expectedKontraPlayerPublic();
    if (second !== null) game.moze(second);
  }
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac(P0) PADA sa 4 stiha (Karo trazi 6). P1 uzima 5 (>=2, samo
  // supe), P2 uzima 1 (<2, pada za ceo iznos + supe).
  game.state.players[0]!.tricksWon = 4;
  game.state.players[1]!.tricksWon = 5;
  game.state.players[2]!.tricksWon = 1;
  const result = game.endHand();

  assert.equal(result.passed, false, 'nosilac pao (4 < 6)');
  assert.equal(result.bulas[0], 100 + 6, 'nosilac dize se 6 (Karo)');
  assert.equal(result.bulas[1], 100, 'P1 (5>=2) — NIKAD se ne nagradjuje spustanjem bule, samo supe');
  assert.equal(result.bulas[2], 100 + 6, 'P2 (1<2) pada za CEO iznos (isto pravilo bez obzira da li nosilac pao ili prosao)');
  assert.equal(result.supeDelta[1], 30, 'P1 supe = 5 stihova * 3 * 2 = 30');
  assert.equal(result.supeDelta[2], 6, 'P2 supe = 1 stih * 3 * 2 = 6 (i ispod praga i dalje dobija supe)');
});

test('e2e: Svi kažu dalje → REFE se automatski koristi, igra prelazi u DISCARDING', () => {
  const game = new Game({ seed: 500 });
  game.newHand(0);
  // Svi "dalje"
  game.pass(1);
  game.pass(2);
  game.pass(0);
  // RULES 7.1/7.3: refeCount (iskorisceno) se NE menja odmah — sva tri
  // igraca dobijaju po jednu refu NA RASPOLAGANJU, svako je trosi sam kad
  // licno postane nosilac neke ruke.
  assert.equal(game.state.refeOccurred, true);
  assert.equal(game.state.refeCount.join(','), '0,0,0');
  assert.equal(game.state.refePending.join(','), '1,1,1');
  // Phase je BIDDING (nema winner-a, nova ruka)
  assert.equal(game.state.phase, 'BIDDING');
});

test('e2e: Kontra tok — KONTRA → REKONTRA → SUBKONTRA → MORTKONTRA', () => {
  const game = new Game({ seed: 600 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  // Oba pratioca "Dodjem"
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // Faza KONTRA_DECLARING
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  // P0 daje kontru
  assert.equal(game.expectedKontraPlayerPublic(), 0);
  game.kontra(0, 'KONTRA');
  assert.equal(game.state.kontraLevel, 'KONTRA');
  // P1 (nosilac) daje rekontru
  game.kontra(1, 'REKONTRA');
  assert.equal(game.state.kontraLevel, 'REKONTRA');
  // P0 daje subkontru
  game.kontra(0, 'SUBKONTRA');
  assert.equal(game.state.kontraLevel, 'SUBKONTRA');
  // P1 daje mortkontru
  game.kontra(1, 'MORTKONTRA');
  assert.equal(game.state.kontraLevel, 'MORTKONTRA');
  // Prebaci u PLAYING (mortkontra je kraj)
  assert.equal(game.state.phase, 'PLAYING');
});

test('e2e: Mortkontra, nosilac ipak PROŠAO — kontraš dobija supe na ZAJEDNIČKE štihove cele odbrane, ne samo svoje lične', () => {
  // Uzivo prijavljen bag: nosilac uspeo uprkos mortkontri (kontraš izgubio
  // opkladu, bula mu ispravno raste) — ALI supe su se ranije racunale SAMO
  // na kontraseve licne stihove, ignorisuci stihove DRUGOG pratioca, iako
  // RULES 6.3 kaze da kontras "snosi svu odgovornost" za CELU odbranu.
  const game = new Game({ seed: 600 });
  game.newHand(0); // bidStartPlayer = P1
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref'); // vrednost 5
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.kontra(0, 'KONTRA'); // P0 = kontraš
  game.kontra(1, 'REKONTRA');
  game.kontra(0, 'SUBKONTRA');
  game.kontra(1, 'MORTKONTRA');
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac (P1) uzima 8 stihova (>= 6 potrebnih za Tref) -> PROLAZI.
  // Odbrana ZAJEDNO uzima 2 (P0 kontraš uzeo 0 licno, P2 uzeo 2).
  game.state.players[1]!.tricksWon = 8;
  game.state.players[0]!.tricksWon = 0;
  game.state.players[2]!.tricksWon = 2;
  const bulasBefore = [...game.state.bulas];
  const result = game.endHand();

  assert.equal(result.passed, true, 'nosilac prosao (8 >= 6)');
  assert.equal(result.bulas[1], bulasBefore[1]! - 5 * 2 * 16, 'nosilac se spusta za igra*2*mortkontra');
  assert.equal(result.bulas[0], bulasBefore[0]! + 5 * 2 * 16, 'kontras (izgubio opkladu) raste za isti iznos');
  assert.equal(result.bulas[2], bulasBefore[2]!, 'drugi pratilac (ne-kontras) NEMA promenu bule (RULES 6.3)');
  // Supa: ZAJEDNICKI stihovi odbrane (0+2=2) * Tref(5) * 2 * mortkontra(16)
  assert.equal(result.supeDelta[0], 2 * 5 * 2 * 16, 'kontras dobija supu na ZAJEDNICKE stihove odbrane (2), ne samo svoje (0)');
  assert.equal(result.supeDelta[2], 0, 'drugi pratilac ne upisuje supe (RULES 6.3 — sve ide kontrasu)');
});

test('e2e: Kontra + Moze — samo KONTRA data, nosilac Moze', () => {
  const game = new Game({ seed: 700 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // P0 kontra
  game.kontra(0, 'KONTRA');
  // P1 moze
  game.moze(1);
  // Kraj kontra faze, PLAYING
  assert.equal(game.state.phase, 'PLAYING');
  assert.equal(game.state.kontraLevel, 'KONTRA');
});

test('e2e: Kontra — svi kažu Moze, nema kontre', () => {
  const game = new Game({ seed: 800 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // P0 moze
  game.moze(0);
  // P2 moze
  game.moze(2);
  // Bez kontre, PLAYING
  assert.equal(game.state.phase, 'PLAYING');
  assert.equal(game.state.kontraLevel, null);
});

test('e2e: declareGame validacija — igra mora biti >= contract', () => {
  const game = new Game({ seed: 900 });
  game.newHand(0);
  game.bid(1, 2);
  game.bid(2, 3);
  game.pass(0);
  // P1 je Mogu-eligible (bidLevel 2 < currentBid 3) — MORA potvrditi, ne sme
  // sam da podigne (potvrdjeno od korisnika).
  game.bid(1, 3); // Mogu 3
  game.bid(2, 4); // P2 drzi vrh (3) — sme podici
  game.bid(1, 4); // P1 opet Mogu-eligible — Mogu 4
  game.pass(2); // Contract 4 (Herc) — P1 pobedjuje
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  // Ne može Pik (2) jer je contract 4
  const ok = game.declareGame(1, 'Pik');
  assert.equal(ok, false);
  // Može Herc (4) ili jace
  const ok2 = game.declareGame(1, 'Herc');
  assert.equal(ok2, true);
});

test('e2e: Betl pad (bez kontre) — pratioci NEMAJU promenu bule, samo fiksne supe (RULES 9.4.1)', () => {
  // Uzivo prijavljen bag: pratioci su dobijali -6 bule (pola od 12) kad je
  // nosilac pao na Betlu bez kontre. Po RULES 9.4.1, Betl nikad ne daje bulu
  // pratiocima (ni pri uspehu ni pri padu) — samo fiksnih 60 supe po
  // pratiocu kad nosilac padne, bez obzira na stihove.
  const game = new Game({ seed: 300 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Betl');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac(P1) PADA — uzeo 1+ stih u Betlu
  game.state.players[1]!.tricksWon = 3;
  game.state.players[0]!.tricksWon = 1;
  game.state.players[2]!.tricksWon = 6;
  const result = game.endHand();

  assert.equal(result.passed, false, 'nosilac pao (Betl, uzeo >=1 stih)');
  assert.equal(result.bulas[1], 100 + 12, 'nosilac dize se 12 (Betl vrednost)');
  assert.equal(result.bulas[0], 100, 'pratilac NEMA promenu bule u Betlu (samo fiksne supe)');
  assert.equal(result.bulas[2], 100, 'pratilac NEMA promenu bule u Betlu (samo fiksne supe)');
  assert.equal(result.supeDelta[0], 60, 'fiksnih 60 supe, bez obzira na broj stihova (1)');
  assert.equal(result.supeDelta[2], 60, 'fiksnih 60 supe, bez obzira na broj stihova (6)');
});

test('e2e: Betl — kontra JE dozvoljena (RULES 6.9)', () => {
  const game = new Game({ seed: 1000 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Betl');
  // Svi auto-prate (RULES 5.1), ali kontra ostaje moguca (RULES 6.9)
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  const ok = game.kontra(0, 'KONTRA');
  assert.equal(ok, true);
  assert.equal(game.state.kontraLevel, 'KONTRA');
});

test('e2e: Sans — kontra JE dozvoljena (RULES 6.9)', () => {
  const game = new Game({ seed: 1100 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Sans');
  // Faza FOLLOW_DECLARING (Sans nema auto-pracenje, ali ima kontru)
  assert.equal(game.state.phase, 'FOLLOW_DECLARING');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // Posle praćenja, KONTRA_DECLARING (RULES 6.9)
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  const ok = game.kontra(0, 'KONTRA');
  assert.equal(ok, true);
});

test('e2e: getLegalActions() ne nudi Mogu/BID posle "Igra" (RULES 3.4/3.4.1) — fuzz-otkriven bag', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  const first = game.state.currentBidder;
  assert.equal(game.sayIgra(first), true);
  const actions = game.getLegalActions();
  const types = actions.map(a => a.type);
  assert.ok(!types.includes('bid'), 'BID ne sme biti ponudjen dok je numericka licitacija zamrznuta (igraPlayer !== null)');
  assert.ok(!types.includes('mogu'), 'MOGU ne sme biti ponudjen dok je numericka licitacija zamrznuta');
  assert.ok(types.includes('pass'), 'PASS ostaje uvek dozvoljen');
});

test('e2e: lastHandResult se resetuje na null kad SVI kazu "dalje" bez ijedne licitacije (RULES 7.1 slucaj 1)', () => {
  const game = new Game({ seed: 2 });
  game.newHand(0);
  game.state.lastHandResult = { bulas: [90, 100, 110], supeDelta: [0, 0, 0], passed: true, winner: 0, winnerGame: 'Karo', kontraLevel: null, refeConsumed: null, refeActive: false, bulasAfter: [90, 100, 110] };
  game.pass(game.state.currentBidder);
  game.pass(game.state.currentBidder);
  game.pass(game.state.currentBidder);
  assert.equal(game.state.lastHandResult, null, 'refe/redeal posle "svi dalje" ne sme ostaviti stari lastHandResult');
});

test('e2e: Sans — prvi igrač je onaj NEPOSREDNO PRE nosioca u redosledu bacanja (RULES 8.1.3)', () => {
  const game = new Game({ seed: 1100 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Sans');
  assert.equal(game.state.winner, 1);
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  // Niko ne da kontru — obojica kazu "Moze" da se predje na PLAYING.
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');
  // Redosled bacanja: Jug(0)->Istok(1)->Zapad(2)->Jug (potvrdjeno uzivo od
  // korisnika). Nosilac (winner=1=Istok) — onaj neposredno PRE njega u tom
  // redosledu je Jug(0), tj. (winner+2)%3 = (1+2)%3 = 0. NE (winner+1)%3=2
  // (Zapad) — to je bio uzivo prijavljen bag (2026-09-05) posle pogresne
  // izmene ranije iste sesije.
  assert.equal(game.state.currentPlayer, 0, 'pratilac neposredno pre nosioca (u redosledu bacanja) kreće prvi u Sansu');
});

test('e2e: Betl — kontra: OBA pratioca upisuju fiksne supe, ne samo kontraš (RULES 9.4.1)', () => {
  const game = new Game({ seed: 1000 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Betl');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.kontra(0, 'KONTRA');
  game.moze(1); // nosilac ne die rekontru
  assert.equal(game.state.phase, 'PLAYING');

  // Nosilac (P1) pada — uzeo bar 1 stih.
  game.state.players[1]!.tricksWon = 2;
  game.state.players[0]!.tricksWon = 5;
  game.state.players[2]!.tricksWon = 3;
  const result = game.endHand();

  assert.equal(result.passed, false, 'nosilac pao');
  // Fiksnih 60 × kontra(2) = 120, za OBA pratioca — ne samo za P0 (kontraš).
  assert.equal(result.supeDelta[0], 120, 'kontraš (P0) upisuje 120 supe');
  assert.equal(result.supeDelta[2], 120, 'drugi pratilac (P2) TAKOĐE upisuje 120 supe u Betlu — RULES 9.4.1 je izuzetak od opšteg "samo kontraš upisuje" pravila (9.4/6.3)');
});

test('e2e: Kompletna partija sa igrama do kraja', () => {
  const game = new Game({ seed: 1200 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // KONTRA_DECLARING — oba kažu Moze
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.moze(0);
  game.moze(2);
  // Igraj 10 štihova
  assert.equal(game.state.phase, 'PLAYING');
  while (game.state.phase === 'PLAYING') {
    const player = game.state.currentPlayer;
    const legal = game.getLegalCards(player);
    if (legal.length === 0) break;
    const cardId = legal[0]!.id;
    if (!game.playCard(player, cardId)) break;
  }
  assert.equal(game.state.phase, 'GAME_OVER');
  const totalBule = game.state.bulas[0] + game.state.bulas[1] + game.state.bulas[2];
  // Bule se dele: nosilac dobija ili gubi, pratioci dele gubitak
  // Ako nosilac prodje — nosilac +, pratioci 0 (ili - za kontra)
  // Ako nosilac padne — nosilac -, pratioci dele +
  // Total treba biti u opsegu (100*3=300 minimum, do 400+ ako ima puno kontra)
  assert.ok(totalBule >= 200 && totalBule <= 500, `Bule: ${game.state.bulas.join(', ')}`);
});

test('e2e: Igra-Karo — igrač ne uzima talon', () => {
  const game = new Game({ seed: 1300 });
  game.newHand(0);
  // P1 kaže "dalje", pa P2 kaže Igra
  game.pass(1);
  game.sayIgra(2);
  // biddingStart (P0) mora da odgovori
  game.pass(0);
  // Winner = P2, phase = DECLARING (jos treba da imenuje igru)
  assert.equal(game.state.winner, 2);
  assert.equal(game.state.phase, 'DECLARING');
  game.declareIgra(2, 'Igra-Karo');
  // P2 ima 10 karata (nije uzeo talon)
  assert.equal(game.state.players[2]!.hand.length, 10);
  // Talon netaknut
  assert.equal(game.state.talon.length, 2);
});

test('e2e: Discarting fails ako nisu dve različite karte', () => {
  const game = new Game({ seed: 1400 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  // Istu kartu dva puta
  const ok1 = game.discard(1, [hand[0]!.id, hand[0]!.id]);
  assert.equal(ok1, false);
  // Nepostojeća karta
  const ok2 = game.discard(1, [hand[0]!.id, 'FAKE']);
  assert.equal(ok2, false);
});

test('e2e: currentPlayer određen ispravno posle declareGame', () => {
  const game = new Game({ seed: 1500 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Herc');
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  // KONTRA_DECLARING — oba Moze
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');
  // Po RULES.md, prvi igra onaj koji je prvi licitirao (bidStartPlayer)
  assert.equal(game.state.currentPlayer, 1);
});

test('e2e: runda se automatski prekida cim je nosilac IZVESTNO pao (5. protivnicki stih) — ne igraju se sva 10', () => {
  const game = new Game({ seed: 1600 });
  game.newHand(0);
  game.bid(1, 2);
  game.pass(2);
  game.pass(0);
  const hand = game.state.players[1]!.hand;
  game.discard(1, [hand[0]!.id, hand[1]!.id]);
  game.declareGame(1, 'Tref'); // adut ♣, potrebno 6/10 za prolaz
  game.follow(0, 'DODJEM');
  game.follow(2, 'DODJEM');
  game.moze(0);
  game.moze(2);
  assert.equal(game.state.phase, 'PLAYING');

  // Simuliraj da su vec odigrana 4 stiha: nosilac (1) 0, pratioci (0,2) po 2.
  // Ukupno protivnika = 4 — JOS NIJE dovoljno za automatski prekid (prag je 5).
  game.state.trickCount = 4;
  game.state.players[0]!.tricksWon = 2;
  game.state.players[1]!.tricksWon = 0;
  game.state.players[2]!.tricksWon = 2;
  game.state.currentTrick = [];
  game.state.currentPlayer = 1; // nosilac vodi

  // Namesteno tako da igrac 0 SIGURNO uzme ovaj stih (adut), a igrac 2 je
  // prazan i u vodjenoj boji i u adutu (slobodan izbor, ne moze da pobedi).
  game.state.players[1]!.hand = [makeCard('♠', '7')];
  game.state.players[2]!.hand = [makeCard('♦', '8')];
  game.state.players[0]!.hand = [makeCard('♣', '9')];

  assert.equal(game.state.declaredGame, 'Tref');

  // 1) Nosilac (1) vodi ♠7 (void kod ostalih -> prisiljeni)
  let ok = game.playCard(1, game.state.players[1]!.hand[0]!.id);
  assert.equal(ok, true);
  assert.equal(game.state.phase, 'PLAYING', 'jos nije kraj — stih u toku');

  // 2) Igrac 2 nema ♠ ni ♣ -> slobodan izbor, igra ♦ (ne moze pobediti)
  const p2card = game.state.players[2]!.hand[0]!;
  ok = game.playCard(2, p2card.id);
  assert.equal(ok, true);

  // 3) Igrac 0 nema ♠, ima ♣ (adut) -> PRISILJEN da igra adut, pobedjuje stih
  const p0card = game.state.players[0]!.hand[0]!;
  assert.equal(p0card.suit, '♣');
  ok = game.playCard(0, p0card.id);
  assert.equal(ok, true);

  // Stih #5 protivnika (0:3, 2:2 = 5 ukupno) -> nosilac SIGURNO pao (potreban
  // mu je 6/10, a protivnici vec imaju 5 -> nosiocu ostaje najvise 5).
  // Runda MORA da se prekine ODMAH, bez igranja preostalih stihova.
  assert.equal(game.state.phase, 'GAME_OVER', 'runda se prekida cim je pad izvestan');
  assert.equal(game.state.trickCount, 5, 'stalo tacno na 5. stihu, ne na 10.');
  assert.equal(game.state.players[0]!.tricksWon, 3);
  assert.equal(game.state.players[1]!.tricksWon, 0);
  assert.equal(game.state.players[2]!.tricksWon, 2);
});
