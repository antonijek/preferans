// AI heuristike za Preferans — odbacivanje karata u talon i odigravanje
// karte u štihu. Koriste se iz app.js za AI igrače.

import { RANK_VALUE } from './constants.js';
import { isCardLegal } from './trick.js';
import type { Card, Game, Suit, Position, ContraLevel } from './types.js';
import { CARD_POINTS } from './aiHandEval.js';

// === DISCARD STRATEGIJA ===
//
// "Odbaci najslabije karte van aduta"
// "Ako su dve iste boje van aduta, odbaci obe"
// "Zadrži adute i visoke karte"

export function chooseDiscard(hand: Card[], trump: Suit | null): [Card, Card] {
  const sorted = hand.slice().sort((a, b) => {
    // Aduti uvek na kraju (lošije za discard)
    if (trump) {
      if (a.suit === trump && b.suit !== trump) return 1;
      if (b.suit === trump && a.suit !== trump) return -1;
    }
    // Najpre najslabije (manje bodova = slabije)
    const pa = CARD_POINTS[a.rank] ?? 0;
    const pb = CARD_POINTS[b.rank] ?? 0;
    if (pa !== pb) return pa - pb;
    // Pa po broju karata u boji — kraće boje odbacuj pre
    return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  });
  return [sorted[0]!, sorted[1]!];
}

// === PLAY CARD STRATEGIJA ===
//
// "Vodi najslabijom kartom (da sačuvaš jake)"
// "Prati boju — ako može pobediti sa slabom, inače najslabijom"
// "Nema boje — najslabiji adut, ili ako nema aduta, najslabija"

export function choosePlayCard(args: {
  hand: Card[];
  currentTrick: { player: Position; card: Card }[];
  trump: Suit | null;
  declaredGame: Game;
  winnerTricks: number;
  // Betl/Igra-Betl deklarant: cilj je da NIKAD ne uzme štih (RULES 8 — ako
  // uzme bilo koji štih, pada). Standardna heuristika za "misère"-tipove
  // igara (potvrđeno istraživanjem): kad je cilj već "ne pobediti", igraj
  // NAJVEĆU kartu koja i dalje gubi (bezbedno se oslobađa opasnih karata);
  // ako si primoran da pobediš (nemaš karticu koja gubi), igraj NAJMANJU
  // moguću pobedničku da minimizuješ štetu.
  avoidTricks?: boolean;
  // Da li JA (igrač koji bira kartu) jesam nosilac partije. Bez ovoga
  // funkcija ne zna razliku između deklaranta i pratioca.
  isDeclarer?: boolean;
  // Aktivan nivo kontre na celoj ruci (za konvenciju izlaska protiv Sansa).
  kontraLevel?: ContraLevel | null;
  // Redni broj štiha u ovoj ruci (0 = prvi štih) — konvencija izlaska važi
  // SAMO za prvi štih cele ruke, ne za svako vođenje pratioca.
  trickCount?: number;
  // Moja pozicija za sto — potrebna da bi se prepoznalo da li je trenutni
  // "najjači u štihu" moj saigrač (odbrana) ili nosilac.
  myPosition?: Position;
  // Pozicija nosioca partije — bez ovoga se ne moze utvrditi ciju kartu
  // trenutno "gazim" kad pokušavam da pobedim štih.
  declarer?: Position | null;
}): Card | null {
  const {
    hand, currentTrick, trump, avoidTricks = false,
    isDeclarer = false, kontraLevel = null, trickCount = 0,
    myPosition, declarer,
  } = args;
  const legal = hand.filter(c => isCardLegal(c, hand, currentTrick, trump));
  if (legal.length === 0) return null;

  // Vodim prvi — igraj najslabiju kartu (dobro i za osvajanje kasnije i za
  // izbegavanje štiha sad)
  if (currentTrick.length === 0) {
    // Konvencija izlaska pratioca protiv Sansa/Igra-Sansa (potvrđeno uzivo od
    // korisnika i nezavisno preferansklub.com/strategija.htm): na PRVOM štihu
    // cele ruke, pratilac (ne nosilac) izlazi iz Pika ako je data kontra,
    // inace iz Trefa. Igra-Sans namerno ukljucen (ista no-trump porodica kao
    // Sans) — ne suziti slucajno kasnije na samo 'Sans'.
    const isSans = args.declaredGame === 'Sans' || args.declaredGame === 'Igra-Sans';
    if (!isDeclarer && isSans && trickCount === 0) {
      const conventionSuit: Suit = kontraLevel ? '♠' : '♣';
      const suitCards = legal.filter(c => c.suit === conventionSuit);
      if (suitCards.length > 0) {
        return suitCards.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
      }
      // Nema tu boju — propadni na standardnu logiku ispod.
    }
    // Odbrambena konvencija (korisnikova, zabelezena uzivo 2026-09-06/07,
    // JOS NIJE potvrdjena uzivo protiv AI-ja): pratilac koji drzi tacno
    // JEDNU kartu neke vanadutske boje je vodi PRVI ("suva" boja) da bi se
    // "objavio" saigracu kao void u toj boji — kasnije, kad saigrac osvoji
    // stih, moze vratiti NISKU kartu iste boje da ovaj preseca adutom i
    // pritiska nosioca. Ima smisla samo dok jos ima adut u ruci (inace nema
    // cime kasnije da sece).
    if (!isDeclarer && trump) {
      const bySuit = new Map<Suit, Card[]>();
      for (const c of hand) {
        if (c.suit === trump) continue;
        if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
        bySuit.get(c.suit)!.push(c);
      }
      const hasTrump = hand.some(c => c.suit === trump);
      if (hasTrump) {
        for (const suit of ['♠', '♥', '♦', '♣'] as Suit[]) {
          const cards = bySuit.get(suit);
          if (cards && cards.length === 1) return cards[0]!;
        }
      }
    }
    // Konvencija vodjenja "kroz nosioca slabom, kroz partnera jakom kartom"
    // (istrazivanje 2026-09-18, preferans.hr signalizacija — korisnikov
    // zahtev da se ugradi): kad pratilac vodi NOVI stih (bilo koji, ne samo
    // prvi), sledeci na potezu je po fiksnom redosledu (myPosition+1)%3 —
    // uvek ili nosilac ili partner, nikad nepoznato. Ako je nosilac sledeci,
    // slaba karta ga ne "hrani" informacijom (postojece ponasanje ispod,
    // nepromenjeno). Ako je PARTNER sledeci, vodi se NAJJACOM kartom u
    // najboljoj vanadutskoj boji — partner iz toga cita da nosilac verovatno
    // NEMA visu kartu te boje (inace bi je nosilac vec odigrao/pokrio),
    // umesto da nagadja. Namerno SAMO za pratioca (nosilac ima drugaciju
    // logiku — izvlacenje aduta/duge boje, ne signalizaciju partneru koji
    // ne postoji za njega) i samo kad ranije, specificnije konvencije
    // (Sans-izlazak, "suva" vanadutska boja) nisu vec odlucile.
    if (!isDeclarer && myPosition != null && declarer != null) {
      const nextToAct = ((myPosition + 1) % 3) as Position;
      const leadingTowardPartner = nextToAct !== declarer;
      if (leadingTowardPartner) {
        const nonTrump = trump ? legal.filter(c => c.suit !== trump) : legal;
        const pool = nonTrump.length > 0 ? nonTrump : legal;
        const strongest = pool.slice().sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])[0]!;
        return strongest;
      }
    }
    const sorted = legal.slice().sort((a, b) => {
      // Van aduta prioritet (čuvaj adute)
      if (trump) {
        if (a.suit === trump && b.suit !== trump) return 1;
        if (b.suit === trump && a.suit !== trump) return -1;
      }
      const pa = CARD_POINTS[a.rank] ?? 0;
      const pb = CARD_POINTS[b.rank] ?? 0;
      if (pa !== pb) return pa - pb;
      return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    });
    return sorted[0]!;
  }

  const leadSuit = currentTrick[0]!.card.suit;
  const sameSuit = legal.filter(c => c.suit === leadSuit);

  if (sameSuit.length > 0) {
    const highestInTrick = currentTrick
      .filter(tc => tc.card.suit === leadSuit || (trump && tc.card.suit === trump))
      .reduce((max, tc) => {
        if (trump && tc.card.suit === trump && max?.card.suit !== trump) return tc;
        if (RANK_VALUE[tc.card.rank] > RANK_VALUE[max!.card.rank]) return tc;
        return max;
      }, currentTrick[0]!);
    const isTrumpHighest = trump && highestInTrick.card.suit === trump;
    // Da li trenutno najjaci u stihu drzi MOJ saigrac-odbrambeni (ne nosilac,
    // ne ja)? Ako da, cilj (obaranje nosioca) je vec ostvaren za ovaj stih —
    // nema potrebe da ga "pregazim" sopstvenim jos jacim ulogom, to bi samo
    // trosilo jaku kartu uzalud (potvrdjeno uzivo od korisnika: "nema potrebe
    // da se nosi jacom kartom stih koji je vec uhvatio drugi pratilac, jer je
    // cilj igrati protiv odigravaca"). Ne primenjuje se ako podaci o pozicijama
    // nisu prosledjeni (backward-compat sa starim pozivima/testovima).
    const teammateIsWinning =
      !isDeclarer &&
      declarer != null &&
      myPosition != null &&
      highestInTrick.player !== declarer &&
      highestInTrick.player !== myPosition;

    if (avoidTricks) {
      // Betl (nema aduta) — samo pratim boju. Bacaj NAJVEĆU kartu koja i
      // dalje gubi; ako sve moje karte u boji pobeđuju, primoran sam —
      // biraj NAJMANJU pobedničku.
      const losers = sameSuit.filter(c => RANK_VALUE[c.rank] < RANK_VALUE[highestInTrick.card.rank]);
      if (losers.length > 0) {
        return losers.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])[0]!;
      }
      return sameSuit.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
    }

    if (isTrumpHighest) {
      // Adut je vođa — moram adutom ako imam
      const myTrumps = sameSuit.filter(c => c.suit === trump);
      if (myTrumps.length > 0) {
        return myTrumps.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
      }
    } else if (!teammateIsWinning) {
      // Pobednik je u lead boji (nosilac, ili nepoznato) — pokušaj pobediti
      const winners = sameSuit.filter(c => RANK_VALUE[c.rank] > RANK_VALUE[highestInTrick.card.rank]);
      if (winners.length > 0) {
        return winners.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
      }
    }
    // Ne mogu pobediti — bacam najslabiju
    return sameSuit.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
  }

  // Nemam u lead boji
  if (avoidTricks) {
    // Betl nema aduta — bacam najslabiju od legalnih (bezbedno)
    return legal.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
  }
  if (trump && legal.some(c => c.suit === trump)) {
    // Moraš adut — bacaj najslabiji
    const trumps = legal.filter(c => c.suit === trump);
    return trumps.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
  }
  // Inače — najslabija, ali NIKAD as/kralj ako postoji alternativa bez njih
  // (istrazivanje 2026-09-18, preferans.hr signalizacija: "nikad se ne
  // odbacuje karta iz boje u kojoj bi izvodjac mogao pasti" — kao pratilac
  // sam odbacaj, cuvaj eventualni stoper (as/kralj) u nekoj boji za
  // kasnije, dok god imam bar jednu kartu koja NIJE as/kralj da bacim
  // umesto toga).
  const nonHonor = legal.filter(c => c.rank !== 'A' && c.rank !== 'K');
  const pool = nonHonor.length > 0 ? nonHonor : legal;
  return pool.sort((a, b) => {
    const pa = CARD_POINTS[a.rank] ?? 0;
    const pb = CARD_POINTS[b.rank] ?? 0;
    if (pa !== pb) return pa - pb;
    return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  })[0]!;
}
