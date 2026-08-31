// AI heuristike za Preferans — čiste funkcije, bez stanja
// Koriste se iz app.js za AI igrače

import { RANK_VALUE, SUITS, GAME_VALUES } from './constants.js';
import { isCardLegal } from './trick.js';
import type { Card, Game, Suit, Position, ContraLevel } from './types.js';

// Bodovi karata (high card points) — za procenu snage ruke
const CARD_POINTS: Record<string, number> = {
  'A': 10, 'K': 4, 'Q': 3, 'J': 2, '10': 1,
  '9': 0, '8': 0, '7': 0,
};

// Igra-Igre imaju veću vrednost nego obične
// IGRA-Pik (3) > Pik (2), itd.

export interface SuitEval {
  suit: Suit;
  count: number;
  highCards: number;
  points: number;
  topCard: Card | null;
  cards: Card[];
}

export interface HandEval {
  total: number;
  suits: SuitEval[];
  bestSuit: SuitEval | null;
  length: number;
  hasIgraPotential: boolean;
}

// Procena jedne boje u ruci
export function evaluateSuit(cards: Card[]): SuitEval {
  let points = 0;
  let topCard: Card | null = null;
  for (const c of cards) {
    points += CARD_POINTS[c.rank] ?? 0;
    if (!topCard || RANK_VALUE[c.rank] > RANK_VALUE[topCard.rank]) {
      topCard = c;
    }
  }
  return {
    suit: cards[0]?.suit ?? '♠',
    count: cards.length,
    highCards: cards.filter(c => RANK_VALUE[c.rank] >= 4).length,
    points,
    topCard,
    cards: cards.slice(),
  };
}

// Kompletna procena ruke
export function evaluateHand(hand: Card[]): HandEval {
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    const arr = bySuit.get(c.suit) ?? [];
    arr.push(c);
    bySuit.set(c.suit, arr);
  }
  const suits: SuitEval[] = [];
  for (const s of SUITS) {
    suits.push(evaluateSuit(bySuit.get(s) ?? []));
  }
  // Najbolja boja: kombinacija dužine i snage
  suits.sort((a, b) => {
    const aScore = a.count * 5 + a.points + (a.topCard ? RANK_VALUE[a.topCard.rank] : 0);
    const bScore = b.count * 5 + b.points + (b.topCard ? RANK_VALUE[b.topCard.rank] : 0);
    return bScore - aScore;
  });
  const bestSuit = suits[0] ?? null;
  const total = suits.reduce((sum, s) => sum + s.points, 0);
  // IGRA potencijal: 6+ u nekoj boji sa bar jednom jakom kartom
  const hasIgraPotential = suits.some(s => s.count >= 6 && s.highCards >= 2);
  return { total, suits, bestSuit, length: hand.length, hasIgraPotential };
}

// === BIDDING STRATEGIJA ===
//
// "Bid-uj ako imaš 5+ u jednoj boji sa bar 3 visoke karte (A/K/Q)"
// "IGRA samo ako imaš 6+ u boji sa 4+ visoke karte"
// "Pass ako ruka nema koncentracije"

export type BidAction =
  | { type: 'PASS' }
  | { type: 'IGRA' }
  | { type: 'BID'; value: number }
  | { type: 'MOGU'; value: number };

export interface BidContext {
  hand: Card[];
  currentBid: number;
  bidStartPlayer: Position;
  currentBidder: Position;
  passedPlayers: Set<Position>;
  playerBidLevel: number; // 0 ako igrač još nije biddovao, inače vrednost
  bids: { player: Position; type: string; value?: number; game?: string }[]; // istorija bidding-a
}

export function chooseBidAction(ctx: BidContext): BidAction {
  // Ako je igrač već biddovao nešto, može:
  //   - PASS (odustajanje)
  //   - MOGU X (potvrda iste vrednosti)
  //   - BID Y (veca vrednost od trenutne)
  const evalRes = evaluateHand(ctx.hand);
  const best = evalRes.bestSuit;

  if (ctx.playerBidLevel > 0) {
    // Mogu-eligible: vec licitirao I trenutno nadmasen (currentBid >
    // playerBidLevel). Prvi izbor je MOGU (potvrda), ali SAMO JEDAN igrac
    // sme potvrditi datu vrednost — ako je BILO KO VEC potvrdio, ta opcija
    // nestaje za sve ostale (potvrdjeno direktno, vise puta od korisnika).
    const moguEligible = ctx.currentBid > ctx.playerBidLevel;
    const alreadyConfirmedByAnyone = ctx.bids.some(
      b => b.type === 'MOGU' && b.value === ctx.currentBid,
    );
    if (moguEligible && ctx.currentBid >= 2 && !alreadyConfirmedByAnyone) {
      return { type: 'MOGU', value: ctx.currentBid };
    }
    // Ili trenutno drzim vrh (playerBidLevel === currentBid), ili sam
    // Mogu-eligible ali je Mogu vec zauzet od DRUGOG igraca — u oba slucaja
    // smem da PODIGNEM. Uzivo prijavljen bag: igrac Mogu-eligible ostajao
    // zaglavljen samo na "dalje" kad Mogu vise nije bio dostupan, iako je
    // imao dovoljno jaku ruku da legitimno podigne na sledecu vrednost.
    const MIN_LENGTH_FOR_BID: Record<number, number> = {
      2: 4, 3: 4, 4: 5, 5: 5, 6: 6, 7: 6,
    };
    const nextBid = Math.max(2, ctx.currentBid + 1);
    if (nextBid >= 2 && nextBid <= 7 && best) {
      const requiredLength = MIN_LENGTH_FOR_BID[nextBid] || 5;
      if (best.count >= requiredLength) {
        return { type: 'BID', value: nextBid };
      }
    }
    return { type: 'PASS' };
  }

  if (!best) return { type: 'PASS' };

  // IGRA: 6+ iste boje sa 2+ visoke karte (samo reč, konkretna igra se proglašava posle Moze)
  if (best.count >= 6 && best.highCards >= 2 && best.topCard && ctx.playerBidLevel === 0) {
    const top = best.topCard;
    if (RANK_VALUE[top.rank] >= 4) {
      return { type: 'IGRA' };
    }
  }

  // BID postepeno: uvek bidding +1 (currentBid + 1)
  // Pragovi po vrednosti:
  //   2 (Pik) — 4+ karte u toj boji
  //   3 (Karo) — 4+ karte u toj boji
  //   4 (Herc) — 5+ karte u toj boji
  //   5 (Tref) — 5+ karte u toj boji
  //   6 (Betl) — 6+ karte u bilo kojoj boji (kontekst)
  //   7 (Sans) — 6+ karte u bilo kojoj boji (kontekst)
  //
  // Dodatna pravila po tvom objasnjenju:
  //   bidduj ako imas adut A (siguran adutski stih)
  //   bidduj ako imas 3+ K u razlicitim bojama
  //   bidduj ako imas bilo koji As + spare (4+ u boji)
  // Primer: 5 bilo kakvih karoa + As sa strane -> bid
  const MIN_LENGTH_FOR_BID: Record<number, number> = {
    2: 4, // Pik
    3: 4, // Karo
    4: 5, // Herc
    5: 5, // Tref
    6: 6, // Betl
    7: 6, // Sans
  };

  const nextBid = Math.max(2, ctx.currentBid + 1);
  if (nextBid >= 2 && nextBid <= 7) {
    const requiredLength = MIN_LENGTH_FOR_BID[nextBid] || 5;
    if (best.count >= requiredLength) {
      // Proveri dodatne uslove za bidding:
      const hasAceInSuit = best.topCard && RANK_VALUE[best.topCard.rank] >= 4; // A ili K
      const totalAces = evalRes.suits.reduce(
        (sum, s) => sum + s.cards.filter(c => c.rank === 'A').length,
        0,
      );
      const offSuits = evalRes.suits.filter(s => s.suit !== best.suit);
      const offKings = offSuits.reduce(
        (sum, s) => sum + s.cards.filter(c => c.rank === 'K').length,
        0,
      );
      const hasAnyAce = totalAces >= 1;
      const hasThreeKings = offKings >= 3;

      // Bidduj ako:
      // - ima A ili K u lead boji (jak adut)
      // - ILI ima bilo koji As (sigurno hvata stih)
      // - ILI ima 3+ K u drugim bojama
      if (hasAceInSuit || hasAnyAce || hasThreeKings) {
        return { type: 'BID', value: nextBid };
      }
    }
  }

  return { type: 'PASS' };
}

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

// === FOLLOW STRATEGIJA (Dodjem / Ne dodjem) ===
//
// Pravilo: dolazis ako mislis da mozes uhvatiti NAJMANJE 2 stiha.
//   - 2 adutska sigurna stiha (A+K u adutu, ili 2 najjaca aduta)
//   - 2 asa u razlicitim bojama
//   - 3 K u razlicitim bojama
//   - kombinacija (adut A + as van aduta, itd.)

export type FollowAction = 'DODJEM' | 'NE_DODJEM';

export interface FollowContext {
  hand: Card[];
  declaredGame: Game;
}

// Broji "sigurne stihove" u ruci za tu igru (adut + as van aduta)
function countSafeTricks(hand: Card[], trump: Suit | null): number {
  const trumps = hand.filter(c => trump !== null && c.suit === trump);
  const trumpA = trumps.some(c => c.rank === 'A');
  const trumpK = trumps.some(c => c.rank === 'K');
  const trumpD = trumps.some(c => c.rank === 'Q');
  const trumpLength = trumps.length;

  // As van aduta — siguran stih
  const offAces = hand.filter(c => c.rank === 'A' && c.suit !== trump).length;

  // K van aduta — solidan stih ako ima 3+ u toj boji ili je jedini adut nestao
  const offKings = hand.filter(c => c.rank === 'K' && c.suit !== trump).length;

  let safe = 0;
  // Adut A — siguran stih
  if (trumpA) safe += 1;
  // Adut K + bar 1 mali adut (jer A je vec brojan gore)
  if (trumpK && trumpLength >= 2 && !trumpA) safe += 1;
  // Adut D + bar 2 mala aduta (kad A i K izadju, D hvata)
  if (trumpD && trumpLength >= 3 && !trumpA && !trumpK) safe += 1;
  // 2+ najjaca aduta (A+K, ili A + D sa jos jednim malim)
  if (trumpA && trumpK) safe += 1;

  safe += offAces; // svaki as van aduta je siguran
  // 3 K u razlicitim bojama (van aduta) — solidno za 2 stiha
  // Ali 1 K sam nije siguran; brojimo samo kao bonus
  if (offKings >= 3) safe += 2;
  else if (offKings >= 2) safe += 1;

  return safe;
}

export function chooseFollow(ctx: FollowContext): FollowAction {
  const trump = getTrumpSuitFromGame(ctx.declaredGame);
  const safe = countSafeTricks(ctx.hand, trump);
  // Dodji ako ima najmanje 2 sigurna stiha
  return safe >= 2 ? 'DODJEM' : 'NE_DODJEM';
}

// Helper: izvlaci adut boju iz igre
function getTrumpSuitFromGame(game: Game): Suit | null {
  const map: Partial<Record<Game, Suit>> = {
    'Pik': '♠', 'Igra-Pik': '♠',
    'Herc': '♥', 'Igra-Herc': '♥',
    'Karo': '♦', 'Igra-Karo': '♦',
    'Tref': '♣', 'Igra-Tref': '♣',
  };
  return map[game] ?? null;
}

// === KONTRA STRATEGIJA ===
//
// "Kontra ako imaš 4+ aduta"
// "Kontra ako imaš 3 aduta i 2+ visoke karte u ostalim bojama"
// "Inače Moze"

export type KontraAction = 'KONTRA' | 'MOZE';

export interface KontraContext {
  hand: Card[];
  trump: Suit | null;
  currentLevel: number; // 0 = nema, 1 = KONTRA, 2 = REKONTRA, 3 = SUBKONTRA, 4 = MORTKONTRA
}

export function chooseKontra(ctx: KontraContext): KontraAction {
  if (ctx.trump === null) return 'MOZE';
  const trumps = ctx.hand.filter(c => c.suit === ctx.trump);
  const highTrumps = trumps.filter(c => RANK_VALUE[c.rank] >= 4).length;
  // 4+ aduta → kontra
  if (trumps.length >= 4) return 'KONTRA';
  // 3 aduta sa 2+ visoke → kontra
  if (trumps.length >= 3 && highTrumps >= 2) return 'KONTRA';
  // Inače moze
  return 'MOZE';
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
  // Inače — najslabija
  return legal.sort((a, b) => {
    const pa = CARD_POINTS[a.rank] ?? 0;
    const pb = CARD_POINTS[b.rank] ?? 0;
    if (pa !== pb) return pa - pb;
    return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  })[0]!;
}

// === IGRA CONFIRM STRATEGIJA ===
//
// "Pratioci kažu jaču Igra igru ako imaju dovoljno karata, inače 'dalje'"
// "Igra-Betl i Igra-Sans su jače od standardnih Igra igara"

export interface IgraConfirmContext {
  hand: Card[];
  declaredGame: Game;
  passedAlready: boolean;
}

const IGRA_VALUES: Record<string, number> = {
  'Igra-Pik': 3,
  'Igra-Karo': 4,
  'Igra-Herc': 5,
  'Igra-Tref': 6,
  'Igra-Betl': 7,
  'Igra-Sans': 8,
};

export function chooseIgraConfirm(ctx: IgraConfirmContext): { action: 'IGRA' | 'DALJE'; game?: Game } {
  if (ctx.passedAlready) return { action: 'DALJE' };
  const currentVal = IGRA_VALUES[ctx.declaredGame] || GAME_VALUES[ctx.declaredGame] || 0;
  const evalRes = evaluateHand(ctx.hand);
  const best = evalRes.bestSuit;
  const igraMap: Record<Suit, Game> = {
    '♠': 'Igra-Pik', '♥': 'Igra-Herc',
    '♦': 'Igra-Karo', '♣': 'Igra-Tref',
  };
  // Ako imamo jaču Igra igru sa bar 4+ karte iste boje i jakim kartama
  if (best && best.count >= 4 && best.topCard) {
    const myIgra = igraMap[best.suit];
    const myVal = IGRA_VALUES[myIgra] || 0;
    if (myVal > currentVal && RANK_VALUE[best.topCard.rank] >= 4) {
      return { action: 'IGRA', game: myIgra };
    }
  }
  return { action: 'DALJE' };
}

// === USE REFE STRATEGIJA ===
//
// "Koristiti refe kad ima dovoljno jaku ruku (>=5 u boji sa bar 1 jakom)"

export interface UseRefeContext {
  hand: Card[];
  refeCount: number;
  refePerPlayer: number;
}

export function chooseUseRefe(ctx: UseRefeContext): boolean {
  if (ctx.refeCount >= ctx.refePerPlayer) return false;
  const ev = evaluateHand(ctx.hand);
  const best = ev.bestSuit;
  if (!best) return false;
  // Koristiti ako ima 5+ u boji sa visokim kartama
  if (best.count >= 5 && best.highCards >= 1 && best.topCard) {
    return RANK_VALUE[best.topCard.rank] >= 4;
  }
  return false;
}

// === EXPORTS ===

export const AI_VERSION = '1.0';

// === CALL OR ALONE STRATEGIJA ===
//
// Pozivalac (DODJEM) bira: zvati NE_DODJEM sparinga ili igrati sam sa nosiocem.
// Pravilo: zovi ako smatras da NE_DODJEM moze uhvatiti NAJMANJE 1 stih.
//   - ima adutski A (siguran)
//   - ima adutski K + bar 1 malu adutsku kartu
//   - ima adutsku D + bar 2 male adutske karte
//   - ima As bilo koji (van aduta — uvek hvata stih)
// Inace igraj sam sa nosiocem (NE_DODJEM sedi i ceka).

export type CallOrAloneAction = 'CALL' | 'ALONE';

export interface CallOrAloneContext {
  caller: Position;        // DODJEM igrac koji bira
  neDodjemHand: Card[];    // ruka NE_DODJEM igraca
  declaredGame: Game;
}

export function chooseCallOrAlone(ctx: CallOrAloneContext): CallOrAloneAction {
  const trump = getTrumpSuitFromGame(ctx.declaredGame);
  const hand = ctx.neDodjemHand;

  // As bilo koji (van aduta) — siguran stih
  const anyAce = hand.some(c => c.rank === 'A');
  if (anyAce) return 'CALL';

  // Adut probe
  if (trump !== null) {
    const trumps = hand.filter(c => c.suit === trump);
    const hasTrumpA = trumps.some(c => c.rank === 'A');
    const hasTrumpK = trumps.some(c => c.rank === 'K');
    const hasTrumpD = trumps.some(c => c.rank === 'Q');
    const trumpLen = trumps.length;

    if (hasTrumpA) return 'CALL';
    // Adut K + bar 1 mala adutska (K je drugi najjaci kad A izadje)
    if (hasTrumpK && trumpLen >= 2) return 'CALL';
    // Adut D + bar 2 male (kad A i K izadju, D hvata)
    if (hasTrumpD && trumpLen >= 3) return 'CALL';
  }

  // Nema sigurnog stiha — igraj sam
  return 'ALONE';
}