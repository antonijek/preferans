// Ispravke AI-ja iz korisnikove analize partije #18 (2026-10-27): Tdarko (0), Milan (1), Bora (2).
// Pozicije su prepisane iz zapisa partije; karte u ruci su one koje su igracu ostale u tom trenutku.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDeclarerTricks, estimatedMaxLevel, isIgraWorthy } from '../src/aiHandEval.ts';
import { chooseBidAction, chooseDeclareGame } from '../src/aiBidding.ts';
import { chooseFollow } from '../src/aiFollowKontra.ts';
import { choosePlayCard } from '../src/aiDiscardPlay.ts';
import { searchChoosePlayCard } from '../src/aiSearch.ts';
import { Game } from '../src/game.ts';
import type { Card, FollowChoice, Position, Suit } from '../src/types.ts';

const card = (x: string) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) }) as Card;
const hand = (s: string): Card[] => (s ? s.split(' ').map(card) : []);
// "0A♥ 29♥" = Tdarko A herc, Bora 9 herc
const trick = (s: string) => s.split(' ').map((x) => ({ player: Number(x[0]) as Position, card: card(x.slice(1)) }));

interface Position18 {
  game: 'Herc' | 'Karo' | 'Tref' | 'Igra-Herc' | 'Igra-Tref' | 'Betl';
  declarer: Position;
  follow: (FollowChoice | null)[];
  hands: [string, string, string];
  tricks: string[];
  current?: string;
  discard?: string;
  talon?: string;
}

const TRUMP: Record<Position18['game'], Suit | null> = {
  Herc: '♥', Karo: '♦', Tref: '♣', 'Igra-Herc': '♥', 'Igra-Tref': '♣', Betl: null,
};

function stateOf(p: Position18) {
  const g = new Game({ seed: 1 });
  const tricks = p.tricks.map(trick);
  const currentTrick = p.current ? trick(p.current) : [];
  const winnerOf = (t: ReturnType<typeof trick>) => {
    const led = t[0]!.card.suit;
    const trump = TRUMP[p.game];
    const value = (c: Card) => ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(c.rank);
    return t.reduce((best, x) => {
      if (x.card.suit === best.card.suit) return value(x.card) > value(best.card) ? x : best;
      return x.card.suit === trump || (x.card.suit === led && best.card.suit !== trump) ? x : best;
    }).player;
  };
  const leader = tricks.length > 0 ? winnerOf(tricks[tricks.length - 1]!) : p.declarer;
  const order = p.follow.map((f, i) => (f === 'NE_DODJEM' ? -1 : i)).filter((i) => i >= 0);
  const next = (q: number) => order[(order.indexOf(q) + 1) % order.length]!;
  let current = leader;
  for (let i = 0; i < currentTrick.length; i++) current = next(current);
  Object.assign(g.state, {
    phase: 'PLAYING', declaredGame: p.game, trump: TRUMP[p.game], winner: p.declarer, currentPlayer: current,
    currentTrick, tricks, trickCount: tricks.length, discard: hand(p.discard ?? ''), followChoices: p.follow,
    talon: hand(p.talon ?? ''),
  });
  for (let i = 0; i < 3; i++) g.state.players[i]!.hand = hand(p.hands[i]!);
  return g.state;
}

const rules = (p: Position18) => {
  const s = stateOf(p);
  const seat = s.currentPlayer;
  return choosePlayCard({
    hand: s.players[seat]!.hand, currentTrick: s.currentTrick, trump: s.trump, declaredGame: s.declaredGame!,
    winnerTricks: 0, avoidTricks: seat === s.winner && s.declaredGame === 'Betl', isDeclarer: seat === s.winner,
    myPosition: seat, declarer: s.winner, tricks: s.tricks, discard: s.discard,
    twoHanded: p.follow.includes('NE_DODJEM'),
  })!.id;
};
const search = (p: Position18) => {
  const s = stateOf(p);
  return searchChoosePlayCard(s, s.currentPlayer, 30).id;
};

// --- 1. Nosilac kad pratioci nemaju adut: aduti, sigurne karte, pa gubitnik ---

const H25: Position18 = {
  game: 'Tref', declarer: 2, follow: ['DODJEM', 'DODJEM', null], hands: ['K♥ A♥ 8♥', '7♥ J♥ J♠', 'Q♥ K♦ A♦'],
  tricks: ['08♦ 17♦ 29♦', '210♦ 07♣ 18♣', '1A♠ 2J♣ 07♠', '2J♦ 09♣ 110♣', '18♠ 2Q♣ 0Q♠', '2Q♦ 0A♣ 19♠', '0K♠ 110♠ 2K♣'],
  discard: '9♥ 10♥',
};

test('ruka 25: aduta vise nema — Bora prvo A i K karo (prolaz), D herc tek posle', () => {
  assert.equal(rules(H25)[1], '♦');
  assert.equal(search(H25).slice(-1), '♦');
});

const H32: Position18 = {
  game: 'Karo', declarer: 1, follow: ['DODJEM', null, 'NE_DODJEM'], 
  hands: ['10♥ A♥ K♥', '8♦ 9♦ 8♥', 'A♣ 9♥ J♠ J♥ 10♦ K♣ 9♠ Q♥ Q♦ Q♠'],
  tricks: ['0A♠ 17♦', '1A♦ 08♠', '1K♦ 010♠', '1J♦ 0K♠', '1J♣ 0Q♣', '09♣ 110♣', '18♣ 07♣'], discard: '7♥ 7♠',
};

test('ruka 32: Milan na kraju 2 aduta, pa 8 herc', () => {
  assert.equal(rules(H32).slice(-1), '♦');
  assert.equal(search(H32).slice(-1), '♦');
  const last2: Position18 = { ...H32, hands: ['A♥ K♥', '8♦ 8♥', H32.hands[2]], tricks: [...H32.tricks, '19♦ 010♥'] };
  assert.equal(rules(last2), '8♦');
});

const H2: Position18 = {
  game: 'Igra-Tref', declarer: 2, follow: ['DODJEM', 'NE_DODJEM', null],
  hands: ['J♠ Q♠ A♠', '9♣ 10♦ 7♠ K♦ 8♦ Q♣ 10♠ 9♠ 10♣ 8♠', 'K♠ 7♣ J♣'], talon: '9♦ 8♥',
  tricks: ['2A♣ 08♣', '2K♣ 09♥', '2A♥ 0J♥', '210♥ 0Q♥', '0K♥ 27♥', '0J♦ 2Q♦', '2A♦ 07♦'],
};

test('ruka 2: Bora 7 i J tref pre K pik (Darko mozda skarta pik)', () => {
  assert.equal(rules(H2).slice(-1), '♣');
  assert.equal(search(H2).slice(-1), '♣');
});

test('ruka 5: Bora adut pa 10 tref', () => {
  const h5: Position18 = {
    game: 'Igra-Herc', declarer: 2, follow: ['DODJEM', 'NE_DODJEM', null],
    hands: ['9♠ J♠', '8♠ K♦ 7♠ 9♣ K♠ 7♣ 10♦ J♣ 10♠ 9♦', '10♣ 7♥'], talon: '8♦ Q♥',
    tricks: ['2A♥ 0K♥', '2J♥ 07♦', '210♥ 08♣', '29♥ 0J♦', '28♥ 0Q♣', '2K♣ 0A♣', '0A♦ 2Q♦', '0Q♠ 2A♠'],
  };
  assert.equal(rules(h5), '7♥');
  assert.equal(search(h5), '7♥');
});

const MILAN16 = 'Q♦ 9♠ 10♠ A♣ Q♠ 10♥ 7♥ 10♦ 7♠ 9♣';
const H16: Position18 = {
  game: 'Igra-Herc', declarer: 2, follow: ['DODJEM', 'NE_DODJEM', null],
  hands: ['9♦ K♦ K♣ Q♣ J♠ K♠', MILAN16, 'A♦ J♦ 8♥ 8♦ A♠ 9♥'], talon: '7♦ 7♣',
  tricks: ['2A♥ 08♣', '2K♥ 010♣', '2Q♥ 0J♣', '2J♥ 08♠'],
};

test('ruka 16: Bora jos jednom adut, a poslednji cuva dok ima vise od 2 karte', () => {
  assert.equal(rules(H16), '9♥');
  assert.equal(search(H16).slice(-1), '♥');
  const after = { ...H16, hands: ['9♦ K♦ Q♣ J♠ K♠', MILAN16, 'A♦ J♦ 8♥ 8♦ A♠'] as [string, string, string],
    tricks: [...H16.tricks, '29♥ 0K♣'] };
  assert.equal(rules(after), 'A♠', 'sigurne karte, adut 8 ostaje za ulaz');
});

// --- 2. Nosilac sa 4 aduta (bez asa) koji je u 1. stihu morao da sece: duga boja, ne adut ---

test('ruka 3: Milan posle secenja igra pik, ne K herc', () => {
  const h3: Position18 = {
    game: 'Herc', declarer: 1, follow: ['DODJEM', null, 'DODJEM'],
    hands: ['A♥ 8♣ 7♥ 7♠ 8♥ K♣ 7♦ J♦ A♦', 'K♥ 10♥ Q♥ A♠ K♠ 8♠ K♦ Q♠ J♠', 'J♥ 9♣ 10♣ 9♠ 10♠ J♣ 10♦ Q♣ Q♦'],
    tricks: ['2A♣ 07♣ 19♥'], discard: '9♦ 8♦',
  };
  assert.equal(rules(h3), 'A♠');
  assert.equal(search(h3).slice(-1), '♠');
});

test('4 aduta, odgovori 2026-10-28: duga boja i kad je slaba, i kad je pratilac sece, i sa A,D,10,9', () => {
  const both: (FollowChoice | null)[] = ['DODJEM', null, 'DODJEM'];
  // 1: udvoje, Darko J karo, Milan sece 9 herc; herc K,D,10, pik A,D,J,10, tref A,8
  const q1: Position18 = {
    game: 'Herc', declarer: 1, follow: ['DODJEM', null, 'NE_DODJEM'],
    hands: ['J♥ A♥ 7♠ 8♦ 9♣ 10♦ J♣ K♣ K♠', 'K♥ Q♥ 10♥ A♠ Q♠ J♠ 10♠ A♣ 8♣', '8♥ 10♣ A♦ 9♠ 7♣ 7♦ 8♠ 7♥ Q♣ Q♦'],
    tricks: ['0J♦ 19♥'],
  };
  assert.equal(rules(q1), 'A♠');
  // 2: slaba duga boja pik 10,9,8,7 uz karo A,K
  const q2: Position18 = {
    game: 'Herc', declarer: 1, follow: both,
    hands: ['A♥ J♥ 8♣ 9♣ K♠ J♠ Q♦ J♦ 10♦', 'K♥ Q♥ 10♥ 10♠ 9♠ 8♠ 7♠ A♦ K♦', '8♥ 7♥ K♣ Q♣ 10♣ J♣ A♠ Q♠ 9♦'],
    tricks: ['2A♣ 07♣ 19♥'],
  };
  assert.equal(rules(q2), '10♠');
  // 3: ruka 3 posle Darkovog secenja K pik — Milan i dalje pik
  const q3: Position18 = {
    game: 'Herc', declarer: 1, follow: both, discard: '9♦ 8♦',
    hands: ['A♥ 8♥ K♣ 7♦ J♦ A♦', 'K♥ Q♥ Q♠ J♠ 8♠ K♦', 'J♥ 10♣ J♣ 10♦ Q♣ Q♦'],
    tricks: ['2A♣ 07♣ 19♥', '1A♠ 29♠ 07♠', '1K♠ 210♠ 07♥', '08♣ 110♥ 29♣'],
  };
  assert.equal(rules(q3), 'Q♠');
  // 4: sa A,D,10,9 u adutu — odmah pik
  const q4: Position18 = { ...q2, hands: [q2.hands[0], 'A♥ Q♥ 10♥ A♠ K♠ Q♠ J♠ 8♠ K♦', '8♥ 7♥ K♣ Q♣ 10♣ J♣ 10♠ 7♠ 9♦'] };
  assert.equal(rules(q4), 'A♠');
});

// --- 3. Pratilac nastavlja boju koju nosilac sece dok ovaj ima adut ---

test('ruka 22: Bora opet tref (Darko ga sece), ne 9 karo', () => {
  const h22: Position18 = {
    game: 'Herc', declarer: 0, follow: [null, 'NE_DODJEM', 'DODJEM'],
    hands: ['8♦ J♥ Q♥ A♠ 7♦', '8♠ Q♣ 9♠ 9♣ 10♠ A♦ 8♣ 7♥ 8♥ 7♠', '9♦ J♣ J♠ K♠ K♣'],
    tricks: ['0A♥ 29♥', '0K♥ 210♣', '0Q♦ 2K♦', '2A♣ 010♥', '010♦ 2J♦'],
  };
  assert.equal(rules(h22), 'J♣');
  assert.equal(search(h22), 'J♣');
});

// --- 4. Pratilac skartira boju koju nosilac nema, cuva najjacu kartu boje koju nosilac mozda ima ---

test('ruka 31: Bora na J karo baca J herc, cuva J pik', () => {
  const h31: Position18 = {
    game: 'Karo', declarer: 0, follow: [null, 'NE_DODJEM', 'DODJEM'],
    hands: ['Q♣ 10♦ 10♣', '7♠ 9♣ K♥ 10♠ 10♥ A♣ Q♥ 7♣ J♣ 7♦', 'J♠ K♣ J♥ 8♣'],
    tricks: ['2A♠ 0K♠', '2A♥ 09♦', '0A♦ 28♦', '0K♦ 27♥', '0Q♦ 28♠', '0Q♠ 29♠'], current: '0J♦', discard: '9♥ 8♥',
  };
  assert.equal(rules(h31), 'J♥');
  assert.equal(search(h31), 'J♥');
});

// --- 5. Licitacija ---

test('ruka 25: sa tref K,D,J Bora licitira najvise do 3 i igra karo', () => {
  assert.equal(estimatedMaxLevel(hand('K♣ Q♣ J♣ Q♥ 10♥ 9♥ A♦ K♦ Q♦ 10♦')), 3);
  assert.equal(chooseDeclareGame(hand('K♣ Q♣ J♣ Q♥ A♦ K♦ Q♦ 10♦ J♦ 9♦'), 3), 'Karo');
});

test('ruka 7: Milan sa tref A,K,D,10,9 i karo K,J,10,8,7 odmah kaze igra', () => {
  const milan = hand('A♣ K♣ Q♣ 10♣ 9♣ K♦ J♦ 10♦ 8♦ 7♦');
  assert.equal(isIgraWorthy(milan, false), true);
  const action = chooseBidAction({
    hand: milan, currentBid: 2, bidStartPlayer: 0 as Position, currentBidder: 1 as Position,
    passedPlayers: new Set(), playerBidLevel: 0, bids: [{ player: 0 as Position, type: 'BID', value: 2 }],
  });
  assert.equal(action.type, 'IGRA');
});

test('sporedna boja posle izvucenih aduta: gubi se samo na jace karte kod protivnika', () => {
  const trumps = 'A♠ K♠ Q♠ J♠ 10♠';
  const side = (s: string) => countDeclarerTricks(hand(`${trumps} ${s}`), '♠') - 5;
  assert.equal(side('K♦ J♦ 10♦ 8♦ 7♦'), 3);
  assert.equal(side('K♦ Q♦ 9♦ 8♦ 7♦'), 4);
  assert.equal(side('Q♦ J♦ 10♦ 9♦ 8♦'), 3);
  assert.equal(side('K♦ Q♦'), 1, 'kao ranije');
  assert.equal(side('A♦ K♦ 10♦'), 2, 'kao ranije');
});

// --- 7. Dolazak ---

test('ruka 23: Milan (pik A,K,9 i karo A,D,10,8) i Bora (adutski K treci, 2,5 rezona) dolaze', () => {
  assert.equal(chooseFollow({ hand: hand('9♣ J♥ 8♥ A♠ K♠ 9♠ A♦ Q♦ 10♦ 8♦'), declaredGame: 'Tref' }), 'DODJEM');
  assert.equal(chooseFollow({ hand: hand('K♣ 10♣ 8♣ K♥ 9♥ 7♥ Q♠ 10♠ 7♠ 7♦'), declaredGame: 'Tref' }), 'DODJEM');
  // jedan takav rezon nije dovoljan
  assert.equal(chooseFollow({ hand: hand('9♣ J♥ 8♥ 7♥ K♠ 9♠ A♦ Q♦ 10♦ 8♦'), declaredGame: 'Tref' }), 'NE_DODJEM');
});

// --- 6. Betl ---

test('betl ruka 7: Milan na D pik baca 10 tref (prazni celu boju), ne J karo', () => {
  const h7: Position18 = {
    game: 'Betl', declarer: 0, follow: [null, 'DODJEM', 'DODJEM'], hands: ['J♥ 10♥ 8♥', 'J♦ 10♦ 10♣ 8♦', 'Q♥ K♥ Q♦'],
    tricks: ['07♣ 1A♣ 28♣', '19♣ 2A♠ 0K♠', '17♦ 29♦ 0A♥', '28♠ 07♠ 1K♦', '29♥ 07♥ 1K♣', '2J♠ 010♠ 1Q♣'],
    current: '2Q♠ 09♠',
  };
  assert.equal(rules(h7), '10♣');
  assert.equal(search(h7), '10♣');
});

test('betl ruka 36: Milan posle A karo ne vraca karo kojim je nosilac krenuo', () => {
  const h36: Position18 = {
    game: 'Betl', declarer: 0, follow: [null, 'DODJEM', 'DODJEM'],
    hands: ['8♦ 7♦ J♣ 8♠ 7♣ 7♠ K♣ 10♣ 7♥', 'J♦ Q♦ 8♣ A♠ 9♣ 8♥ A♥ J♥ 9♥', '10♦ A♣ Q♣ 9♠ K♥ 10♥ 10♠ J♠ K♠'],
    tricks: ['09♦ 1A♦ 2K♦'],
  };
  assert.notEqual(rules(h36).slice(-1), '♦');
  assert.notEqual(search(h36).slice(-1), '♦');
});
