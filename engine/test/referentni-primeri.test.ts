// Direktna provera svih 15 referentnih rundi iz REFERENTNI_PRIMERI.md protiv
// engine-a — tacne karte, tok igre, i ocekivana bula/supe na kraju svake
// rundi. Mapiranje sedista (konzistentno kroz ceo dokument, potvrdjeno preko
// "Delilac" rotacije): Mirko=0, Darko=1, Janko=2.
//
// NAPOMENE O DOKUMENTU (otkriveno kroz ovu proveru):
// - Licitacija se NE replicira dugme-po-dugme: korisnik je potvrdio da
//   Runda #1 ima gresku (Janko-prvi-potez-Mogu), i "Mogu-eligible ne sme
//   sam da podigne" je strozije uskladjeno POSLE nego kad je dokument
//   pisan. Umesto toga koristimo MINIMALNU legalnu licitaciju (declarer
//   bid 2, ostali dalje) — declareGame/declareIgra prihvata bilo koju igru
//   >= contract, pa je ovo uvek validno i ne utice na scoring.
// - Odbacene karte iz "Razmena talona" su MESTIMICNO pogresne (npr. runde
//   #2 i #3 pominju karte koje deklarant uopste nema u ruci — ocigledan
//   copy-paste artefakt). Scoring ne zavisi od TOG IZBORA karata, pa
//   odbacujemo bilo koje 2 validne karte iz stvarne ruke.
// - Redosled davanja kontre kad SU OBA pratioca DODJEM (runde #10, #11) se
//   mestimicno ne poklapa sa "desni od nosioca prvi" (RULES 5.1, formula
//   (winner+2)%3 — potvrdjena ranije UZIVO od korisnika i konzistentna sa
//   rundama #1,#5,#7,#9,#13,#14). Kad se ne poklapa, koristimo ONOGA koga
//   engine ispravno bira (expectedKontraPlayerPublic()) i preracunavamo
//   ocekivani rezultat za NJEGA — brojevi ispadaju identicni bez obzira ko
//   je tacno kontras, jer formula zavisi samo od stihova, ne od identiteta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { makeCard } from '../src/cards.ts';
import type { Card, Position } from '../src/types.ts';

function C(s: string): Card {
  const suit = s.slice(-1);
  const rank = s.slice(0, -1);
  return makeCard(suit as never, rank as never);
}

function setupHands(
  game: Game,
  mirko: string[],
  darko: string[],
  janko: string[],
  talon: string[],
) {
  game.state.players[0]!.hand = mirko.map(C);
  game.state.players[1]!.hand = darko.map(C);
  game.state.players[2]!.hand = janko.map(C);
  game.state.talon = talon.map(C);
}

function winBidding(game: Game, declarer: Position) {
  let safety = 0;
  while (game.state.phase === 'BIDDING' && safety++ < 10) {
    const cur = game.state.currentBidder;
    if (cur === declarer) {
      if (game.state.currentBid === 0) game.bid(declarer, 2);
      else break;
    } else {
      game.pass(cur);
    }
  }
}

function winIgra(game: Game, declarer: Position) {
  let safety = 0;
  while (game.state.phase === 'BIDDING' && safety++ < 10) {
    const cur = game.state.currentBidder;
    if (cur === declarer) {
      if (game.state.igraPlayer === null) game.sayIgra(declarer);
      else break;
    } else {
      game.pass(cur);
    }
  }
}

// Odbacuje bilo koje 2 validne karte iz TRENUTNE ruke (12 karata posle
// talona) — dokument mestimicno pominje pogresne karte za odbacivanje
// (copy-paste greska), a scoring ne zavisi od izbora.
function discardAny(game: Game, player: Position) {
  const hand = game.state.players[player]!.hand;
  assert.equal(hand.length, 12, `${player} treba da ima 12 karata pre odbacivanja`);
  const ok = game.discard(player, [hand[0]!.id, hand[1]!.id]);
  assert.equal(ok, true, `discard(${player}) treba da uspe`);
}

test('REFERENTNI_PRIMERI Runda #1 — Mirko Tref, Darko zove Janka, Kontra->Rekontra', () => {
  const game = new Game({ seed: 1 });
  game.newHand(2); // Delilac Janko
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 0);
  discardAny(game, 0);
  assert.equal(game.declareGame(0, 'Tref'), true);
  game.follow(1, 'DODJEM');
  game.follow(2, 'NE_DODJEM');
  assert.equal(game.call(1, 2), true);
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  assert.equal(game.expectedKontraPlayerPublic(), 1, 'samo Darko (pravi DODJEM) odlucuje o kontri');
  assert.equal(game.kontra(1, 'KONTRA'), true);
  assert.equal(game.kontra(0, 'REKONTRA'), true);

  game.state.players[0]!.tricksWon = 7;
  game.state.players[1]!.tricksWon = 3;
  game.state.players[2]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.passed, true);
  assert.equal(r.bulas[0], 100 - 40, 'Mirko spusta se 40 (10*4)');
  assert.equal(r.bulas[1], 100 + 40, 'Darko (kontras, izgubio) dize se 40');
  assert.equal(r.bulas[2], 100, 'Janko (pozvan) bez promene bule');
  assert.equal(r.supeDelta[1], 120, 'Darko supe = (3+0 sabrano) * 5 * 2 * 4 = 120');
  assert.equal(r.supeDelta[2], 0, 'Janko (pozvan) ne upisuje supe');
});

test('REFERENTNI_PRIMERI Runda #2 — Darko Herc, oba dosla nezavisno, bez kontre', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0); // Delilac Mirko
  setupHands(
    game,
    ['7♠', '9♥', '8♥', '7♥', 'Q♦', '8♦', '7♦', 'K♣', 'J♣', '10♣'],
    ['A♠', 'K♠', 'Q♠', 'J♠', '10♠', 'A♥', 'Q♥', 'K♦', 'J♦', '9♣'],
    ['9♠', '8♠', 'K♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'Q♣'],
    ['8♣', '7♣'],
  );
  winBidding(game, 1);
  discardAny(game, 1);
  assert.equal(game.declareGame(1, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(0, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.moze(game.expectedKontraPlayerPublic()!);
  game.moze(game.expectedKontraPlayerPublic()!);
  assert.equal(game.state.phase, 'PLAYING');

  game.state.players[1]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 3;
  game.state.players[0]!.tricksWon = 1;
  const r = game.endHand();

  assert.equal(r.passed, true);
  assert.equal(r.bulas[1], 100 - 8, 'Darko spusta se 8');
  assert.equal(r.bulas[2], 100, 'Janko (3 stiha >=2) prolazi bez promene bule');
  assert.equal(r.bulas[0], 100 + 8, 'Mirko (1 stih <2) PADA za ceo iznos');
  assert.equal(r.supeDelta[2], 24, 'Janko supe = 3*8');
  assert.equal(r.supeDelta[0], 8, 'Mirko supe = 1*8');
});

test('REFERENTNI_PRIMERI Runda #3 — Mirko Herc, Janko igra sam', () => {
  const game = new Game({ seed: 1 });
  game.newHand(1); // Delilac Darko
  setupHands(
    game,
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 0);
  discardAny(game, 0);
  assert.equal(game.declareGame(0, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(1, 'NE_DODJEM');
  assert.equal(game.continueWithoutCall(), true);
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  game.moze(game.expectedKontraPlayerPublic()!);
  assert.equal(game.state.phase, 'PLAYING');

  game.state.players[0]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 4;
  game.state.players[1]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.bulas[0], 100 - 8);
  assert.equal(r.bulas[2], 100, 'Janko (solo, 4>=2) prolazi bez promene bule');
  assert.equal(r.bulas[1], 100);
  assert.equal(r.supeDelta[2], 32, 'Janko supe = 4*8');
});

test('REFERENTNI_PRIMERI Runda #4 — Mirko Igra->Betl (auto-prati), Darko kontra, Betl uspeo', () => {
  const game = new Game({ seed: 1 });
  game.newHand(2); // Delilac Janko
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', 'J♠', '10♠', 'A♥', 'Q♥', 'K♦', 'J♦', '9♣'],
    ['9♠', '8♠', 'K♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'Q♣'],
    ['7♠', '9♥', '8♥', '7♥', 'Q♦', '8♦', '7♦', 'K♣', 'J♣', '10♣'],
    ['8♣', '7♣'],
  );
  winIgra(game, 0);
  assert.equal(game.state.phase, 'DECLARING');
  assert.equal(game.declareIgra('Igra-Betl'), true);
  assert.equal(game.state.talon.length, 2, 'talon se NE uzima kod Igra');
  assert.equal(game.state.players[0]!.hand.length, 10);
  // Popravljen bag ove sesije: Igra-Betl MORA auto-pratiti kao obican Betl
  // (RULES 5.1) — ranije je uvek islo na rucno Dodjem/Ne dodjem.
  assert.equal(game.state.phase, 'KONTRA_DECLARING', 'Igra-Betl auto-prati, ide direktno na kontru');
  assert.deepEqual(game.state.followChoices, ['DODJEM', 'DODJEM', 'DODJEM']);
  // Dokument navodi Darka kao kontrasa, ali to je van reda (isti obrazac kao
  // runde #10/#11) — koristimo koga engine ispravno bira.
  const kontras = game.expectedKontraPlayerPublic()!;
  assert.equal(game.kontra(kontras, 'KONTRA'), true);
  const nonKontras = (kontras === 1 ? 2 : 1) as Position;

  game.state.players[0]!.tricksWon = 0;
  game.state.players[kontras]!.tricksWon = 6;
  game.state.players[nonKontras]!.tricksWon = 4;
  const r = game.endHand();

  assert.equal(r.passed, true, 'Betl uspeo (0 stihova)');
  assert.equal(r.bulas[0], 100 - 28, 'Mirko spusta se 28 (14*2)');
  assert.equal(r.bulas[kontras], 100 + 28, 'kontras (izgubio) dize se 28');
  assert.equal(r.bulas[nonKontras], 100);
  assert.equal(r.supeDelta[kontras], 0, 'Betl USPEO — nema supe uopste (RULES 9.4.1)');
  assert.equal(r.supeDelta[nonKontras], 0);
});

test('REFERENTNI_PRIMERI Runda #5 — Darko Herc, Janko zove Mirka, Janko kontra i pada', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0); // Delilac Mirko
  setupHands(
    game,
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 1);
  discardAny(game, 1);
  assert.equal(game.declareGame(1, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(0, 'NE_DODJEM');
  assert.equal(game.call(2, 0), true);
  assert.equal(game.expectedKontraPlayerPublic(), 2, 'samo Janko (pravi DODJEM) odlucuje o kontri');
  assert.equal(game.kontra(2, 'KONTRA'), true);

  game.state.players[1]!.tricksWon = 7;
  game.state.players[2]!.tricksWon = 3;
  game.state.players[0]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.passed, true);
  assert.equal(r.bulas[1], 100 - 16, 'Darko spusta se 16 (8*2)');
  assert.equal(r.bulas[2], 100 + 16, 'Janko (kontras, izgubio) dize se 16');
  assert.equal(r.bulas[0], 100);
  assert.equal(r.supeDelta[2], 48, 'Janko supe = (3+0 sabrano) * 4 * 2 * 2 = 48');
});

test('REFERENTNI_PRIMERI Runda #6 — Mirko Herc, oba dosla nezavisno, tacno 2 stiha svaki', () => {
  const game = new Game({ seed: 1 });
  game.newHand(1); // Delilac Darko
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', 'J♠', '10♠', 'A♥', 'Q♥', 'K♦', 'J♦', '9♣'],
    ['7♠', '9♥', '8♥', '7♥', 'Q♦', '8♦', '7♦', 'K♣', 'J♣', '10♣'],
    ['9♠', '8♠', 'K♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'Q♣'],
    ['8♣', '7♣'],
  );
  winBidding(game, 0);
  discardAny(game, 0);
  assert.equal(game.declareGame(0, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(1, 'DODJEM');
  game.moze(game.expectedKontraPlayerPublic()!);
  game.moze(game.expectedKontraPlayerPublic()!);
  assert.equal(game.state.phase, 'PLAYING');

  game.state.players[0]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 2;
  game.state.players[1]!.tricksWon = 2;
  const r = game.endHand();

  assert.equal(r.bulas[0], 100 - 8);
  assert.equal(r.bulas[2], 100, 'tacno 2 stiha — prolazi bez promene bule');
  assert.equal(r.bulas[1], 100, 'tacno 2 stiha — prolazi bez promene bule');
  assert.equal(r.supeDelta[2], 16);
  assert.equal(r.supeDelta[1], 16);
});

test('REFERENTNI_PRIMERI Runda #7 — Darko Karo, Mirko zove Janka, Mirko kontra, Darko rekontra', () => {
  const game = new Game({ seed: 1 });
  game.newHand(2); // Delilac Janko
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 1);
  discardAny(game, 1);
  assert.equal(game.declareGame(1, 'Karo'), true);
  game.follow(0, 'DODJEM');
  game.follow(2, 'NE_DODJEM');
  assert.equal(game.call(0, 2), true);
  assert.equal(game.expectedKontraPlayerPublic(), 0, 'samo Mirko (pravi DODJEM) odlucuje o kontri');
  assert.equal(game.kontra(0, 'KONTRA'), true);
  assert.equal(game.kontra(1, 'REKONTRA'), true);

  game.state.players[1]!.tricksWon = 7;
  game.state.players[0]!.tricksWon = 3;
  game.state.players[2]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.passed, true);
  assert.equal(r.bulas[1], 100 - 24, 'Darko spusta se 24 (6*4)');
  assert.equal(r.bulas[0], 100 + 24, 'Mirko (kontras, izgubio) dize se 24');
  assert.equal(r.bulas[2], 100);
  assert.equal(r.supeDelta[0], 72, 'Mirko supe = (3+0) * 3 * 2 * 4 = 72');
});

test('REFERENTNI_PRIMERI Runda #8 — Darko Herc, oba dosla nezavisno, bez kontre (isto kao #2)', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  setupHands(
    game,
    ['7♠', '9♥', '8♥', '7♥', 'Q♦', '8♦', '7♦', 'K♣', 'J♣', '10♣'],
    ['A♠', 'K♠', 'Q♠', 'J♠', '10♠', 'A♥', 'Q♥', 'K♦', 'J♦', '9♣'],
    ['9♠', '8♠', 'K♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'Q♣'],
    ['8♣', '7♣'],
  );
  winBidding(game, 1);
  discardAny(game, 1);
  assert.equal(game.declareGame(1, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(0, 'DODJEM');
  game.moze(game.expectedKontraPlayerPublic()!);
  game.moze(game.expectedKontraPlayerPublic()!);

  game.state.players[1]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 3;
  game.state.players[0]!.tricksWon = 1;
  const r = game.endHand();

  assert.equal(r.bulas[1], 100 - 8);
  assert.equal(r.bulas[2], 100);
  assert.equal(r.bulas[0], 100 + 8);
  assert.equal(r.supeDelta[2], 24);
  assert.equal(r.supeDelta[0], 8);
});

test('REFERENTNI_PRIMERI Runda #9 — Mirko Herc, Janko zove Darka, Janko kontra i pada', () => {
  const game = new Game({ seed: 1 });
  game.newHand(1); // Delilac Darko
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 0);
  discardAny(game, 0);
  assert.equal(game.declareGame(0, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(1, 'NE_DODJEM');
  assert.equal(game.call(2, 1), true);
  assert.equal(game.expectedKontraPlayerPublic(), 2);
  assert.equal(game.kontra(2, 'KONTRA'), true);
  assert.equal(game.kontra(0, 'REKONTRA'), true);

  game.state.players[0]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 4;
  game.state.players[1]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.passed, true);
  assert.equal(r.bulas[0], 100 - 32, 'Mirko spusta se 32 (8*4)');
  assert.equal(r.bulas[2], 100 + 32, 'Janko (kontras, izgubio) dize se 32');
  assert.equal(r.bulas[1], 100);
  assert.equal(r.supeDelta[2], 128, 'Janko supe = (4+0) * 4 * 2 * 4 = 128');
});

test('REFERENTNI_PRIMERI Runda #10 — Mirko Igra->Sans, kontra dat, rekontra, Sans uspeo', () => {
  // Dokument navodi da Darko daje kontru, ali to je van reda (RULES 5.1,
  // formula potvrdjena rundama #1/#5/#7/#9/#13/#14) kad su OBA pratioca
  // nezavisno DODJEM — koristimo koga engine ispravno bira. Brojevi
  // ispadaju identicni jer formula zavisi samo od stihova, ne od identiteta.
  const game = new Game({ seed: 1 });
  game.newHand(2);
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', 'J♠', '10♠', 'A♥', 'Q♥', 'K♦', 'J♦', '9♣'],
    ['9♠', '8♠', 'K♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'Q♣'],
    ['7♠', '9♥', '8♥', '7♥', 'Q♦', '8♦', '7♦', 'K♣', 'J♣', '10♣'],
    ['8♣', '7♣'],
  );
  winIgra(game, 0);
  assert.equal(game.declareIgra('Igra-Sans'), true);
  assert.equal(game.state.talon.length, 2);
  game.follow(1, 'DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.state.phase, 'KONTRA_DECLARING');
  const kontras = game.expectedKontraPlayerPublic()!;
  assert.equal(game.kontra(kontras, 'KONTRA'), true);
  assert.equal(game.kontra(0, 'REKONTRA'), true);
  const nonKontras = (kontras === 1 ? 2 : 1) as Position;

  game.state.players[0]!.tricksWon = 6;
  game.state.players[kontras]!.tricksWon = 4;
  game.state.players[nonKontras]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.passed, true);
  assert.equal(r.bulas[0], 100 - 64, 'Mirko spusta se 64 (16*4)');
  assert.equal(r.bulas[kontras], 100 + 64, 'kontras (izgubio) dize se 64');
  assert.equal(r.bulas[nonKontras], 100);
  assert.equal(r.supeDelta[kontras], 256, 'kontras supe = 4 * 8 * 2 * 4 = 256 (Igra-Sans raw vrednost 8)');
});

test('REFERENTNI_PRIMERI Runda #11 — Darko Herc, oba dosla, kontras POBEDJUJE (nosilac pao)', () => {
  // Isto kao runda #10 — dokument navodi Janka kao kontrasa, van reda po
  // istoj formuli; koristimo koga engine ispravno bira.
  const game = new Game({ seed: 1 });
  game.newHand(0);
  setupHands(
    game,
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 1);
  discardAny(game, 1);
  assert.equal(game.declareGame(1, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(0, 'DODJEM');
  const kontras = game.expectedKontraPlayerPublic()!;
  assert.equal(game.kontra(kontras, 'KONTRA'), true);
  assert.equal(game.moze(1), true, 'nosilac prihvata kontru bez rekontre');
  const nonKontras = (kontras === 0 ? 2 : 0) as Position;

  game.state.players[1]!.tricksWon = 5; // PAO (< 6)
  game.state.players[kontras]!.tricksWon = 5;
  game.state.players[nonKontras]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.passed, false, 'nosilac pao (5 < 6)');
  assert.equal(r.bulas[1], 100 + 16, 'Darko dize se 16 (8*2)');
  assert.equal(r.bulas[kontras], 100, 'kontras (POBEDIO) — bula NEPROMENJENA, samo supe');
  assert.equal(r.bulas[nonKontras], 100, 'ne-kontras bez promene');
  // Dokument: "5 x 8 x 2 = 80" gde je 5 = ODBRANA ZAJEDNO (kontras+ne-kontras
  // = 5+0), ne nosiočevi stihovi — ovde su slucajno oba 5, pa formula ne
  // razlikuje; vidi e2e.test.ts test sa 4+1 razlicitim od nosiočevih 3.
  assert.equal(r.supeDelta[kontras], 80, 'kontras supe = ODBRANA ZAJEDNO(5+0) * 4 * 2 * 2 = 80');
  assert.equal(r.supeDelta[nonKontras], 0);
});

test('REFERENTNI_PRIMERI Runda #12 — Mirko Herc, Janko igra sam (isto kao #3)', () => {
  const game = new Game({ seed: 1 });
  game.newHand(1);
  setupHands(
    game,
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 0);
  discardAny(game, 0);
  assert.equal(game.declareGame(0, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(1, 'NE_DODJEM');
  assert.equal(game.continueWithoutCall(), true);
  game.moze(game.expectedKontraPlayerPublic()!);

  game.state.players[0]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 4;
  game.state.players[1]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.bulas[0], 100 - 8);
  assert.equal(r.bulas[2], 100);
  assert.equal(r.supeDelta[2], 32);
});

test('REFERENTNI_PRIMERI Runda #13 — Mirko Herc, Janko zove Darka, Janko kontra i pada', () => {
  const game = new Game({ seed: 1 });
  game.newHand(2);
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 0);
  discardAny(game, 0);
  assert.equal(game.declareGame(0, 'Herc'), true);
  game.follow(1, 'NE_DODJEM');
  game.follow(2, 'DODJEM');
  assert.equal(game.call(2, 1), true);
  assert.equal(game.kontra(2, 'KONTRA'), true);
  assert.equal(game.moze(0), true);

  game.state.players[0]!.tricksWon = 7;
  game.state.players[2]!.tricksWon = 3;
  game.state.players[1]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.passed, true);
  assert.equal(r.bulas[0], 100 - 16, 'Mirko spusta se 16 (8*2)');
  assert.equal(r.bulas[2], 100 + 16, 'Janko (kontras, izgubio) dize se 16');
  assert.equal(r.bulas[1], 100);
  assert.equal(r.supeDelta[2], 48, 'Janko supe = (3+0) * 4 * 2 * 2 = 48');
});

test('REFERENTNI_PRIMERI Runda #14 — Darko Igra->Betl (auto-prati), Mirko kontra, Darko rekontra, uspeo', () => {
  const game = new Game({ seed: 1 });
  game.newHand(0);
  setupHands(
    game,
    ['7♠', '9♥', '8♥', '7♥', 'Q♦', '8♦', '7♦', 'K♣', 'J♣', '10♣'],
    ['A♠', 'K♠', 'Q♠', 'J♠', '10♠', 'A♥', 'Q♥', 'K♦', 'J♦', '9♣'],
    ['9♠', '8♠', 'K♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'Q♣'],
    ['8♣', '7♣'],
  );
  winIgra(game, 1);
  assert.equal(game.declareIgra('Igra-Betl'), true);
  assert.equal(game.state.phase, 'KONTRA_DECLARING', 'Igra-Betl auto-prati (popravljen bag)');
  assert.equal(game.expectedKontraPlayerPublic(), 0, 'Mirko je desni od Darka — konzistentno sa formulom');
  assert.equal(game.kontra(0, 'KONTRA'), true);
  assert.equal(game.kontra(1, 'REKONTRA'), true);

  game.state.players[1]!.tricksWon = 0;
  game.state.players[0]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 4;
  const r = game.endHand();

  assert.equal(r.passed, true, 'Betl uspeo');
  assert.equal(r.bulas[1], 100 - 56, 'Darko spusta se 56 (14*4)');
  assert.equal(r.bulas[0], 100 + 56, 'Mirko (kontras, izgubio) dize se 56');
  assert.equal(r.bulas[2], 100);
  assert.equal(r.supeDelta[0], 0, 'Betl USPEO — nema supe uopste');
});

test('REFERENTNI_PRIMERI Runda #15 — Mirko Herc, Janko igra sam (isto kao #3/#12)', () => {
  const game = new Game({ seed: 1 });
  game.newHand(1);
  setupHands(
    game,
    ['A♠', 'K♠', 'Q♠', '10♠', '9♠', 'A♥', 'K♥', 'Q♦', 'J♦', '7♣'],
    ['J♠', '8♠', 'Q♥', 'J♥', '10♥', 'A♦', '10♦', '9♦', 'A♣', 'K♣'],
    ['7♠', '9♥', '8♥', '7♥', 'K♦', '8♦', '7♦', 'Q♣', 'J♣', '10♣'],
    ['8♣', '9♣'],
  );
  winBidding(game, 0);
  discardAny(game, 0);
  assert.equal(game.declareGame(0, 'Herc'), true);
  game.follow(2, 'DODJEM');
  game.follow(1, 'NE_DODJEM');
  assert.equal(game.continueWithoutCall(), true);
  game.moze(game.expectedKontraPlayerPublic()!);

  game.state.players[0]!.tricksWon = 6;
  game.state.players[2]!.tricksWon = 4;
  game.state.players[1]!.tricksWon = 0;
  const r = game.endHand();

  assert.equal(r.bulas[0], 100 - 8);
  assert.equal(r.bulas[2], 100);
  assert.equal(r.supeDelta[2], 32);
});
