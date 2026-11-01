// Pozicija iz zapisa partije (karte koje su igracima ostale u tom trenutku) i potez koji bi odigrala pravila
// ili pretraga — zajednicko za testove analiza partija (#18, #19).

import { choosePlayCard } from '../src/aiDiscardPlay.ts';
import { searchChoosePlayCard } from '../src/aiSearch.ts';
import { Game } from '../src/game.ts';
import type { Card, FollowChoice, Position, Suit } from '../src/types.ts';

export const card = (x: string) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) }) as Card;
export const hand = (s: string): Card[] => (s ? s.split(' ').map(card) : []);
// "0A♥ 29♥" = Tdarko A herc, Bora 9 herc
export const trick = (s: string) => s.split(' ').map((x) => ({ player: Number(x[0]) as Position, card: card(x.slice(1)) }));

export interface Position18 {
  game: 'Herc' | 'Karo' | 'Tref' | 'Igra-Herc' | 'Igra-Tref' | 'Betl';
  declarer: Position;
  follow: (FollowChoice | null)[];
  hands: [string, string, string];
  tricks: string[];
  current?: string;
  discard?: string;
  talon?: string;
}

export const TRUMP: Record<Position18['game'], Suit | null> = {
  Herc: '♥', Karo: '♦', Tref: '♣', 'Igra-Herc': '♥', 'Igra-Tref': '♣', Betl: null,
};

export function stateOf(p: Position18) {
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

export const rules = (p: Position18) => {
  const s = stateOf(p);
  const seat = s.currentPlayer;
  return choosePlayCard({
    hand: s.players[seat]!.hand, currentTrick: s.currentTrick, trump: s.trump, declaredGame: s.declaredGame!,
    winnerTricks: 0, avoidTricks: seat === s.winner && s.declaredGame === 'Betl', isDeclarer: seat === s.winner,
    myPosition: seat, declarer: s.winner, tricks: s.tricks, discard: s.discard,
    twoHanded: p.follow.includes('NE_DODJEM'),
  })!.id;
};
export const search = (p: Position18) => {
  const s = stateOf(p);
  return searchChoosePlayCard(s, s.currentPlayer, 30).id;
};
