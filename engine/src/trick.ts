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
//
// PRAVILO (po specu, Slučaj 1, 2, 3):
// 1. Ako igrač ima lead boju → MORA igrati lead boju
// 2. Ako nema lead boju ALI ima adut → MORA igrati adut
// 3. Ako nema ni lead ni adut → može bilo koju kartu
//
// Izvođač i pratilac igraju po istom pravilu.
// U betlu/sansu nema aduta → koristi se pravilo 1+3.
export function isCardLegal(
  card: Card,
  hand: Card[],
  trickCards: TrickCard[],
  trump: Suit | null,
): boolean {
  // Vodi (nema karata u štihu) — može bilo koju
  if (trickCards.length === 0) return true;

  const leadSuit = trickCards[0]!.card.suit;
  const inLeadSuit = hand.some(c => c.suit === leadSuit);

  // Slučaj 1: Ima lead boju → samo lead boja
  if (inLeadSuit) {
    return card.suit === leadSuit;
  }

  // Slučaj 2: Nema lead boju, ali ima adut → samo adut
  if (trump !== null) {
    const hasTrump = hand.some(c => c.suit === trump);
    if (hasTrump) {
      return card.suit === trump;
    }
  }

  // Slučaj 3: Nema ni lead ni adut → bilo koja
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
