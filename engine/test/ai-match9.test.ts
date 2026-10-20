// Ispravke AI-ja iz analize korisnikove partije #9 (2026-10-20) — ruke su
// iz te partije. Uticaj svake ispravke je meren i partijama protiv starog
// AI-ja (vidi komentare u aiFollowKontra.ts / aiDiscardPlay.ts / aiBidding.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseKontra } from '../src/aiFollowKontra.ts';
import { choosePlayCard } from '../src/aiDiscardPlay.ts';
import { chooseDeclareGame } from '../src/aiBidding.ts';
import type { Card, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));

test('nosilac ne daje rekontru po pravilu pratioca (ruka 5: A,K,10,8 karo)', () => {
  const milan = hand('A♦ K♦ 10♦ 8♦ A♥ K♥ Q♣ 9♣ K♠ 9♠');
  assert.equal(chooseKontra({ hand: milan, trump: '♦', currentLevel: 1, isDeclarer: true }), 'MOZE');
  assert.equal(chooseKontra({ hand: milan, trump: '♦', currentLevel: 3, isDeclarer: true }), 'MOZE');
  // pratilac sa 4 aduta i dalje daje kontru (staro pravilo za pratioca)
  assert.equal(chooseKontra({ hand: hand('Q♦ J♦ 9♦ 7♦ K♣ J♣ A♠ J♠ 10♠ 7♥'), trump: '♦', currentLevel: 0 }), 'KONTRA');
});

test('nosilac sa viskom stihova i dalje daje rekontru', () => {
  const strong = hand('A♦ K♦ Q♦ J♦ 10♦ 9♦ A♥ K♥ A♠ 7♣');
  assert.equal(chooseKontra({ hand: strong, trump: '♦', currentLevel: 1, isDeclarer: true }), 'KONTRA');
});

test('betl: nosilac ne otvara kecom najduze boje (ruka 47)', () => {
  const c = choosePlayCard({
    hand: hand('J♣ 9♣ 7♣ A♥ Q♥ J♥ 8♥ 7♥ 9♦ 7♦'), currentTrick: [], trump: null, declaredGame: 'Betl',
    winnerTricks: 0, avoidTricks: true, isDeclarer: true, myPosition: 0 as Position, declarer: 0 as Position, tricks: [],
  });
  assert.notEqual(c!.rank, 'A');
  assert.equal(c!.rank, '7');
});

test('pratilac protiv adutske igre prvo naplacuje keca (ruka 8)', () => {
  const c = choosePlayCard({
    hand: hand('K♣ J♣ 10♣ 9♣ A♠ J♠ 8♠ 7♠ A♦ 8♦'), currentTrick: [], trump: '♥', declaredGame: 'Igra-Herc',
    winnerTricks: 0, isDeclarer: false, myPosition: 0 as Position, declarer: 1 as Position, tricks: [],
    nextActivePosition: 1 as Position,
  });
  assert.equal(c!.rank, 'A');
});

test('nosilac sa A,K,Q,10 aduta vuce adut u prvom stihu (ruka 48)', () => {
  const c = choosePlayCard({
    hand: hand('A♣ K♣ K♠ J♠ 9♠ 8♠ A♦ K♦ Q♦ 10♦'), currentTrick: [], trump: '♦', declaredGame: 'Karo',
    winnerTricks: 0, isDeclarer: true, myPosition: 0 as Position, declarer: 0 as Position, tricks: [],
  });
  assert.equal(c!.suit, '♦');
  assert.equal(c!.rank, 'A');
});

test('kod iste procene bira vredniju igru (ruka 20: tref i karo po 6 stihova → Tref)', () => {
  const g = chooseDeclareGame(hand('A♣ Q♣ 10♣ 7♣ A♥ K♥ A♦ J♦ 10♦ 7♦'), 2);
  assert.equal(g, 'Tref');
});
