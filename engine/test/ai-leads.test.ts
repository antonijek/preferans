// Otvaranje stiha (aiLeads.ts) na rukama iz korisnikove partije #10.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sansDefenderLead, declarerLead, sansDefenderDiscard, defenderSafeExit } from '../src/aiLeads.ts';
import type { Card, Position } from '../src/types.ts';

const hand = (s: string): Card[] => s.split(' ').map((x) => ({ id: x, rank: x.slice(0, -1), suit: x.slice(-1) } as Card));
const tc = (player: number, id: string) => ({ player: player as Position, card: hand(id)[0]! });

test('pratilac protiv Sansa otvara najduzu boju vrhom niza i nastavlja je (ruka 35)', () => {
  const h = hand('9♣ K♥ 9♥ K♠ Q♠ J♠ 10♠ 7♠ K♦ J♦');
  const first = sansDefenderLead({ legal: h, hand: h, trump: null, myPosition: 0, declarer: 1, tricks: [] });
  assert.equal(first!.id, 'K♠');
  const rest = h.filter((c) => c.id !== 'K♠');
  const next = sansDefenderLead({
    legal: rest, hand: rest, trump: null, myPosition: 0, declarer: 1,
    tricks: [[tc(0, 'K♠'), tc(1, 'A♠'), tc(2, '8♠')]],
  });
  assert.equal(next!.id, 'Q♠');
});

test('pratilac protiv Sansa sa asom otvara asa najduze boje (ruka 41)', () => {
  const h = hand('K♣ J♣ A♥ Q♥ Q♠ 8♠ A♦ K♦ Q♦ 7♦');
  assert.equal(sansDefenderLead({ legal: h, hand: h, trump: null, myPosition: 0, declarer: 2, tricks: [] })!.id, 'A♦');
});

test('nosilac naplacuje najjacu preostalu kartu umesto najnize (ruka 75, Tref)', () => {
  const h = hand('A♣ 10♣ 9♣ 8♣ Q♥ J♥ A♦ K♦ Q♦ 9♦');
  const c = declarerLead({ legal: h, hand: h, trump: '♣', myPosition: 0, declarer: 0, tricks: [] });
  assert.equal(c!.id, 'A♦');
});

test('nosilac ne naplacuje boju u kojoj je pratilac vec pokazao da je prazan', () => {
  const h = hand('A♣ 10♣ 9♣ A♦ K♦ Q♦ J♥ 10♥');
  const tricks = [[tc(0, '9♦'), tc(1, '7♣'), tc(2, '8♦')]]; // igrac 1 ne prati karo
  const c = declarerLead({ legal: h, hand: h, trump: '♣', myPosition: 0, declarer: 0, tricks });
  assert.ok(c === null || c.suit !== '♦', `ne sme karo: ${c?.id}`);
});

test('protiv Sansa, boje iste duzine: prvo niz bez asa, as ostaje ulaz (korisnik 2026-10-21)', () => {
  const h = hand('A♠ 9♠ 8♠ K♥ Q♥ 7♥ 10♦ 9♦ J♣ 8♣');
  assert.equal(sansDefenderLead({ legal: h, hand: h, trump: null, myPosition: 0, declarer: 1, tricks: [] })!.id, 'K♥');
});

test('protiv Sansa bez trazene boje: cuva boju koju razvija i asa, baca male ispod asa', () => {
  const h = hand('A♠ 9♠ 8♠ K♥ Q♥ 7♥ J♣ 8♣');
  assert.equal(sansDefenderDiscard({ legal: h, hand: h, trump: null, myPosition: 2, declarer: 1, tricks: [] })!.id, '8♠');
});

test('pratilac ne otvara kralja sa malom, ceka da nosilac otvori (partija #11, ruka 5)', () => {
  const h = hand('10♣ 9♣ K♥ 10♥ K♠ 7♠');
  const c = defenderSafeExit({ legal: h, hand: h, trump: '♦', myPosition: 2, declarer: 0, tricks: [] });
  assert.equal(c!.suit, '♣');
});

test('udvoje: pratilac otvara boju najjacom kartom, i K iz K,8 kad mora (korisnik 2026-10-21)', () => {
  const h = hand('10♣ 9♣ K♥ 10♥ K♠ 7♠');
  const ctx = { legal: h, hand: h, trump: '♦' as const, myPosition: 2 as Position, declarer: 0 as Position, tricks: [], twoHanded: true };
  assert.equal(defenderSafeExit(ctx)!.id, '10♣');
  const forced = hand('K♠ 8♠ 9♦');
  assert.equal(defenderSafeExit({ ...ctx, legal: forced, hand: forced })!.id, 'K♠');
});
