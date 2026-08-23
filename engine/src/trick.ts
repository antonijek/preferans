// Pravila štiha po RULES.md sekcija 8

import { cardCompare } from './cards.js';
import type { Card, Suit, Position, TrickCard } from './types.js';

// 8.4 — Određivanje pobednika štiha
export function trickWinner(trickCards: TrickCard[], trump: Suit | null): Position | null {
  if (trickCards.length === 0) return null;
  const leadSuit = trickCards[0]!.card.suit;
  let best = trickCards[0]!;
  for (let i = 1; i < trickCards.length; i++) {
    const cmp = cardCompare(trickCards[i]!.card, best.card, trump, leadSuit);
    if (cmp > 0) best = trickCards[i]!;
  }
  return best.player;
}

// 8.3 — Da li je data karta legalna
// Prvi igrač u štihu može bilo koju kartu.
// Ako ima kartu u lead boji, MORA je odigrati.
// Ako nema, u adutskoj igri MORA adut (ako ga ima).
// U betlu/sansu može bilo koju.
export function isCardLegal(
  card: Card,
  hand: Card[],
  trickCards: TrickCard[],
  trump: Suit | null,
): boolean {
  if (trickCards.length === 0) return true;
  const leadSuit = trickCards[0]!.card.suit;
  const inLeadSuit = hand.some(c => c.suit === leadSuit);
  if (inLeadSuit) {
    if (card.suit !== leadSuit) return false;
    return true;
  }
  // Nema lead boje
  if (trump !== null) {
    const hasTrump = hand.some(c => c.suit === trump);
    if (hasTrump) {
      // U adutskoj igri mora adut
      return card.suit === trump;
    }
  }
  // Betl/Sans ili nema aduta — može bilo koju
  return true;
}

// Sve legalne karte iz ruke
export function getLegalCards(
  hand: Card[],
  trickCards: TrickCard[],
  trump: Suit | null,
): Card[] {
  return hand.filter(c => isCardLegal(c, hand, trickCards, trump));
}

// Moraš li pratiti boju?
export function mustFollowSuit(hand: Card[], leadSuit: Suit): boolean {
  return hand.some(c => c.suit === leadSuit);
}
