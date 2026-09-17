// AI heuristike za Preferans — licitacija, proglašavanje igre, Igra-confirm,
// refe. Koriste se iz app.js za AI igrače.

import { RANK_VALUE, GAME_VALUES, STANDARD_GAMES } from './constants.js';
import type { Card, Game, Position, Suit } from './types.js';
import {
  evaluateHand,
  estimatedMaxLevel,
  isIgraWorthy,
  isBetlSafe,
  countSansTricks,
  countDeclarerTricks,
} from './aiHandEval.js';

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

const SUIT_FOR_STANDARD_GAME: Partial<Record<Game, Suit>> = {
  'Pik': '♠', 'Karo': '♦', 'Herc': '♥', 'Tref': '♣',
};

// Bira KOJU standardnu igru proglasiti posle pobede u licitaciji — koristi
// ISTE kalibrisane procene kao licitacija (countDeclarerTricks/
// countSansTricks/isBetlSafe), umesto slepog "prvi iz liste cija vrednost
// >= ugovor" (uzivo prijavljen bag: aukcija moze legitimno eskalirati do
// nivoa 6 na osnovu NECIJEG DRUGOG Betl-sposobnog uloga u toku Mogu/BID
// razmene, ali pobednik na kraju moze biti igrac ciji hand UOPSTE nije
// Betl-bezbedan — stara verzija bi ga svejedno naterala u Betl samo zato
// sto je vrednost >= ugovor, garantovan pad).
export function chooseDeclareGame(hand: Card[], contractValue: number): Game {
  let best: Game | null = null;
  let bestScore = -Infinity;
  for (const g of STANDARD_GAMES) {
    if (GAME_VALUES[g] < contractValue) continue;
    let score: number;
    if (g === 'Betl') {
      score = isBetlSafe(hand) ? 100 : -100; // sve-ili-nista, ne "broj stihova"
    } else if (g === 'Sans') {
      score = countSansTricks(hand);
    } else {
      score = countDeclarerTricks(hand, SUIT_FOR_STANDARD_GAME[g] ?? null);
    }
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best ?? 'Pik';
}

export function chooseBidAction(ctx: BidContext): BidAction {
  // Ako je igrač već biddovao nešto, može:
  //   - PASS (odustajanje)
  //   - MOGU X (potvrda iste vrednosti)
  //   - BID Y (veca vrednost od trenutne)
  const evalRes = evaluateHand(ctx.hand);
  const best = evalRes.bestSuit;
  const maxLevel = estimatedMaxLevel(ctx.hand);

  if (ctx.playerBidLevel > 0) {
    // Mogu-eligible: vec licitirao I trenutno nadmasen (currentBid >
    // playerBidLevel). Prvi izbor je MOGU (potvrda), ali SAMO JEDAN igrac
    // sme potvrditi datu vrednost — ako je BILO KO VEC potvrdio, ta opcija
    // nestaje za sve ostale (potvrdjeno direktno, vise puta od korisnika).
    // KRITICNO (uzivo prijavljen bag — vidi estimatedMaxLevel): Mogu SME
    // da potvrdi SAMO ako trenutna vrednost jos uvek NIJE prosla iznad
    // najviseg nivoa koji ruka realno moze odbraniti — inace je potvrda
    // "napamet" i skoro sigurno vodi u pad.
    const moguEligible = ctx.currentBid > ctx.playerBidLevel;
    const alreadyConfirmedByAnyone = ctx.bids.some(
      b => b.type === 'MOGU' && b.value === ctx.currentBid,
    );
    if (moguEligible && ctx.currentBid >= 2 && ctx.currentBid <= maxLevel && !alreadyConfirmedByAnyone) {
      return { type: 'MOGU', value: ctx.currentBid };
    }
    // Ili trenutno drzim vrh (playerBidLevel === currentBid), ili sam
    // Mogu-eligible ali je Mogu vec zauzet od DRUGOG igraca — u oba slucaja
    // smem da PODIGNEM, ali SAMO do maxLevel (ista provera kao gore).
    // Uzivo prijavljen bag: igrac Mogu-eligible ostajao zaglavljen samo na
    // "dalje" kad Mogu vise nije bio dostupan, iako je imao dovoljno jaku
    // ruku da legitimno podigne na sledecu vrednost.
    const nextBid = Math.max(2, ctx.currentBid + 1);
    if (nextBid >= 2 && nextBid <= maxLevel) {
      return { type: 'BID', value: nextBid };
    }
    return { type: 'PASS' };
  }

  if (!best) return { type: 'PASS' };
  if (maxLevel === 0) return { type: 'PASS' };

  // IGRA (RULES 3.4) — igra se BEZ talona (odmah, sa poznatih 10 karata), u
  // zamenu za vecu vrednost igre kasnije. Ima smisla SAMO ako ruka VEC
  // dostize pun REQUIRED_TRICKS (6) BEZ pretpostavljenog +1 iz talona (za
  // razliku od obicne licitacije, koja na to racuna) — korisnikov zahtev,
  // uzivo potvrdjeno 2026-09-07: "Ako je ukupno 6 zasto ne kazes igru karo,
  // ako ti ne treba talon?". Stara provera (duzina>=6 karata) je bila
  // nekalibrisana i nije pogadjala ovaj slucaj (Karo K,D,9,8,7 = 5 karata).
  if (ctx.playerBidLevel === 0 && isIgraWorthy(ctx.hand)) {
    return { type: 'IGRA' };
  }

  // BID postepeno: uvek +1 u odnosu na trenutnu vrednost, ali NIKAD iznad
  // maxLevel — najviseg nivoa koji ruka realno moze odbraniti (vidi
  // estimatedMaxLevel: countSafeTricks po svakoj boji + duzina, ili 3+ asa
  // za Sans). Ovo je zamena za staru proveru "duzina najbolje boje", koja
  // nije razlikovala "duga ali slaba boja" od "kratka ali jaka" i, jos
  // bitnije, nije uopste proveravala da li JOS SME da se proglasi ta boja
  // na tom nivou (declareGame trazi gameValue >= konacna licitacija).
  const nextBid = Math.max(2, ctx.currentBid + 1);
  if (nextBid >= 2 && nextBid <= maxLevel) {
    return { type: 'BID', value: nextBid };
  }

  return { type: 'PASS' };
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
