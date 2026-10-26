// AI heuristike za Preferans — odbacivanje karata u talon i odigravanje
// karte u štihu. Koriste se iz app.js za AI igrače.

import { RANK_VALUE, RANKS } from './constants.js';
import { isCardLegal } from './trick.js';
import type { Card, Game, Suit, Position, ContraLevel } from './types.js';
import { CARD_POINTS, sequentialRunFromAce } from './aiHandEval.js';
import {
  sansDefenderLead, declarerLead, sansDefenderDiscard, defenderSafeExit, partnerSuitLead, defenderSuitLead,
  defenderTrumpPull, masterTrump, isMaster, declarerKingQueenLead, isWeakFour,
} from './aiLeads.js';
import { followAfterPartner, withoutKingGuards } from './aiDefenderFollow.js';
import { betlPlay } from './aiBetl.js';

// === DISCARD STRATEGIJA ===
//
// Analiza korisnikove partije #9 (2026-10-20): korisnik skoro uvek pravi
// PRAZNU sporednu boju (baci singl ili dubl bez asa), pa kasnije sece;
// staro pravilo je bacalo dve karte sa najmanje poena (sedmice) bez obzira
// na boju, pa su ostajali singlovi-gubitnici. Sad se ocenjuje svaki par:
// manje gubitnika u sporednim bojama (gledaju se prva 3 kruga), bonus za
// praznu boju kad ostaju 4+ aduta, kec se ne baca.

const DISCARD_SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

function discardScore(rest: Card[], out: [Card, Card], trump: Suit | null): number {
  const trumpsLeft = trump ? rest.filter((c) => c.suit === trump).length : 0;
  let score = 0;
  for (const suit of DISCARD_SUITS) {
    if (suit === trump) continue;
    const len = rest.filter((c) => c.suit === suit).length;
    const winners = sequentialRunFromAce(rest, suit);
    score -= Math.max(0, Math.min(len, 3) - winners);
    const hadSuit = out.some((c) => c.suit === suit);
    if (len === 0 && hadSuit && trumpsLeft >= 4) score += 1;
  }
  for (const c of out) if (c.rank === 'A') score -= 5;
  // izjednaceno: baci nize karte
  return score - (RANK_VALUE[out[0].rank] + RANK_VALUE[out[1].rank]) * 0.01;
}

export function chooseDiscard(hand: Card[], trump: Suit | null): [Card, Card] {
  const side = hand.filter((c) => c.suit !== trump);
  const pool = side.length >= 2 ? side : hand;
  let best: [Card, Card] = [pool[0]!, pool[1]!];
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const out: [Card, Card] = [pool[i]!, pool[j]!];
      const rest = hand.filter((c) => c !== out[0] && c !== out[1]);
      const score = discardScore(rest, out, trump);
      if (score > bestScore) { bestScore = score; best = out; }
    }
  }
  return best;
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
  // Istorija zavrsenih stihova cele ruke (za sada koristi se samo da
  // nosilac prepozna da li je neki pratilac vec pokazao da je bez aduta —
  // vidi konvenciju izvlacenja aduta ispod).
  tricks?: { player: Position; card: Card }[][];
  // Stvarno SLEDECI AKTIVNI igrac posle mene (preskace pratioca koji sedi
  // u solo odbrani — vidi Game.nextActivePlayer()/nextActivePlayer() iz
  // turnOrder.ts). Bez ovoga se koristi naivno (myPosition+1)%3, sto je
  // pogresno bas u solo-odbrani (jedini scenario gde razlika uopste
  // postoji, jer se tad neko preskace).
  nextActivePosition?: Position | null;
  // Najvisa vrednost do koje je SVAKI igrac licitirao ovu rundu (traje kroz
  // celu ruku, resetuje se tek na newHand() — vidi Player.bidLevel).
  // Koristi se za konvenciju ispod: partnerova licitacija otkriva boju.
  bidLevels?: [number, number, number];
  // igra se udvoje (drugi pratilac ne igra) — vidi defenderSafeExit
  twoHanded?: boolean;
  // ko je dao kontru (partnerova kontra na Sans odredjuje izlaz, aiLeads.ts)
  kontraPlayer?: Position | null;
  // nosiocev skart (zna ga samo nosilac) — za brojanje karata u Betlu
  discard?: Card[];
}): Card | null {
  const {
    hand, currentTrick, trump, avoidTricks = false,
    isDeclarer = false, kontraLevel = null, trickCount = 0,
    myPosition, declarer, tricks = [], nextActivePosition = null,
    bidLevels, twoHanded = false, kontraPlayer = null,
  } = args;
  const legal = hand.filter(c => isCardLegal(c, hand, currentTrick, trump));
  if (legal.length === 0) return null;

  // Betl: nosiocev izlaz i sva igra pratilaca (aiBetl.ts, korisnik 2026-10-26)
  const isBetl = args.declaredGame === 'Betl' || args.declaredGame === 'Igra-Betl';
  if (isBetl && myPosition != null && declarer != null) {
    const discard = isDeclarer ? args.discard ?? [] : [];
    const card = betlPlay({ hand, legal, currentTrick, tricks, myPosition, declarer, discard });
    if (card) return card;
  }

  // Vodim prvi — igraj najslabiju kartu (dobro i za osvajanje kasnije i za
  // izbegavanje štiha sad)
  if (currentTrick.length === 0) {
    const partner = ([0, 1, 2] as Position[]).find(p => p !== myPosition && p !== declarer);
    const leadCtx = myPosition != null && declarer != null
      ? {
        legal, hand, trump, myPosition, declarer, tricks, twoHanded,
        nextToAct: nextActivePosition ?? (((myPosition + 1) % 3) as Position),
        partnerBidLevel: partner !== undefined && bidLevels ? bidLevels[partner] : undefined,
        partnerKontra: partner !== undefined && kontraPlayer === partner,
      }
      : null;
    // Pratilac protiv Sansa/Igra-Sansa: najduza boja, vrh niza, i nastavlja je
    // (aiLeads.ts; zamenilo raniju konvenciju "prvi stih iz trefa, uz kontru iz
    // pika" — korisnik je u partiji #10 otvarao svoju najduzu boju).
    const isSans = args.declaredGame === 'Sans' || args.declaredGame === 'Igra-Sans';
    if (!isDeclarer && isSans && leadCtx) {
      const lead = sansDefenderLead(leadCtx);
      if (lead) return lead;
    }
    // Pratilac protiv adutske igre: partnerova boja, pa A,K, K,D i as najduze
    // boje (aiLeads.ts, korisnik posle partija #12/#13). Ranije (partija #9)
    // se naplacivao najkraci as — korisnik je tad igrao asa pre niske karte.
    if (!isDeclarer && trump && leadCtx) {
      const lead = defenderTrumpPull(leadCtx) ?? partnerSuitLead(leadCtx) ?? defenderSuitLead(leadCtx);
      if (lead) return lead;
    }
    // Napad na adute nosioca (korisnikova ispravka uzivo, 2026-09-20, iz
    // analize stvarne partije — runda 13, Edge vodi Pik dva puta zaredom
    // iako je nosilac vec posekao prvi put): kad pratilac vodi, ako
    // nosilac VEC nije pratio neku vanadutsku boju ranije ove ruke (dakle
    // pokazao je da je u njoj bez karata), NASTAVI da vodis bas tu boju —
    // ovo NIJE greska/poklon jeftinog sečenja, vec namerna taktika:
    // primorava nosioca da trosi adute svaki put kad se ta boja povede,
    // pre nego sto stigne SAM da ih izvuce, sto kasnije stiti odbranu
    // (korisnik: "pratilac pokusava da izbije adute nosiocu na taj
    // nacin"). Vodi NAJSLABIJOM kartom te boje — poenta je da nosilac
    // potrosi adut, ne da ova konkretna karta pobedi stih.
    if (!isDeclarer && trump && declarer != null && tricks.length > 0) {
      const declarerVoidSuits = new Set<Suit>();
      for (const trick of tricks) {
        const ledSuit = trick[0]?.card.suit;
        if (!ledSuit || ledSuit === trump) continue;
        const declarerPlay = trick.find(tc => tc.player === declarer);
        if (declarerPlay && declarerPlay.card.suit !== ledSuit) {
          declarerVoidSuits.add(ledSuit);
        }
      }
      const attackCards = legal.filter(c => declarerVoidSuits.has(c.suit));
      if (attackCards.length > 0) {
        return attackCards.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
      }
    }
    // POVUCENO (2026-09-22, uzivo prijavljeno "AI igra potpuno suprotno i
    // uzasno lose" odmah posle deploya): pretpostavka da bidLevel>0 znaci
    // "partner je NAMERNO signalizirao BAS tu boju" je pogresna — u
    // stvarnom toku licitacije SKORO SVAKI ucesnik koji odmah ne pasira
    // prolazi kroz vise vrednosti dok licitacija raste (bidLevel se azurira
    // na SVAKI bid/Mogu, ne samo na "svesan izbor da stane bas tu"), pa je
    // ovaj uslov bio skoro UVEK tacan i preglasavao je ostale, bolje
    // utemeljene konvencije (declarerVoidSuits, vodjenje kroz partnera) na
    // svakom vodjenju. Vraceno bez zamene dok se ne nadje pouzdaniji signal
    // (npr. stvarna sekvenca licitacije, ne samo finalni bidLevel) — vidi
    // [[project_preferans_bid_signal_heuristic_2026_09_22]] u memoriji.
    // Od 2026-10-24 partnerova licitacija odredjuje SAMO prvo otvaranje
    // odbrane, po korisnikovom izricitom pravilu (partnerSuitLead gore).
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
    // Nosilac: izvlacenje aduta pre igranja duge/jake boje (korisnikova
    // pravila uzivo, 2026-09-19): ako nosilac drzi 5+ aduta ukljucujuci
    // asa, ILI tacno 4 aduta koji su sve cetiri casne (A,K,D,J), vodi
    // adutom — SVE DOK nijedan pratilac jos nije pokazao da je bez aduta
    // (odbacio van-adutsku kartu kad je adut vec vodjen). Korisnik: "ako
    // poslije prve runde vidi da jedan pratilac nema nijedan adut, onda
    // ne sme dalje" — dalje vucenje bi samo trosilo sopstvene adute bez
    // ikakve koristi, jer taj pratilac vise ne moze biti isteran iz aduta.
    if (isDeclarer && trump && myPosition != null) {
      const myTrumpsNow = legal.filter(c => c.suit === trump);
      // Kvalifikacija se racuna na osnovu ORIGINALNOG adutskog poseda (ne
      // trenutnog, koji se smanjuje kako se aduti izvlace) — inace bi
      // "qualifies" prestalo da vazi cim broj aduta u ruci padne ispod
      // praga, tacno u trenutku kad treba preci na sledecu fazu (dugu
      // boju) umesto da propadne na staro generalno ponasanje.
      const trumpsIPlayedBefore: Card[] = [];
      for (const trick of tricks) {
        const mine = trick.find(tc => tc.player === myPosition);
        if (mine && mine.card.suit === trump) trumpsIPlayedBefore.push(mine.card);
      }
      const originalTrumps = [...myTrumpsNow, ...trumpsIPlayedBefore];
      const hasAce = originalTrumps.some(c => c.rank === 'A');
      const hasAllFourHonors = (['A', 'K', 'Q', 'J'] as const).every(r =>
        originalTrumps.some(c => c.rank === r)
      );
      // Prosireno 2026-10-20 (analiza korisnikove partije #9 — korisnik je
      // vukao adute i sa A,K,D,9 / A,K,D,10 / K,D,10,8): i 4 aduta sa bar dva
      // honora, i 5+ bez asa sa bar dva honora ("pet sitnih" i dalje ne).
      // Prvi krug ide uvek; dalje vazi isto zaustavljanje kao gore. Proba
      // protiv starog AI-ja (40.000 deljenja): oko 4,5 poena po ruci bolje.
      const honorCount = (['A', 'K', 'Q', 'J'] as const).filter(r => originalTrumps.some(c => c.rank === r)).length;
      const extendedDraw = honorCount >= 2 && (originalTrumps.length === 4 || (originalTrumps.length >= 5 && !hasAce));
      // 4 aduta bez K i D: ne krece se iz aduta (korisnik 2026-10-24, #14 ruka
      // 8, Bora A,J,10,8 herc: "ne treba da krece adutom. Nema ih dovoljno i plus
      // nisu najjaci"), ali adut se igra kasnije: "kad vidis da je ostao jedan
      // adut a ti mozes da ga uzmes, naravno da ces igrati adut".
      const weakFour = leadCtx ? isWeakFour(leadCtx) : false;
      const qualifies =
        (originalTrumps.length >= 5 && hasAce) || (originalTrumps.length === 4 && hasAllFourHonors) || extendedDraw;
      if (qualifies) {
        // Zaustavljanje (korisnikova ispravka uzivo, 2026-09-19): NE stajem
        // kad pratilac pokaze void (to je bezopasno, taj pratilac vise
        // nema cime da sece) — stajem kad NEOTKRIVENI aduti kod pratilaca
        // (oni koje nisam video ni u svojoj ruci ni odigrane) dostignu broj
        // mojih preostalih aduta. To je najgori moguci slucaj — da su svi
        // neotkriveni aduti kod JEDNOG pratioca, sto bi znacilo da taj
        // pratilac drzi isto ili vise aduta od mene. Nema nacina da vidim
        // ciju je tacno karta (protivnicke ruke su skrivene), pa branim se
        // od najgoreg slucaja umesto da racunam na povoljniju raspodelu.
        const trumpsPlayedByDefenders = tricks.reduce((count, trick) => {
          const theirs = trick.filter(tc => tc.player !== myPosition && tc.card.suit === trump);
          return count + theirs.length;
        }, 0);
        const undiscoveredDefenderTrumps = RANKS.length - originalTrumps.length - trumpsPlayedByDefenders;
        // prvi krug = jos nisam VODIO adut; secenje (npr. u 1. stihu) se ne
        // racuna — partija #11 ruka 10: Milan je isekao prvi tref i zato
        // nikad nije povukao adut (korisnik: "mogao je jednom adut").
        const iLedTrump = tricks.some(t => t[0]?.player === myPosition && t[0].card.suit === trump);
        const firstRoundOfExtended = extendedDraw && !iLedTrump && !weakFour;
        // Sporedna boja: prvo nastavi onu koju sam vec vodio, pa najduza, pa
        // ona sa vise najjacih karata — partija #11 ruka 10: Milan posle A,K
        // pik otvorio K,J karo ("nek nastavi sa pikom, zasto je stao?");
        // #13 ruka 12: posle K,D pik Bora otvorio J,8 herc ("trebalo je da
        // nastavi sa 7 pik"); #12 ruka 7: A,8,7 pik pre A,K,D karo.
        const bySuit = new Map<Suit, Card[]>();
        for (const c of legal) {
          if (c.suit === trump) continue;
          if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
          bySuit.get(c.suit)!.push(c);
        }
        const lastLed = [...tricks].reverse().find(t => t[0]?.player === myPosition)?.[0]?.card.suit;
        const masterCount = (cards: Card[]) => (leadCtx ? cards.filter(c => isMaster(leadCtx, c)).length : 0);
        const sideSuit = [...bySuit.values()].sort((a, b) => {
          const contA = a[0]!.suit === lastLed ? 1 : 0;
          const contB = b[0]!.suit === lastLed ? 1 : 0;
          if (contA !== contB) return contB - contA;
          if (b.length !== a.length) return b.length - a.length;
          if (masterCount(a) !== masterCount(b)) return masterCount(b) - masterCount(a);
          const topA = Math.max(...a.map(c => RANK_VALUE[c.rank]));
          const topB = Math.max(...b.map(c => RANK_VALUE[c.rank]));
          return topB - topA;
        })[0];
        const highestTrump = () => myTrumpsNow.slice().sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])[0]!;
        const highestSide = () => sideSuit!.slice().sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])[0]!;
        if (myTrumpsNow.length > 0 && undiscoveredDefenderTrumps > 0
          && (undiscoveredDefenderTrumps < myTrumpsNow.length || firstRoundOfExtended)) {
          return highestTrump();
        }
        // Pratioci vise nemaju adut: vuci jos (pratilac mora da skartira, mozda
        // bas tu boju), ali sacuvaj onoliko aduta koliko puta ces jos dati ruku
        // u svojoj boji — da posle secenja opet igras nju. Korisnik, partija
        // #11 ruka 12 (7 aduta i J,10,9 pik): "igrao bih 5 puta adut, pa pik,
        // pa kad posecem, opet pik i onda se nadam da ce moj poslednji pik da
        // uzme stih". Ranije je odigrao svih 7 aduta, pa 3 gubitnika pik.
        if (myTrumpsNow.length > 0 && undiscoveredDefenderTrumps <= 0) {
          if (!sideSuit) return highestTrump();
          const seen = new Set<string>(hand.map(c => c.id));
          for (const t of tricks) for (const tc of t) seen.add(tc.card.id);
          const top = Math.max(...sideSuit.map(c => RANK_VALUE[c.rank]));
          const higherOut = RANKS.filter(r => RANK_VALUE[r] > top && !seen.has(`${r}${sideSuit[0]!.suit}`)).length;
          const reserve = Math.min(higherOut, sideSuit.length - 1);
          if (myTrumpsNow.length > reserve) return highestTrump();
        }
        // Brojanje (korisnik 2026-10-24, #13 ruke 12 i 25): dok pratioci mozda
        // jos imaju adut, a moj najjaci adut je najjaci preostali, igra se on
        // pre sporedne karte koja je i sama najjaca (D pik bi bio isecen) i kad
        // su ostali samo aduti (K karo obara poslednju Damu). Sporedna boja
        // koju tek treba izbiti ide pre aduta (#11 ruka 10: "nek nastavi sa
        // pikom" J,10 pik, K herc ostaje).
        // Sa 4 slaba aduta samo kad najjaci pokrivaju sve preostale.
        const master = leadCtx ? masterTrump(leadCtx) : null;
        const masterTrumps = leadCtx ? myTrumpsNow.filter(c => isMaster(leadCtx, c)).length : 0;
        if (master && undiscoveredDefenderTrumps > 0 && (!sideSuit || isMaster(leadCtx!, highestSide()))
          && (!weakFour || undiscoveredDefenderTrumps <= masterTrumps)) {
          return master;
        }
        // Bez vucenja aduta prvo boja sa K,D — kecevi se cuvaju (#14 ruka 8:
        // "trebalo je K karo").
        if (weakFour && leadCtx) {
          const kingQueen = declarerKingQueenLead(leadCtx);
          if (kingQueen) return kingQueen;
        }
        // Adut je iscrpljen u mojoj ruci, ili bi neki pratilac mogao da
        // drzi isto ili vise aduta od mene — vreme je za sporednu boju.
        if (sideSuit) return highestSide();
      }
    }
    // Nosilac u Sansu/Igra-Sansu (BEZ aduta): uzivo prijavljen bag
    // (2026-10-03, analiza korisnikove stvarne ruke — Zapad drzao A,K,Q,J,10
    // trefa (duga jaka boja) ali je posle prvog stiha odigrao usamljenu
    // Damu herc, jedinu kartu te boje, umesto da vodi iz trefa). Gornja
    // "izvuci adut pa igraj najdužu boju" grana je gatovana sa `trump` i
    // NIKAD se ne izvrsava kad adута nema — nosilac u Sansu je bez IKAKVE
    // logike za izbor boje padao pravo na generican "najmanje poena"
    // fallback ispod, koji NE zna niti mu je bitno iz koje je boje karta.
    // Isto pravilo kao kod trefa/aduta: vodi iz NAJDUZE (pa najjace) boje —
    // u no-trump igri dugacka boja na kraju nosi dodatne stihove kad se
    // protivnicke karte u njoj istrose, usamljena casna karta u kratkoj
    // boji samo gubi od prve vise karte koju drzi neko od pratilaca.
    // Betl je takodje bez aduta, ali cilj je OBRNUT (ne uzeti stih) — ova
    // grana bi vodila NAJVISOM kartom najduze boje (npr. As herc u Betlu;
    // nadjeno 2026-10-20 u analizi korisnikove partije #9). Betl ide na
    // "najslabija karta" fallback ispod.
    if (isDeclarer && !trump && !avoidTricks) {
      const bySuit = new Map<Suit, Card[]>();
      for (const c of legal) {
        if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
        bySuit.get(c.suit)!.push(c);
      }
      const bestSuitCards = [...bySuit.values()].sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        const topA = Math.max(...a.map(c => RANK_VALUE[c.rank]));
        const topB = Math.max(...b.map(c => RANK_VALUE[c.rank]));
        return topB - topA;
      })[0];
      // SAMO kad postoji stvarna duzina (2+ karte) — bez toga (sve same
      // jedinke, kao sto test niz pokazuje) nema koga da "razvijes", pa
      // propadni na stari "najslabija karta" fallback ispod (cuva jaku
      // kartu, npr. Asa, za kasnije umesto da je potrosi bez razloga sad).
      if (bestSuitCards && bestSuitCards.length >= 2) {
        return bestSuitCards.slice().sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])[0]!;
      }
    }
    // Konvencija vodjenja "kroz nosioca slabom, kroz partnera jakom kartom"
    // (istrazivanje 2026-09-18, preferans.hr signalizacija — korisnikov
    // zahtev da se ugradi): kad pratilac vodi NOVI stih (bilo koji, ne samo
    // prvi), sledeci na potezu je po REDOSLEDU AKTIVNIH igraca (vidi
    // nextActivePosition ispod — NE prost (myPosition+1)%3, koji bi u SOLO
    // odbrani (samo jedan pratilac dosao, drugi sedi) pogresno "video"
    // sedeceg pratioca kao partnera na potezu, iako on uopste ne igra ovu
    // ruku — bag nadjen analizom stvarne partije 2026-09-19, runda 11: Edge
    // je solo branio Sans, kod (myPosition+1)%3 bi pokazivao na Antonija
    // koji je rekao "Ne dodjem" i ne igra, umesto na stvarno sledeceg
    // aktivnog igraca, nosioca Telefona) — uvek ili nosilac ili partner,
    // nikad nepoznato. Ako je nosilac sledeci, slaba karta ga ne "hrani"
    // informacijom (postojece ponasanje ispod, nepromenjeno). Ako je
    // PARTNER sledeci, vodi se NAJJACOM kartom u najboljoj vanadutskoj
    // boji — partner iz toga cita da nosilac verovatno NEMA visu kartu te
    // boje (inace bi je nosilac vec odigrao/pokrio), umesto da nagadja.
    // Namerno SAMO za pratioca (nosilac ima drugaciju logiku — izvlacenje
    // aduta/duge boje, ne signalizaciju partneru koji ne postoji za njega)
    // i samo kad ranije, specificnije konvencije (Sans-izlazak, "suva"
    // vanadutska boja) nisu vec odlucile.
    if (!isDeclarer && myPosition != null && declarer != null) {
      const nextToAct = nextActivePosition ?? (((myPosition + 1) % 3) as Position);
      const leadingTowardPartner = nextToAct !== declarer;
      if (leadingTowardPartner) {
        const nonTrump = trump ? legal.filter(c => c.suit !== trump) : legal;
        const pool = nonTrump.length > 0 ? nonTrump : legal;
        const strongest = pool.slice().sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])[0]!;
        // Prag "Dama ili bolje" (istrazivanje 2026-09-18, preferansklub.com:
        // "sve manje od Dame je isto kao da bacate malu kartu") — ako mi je
        // NAJJACA raspoloziva karta ispod Dame (J ili nize), ona zapravo ne
        // nosi pouzdan signal "nosilac verovatno nema visu kartu" (previse
        // karata iznad nje jos moze biti bilo gde), pa se ne isplati lazno
        // predstavljati kao "jaka" — propadni na obican slab izlazak ispod.
        if (RANK_VALUE[strongest.rank] >= RANK_VALUE['Q']) {
          return strongest;
        }
      }
    }
    // Nosilac (adutska igra) koji ne vuce adute: naplati najjace preostale
    // karte umesto da najnizom daruje stih (aiLeads.ts, korisnik u partiji #10).
    // Pre toga boja sa K,D (as kod protivnika) — kecevi se cuvaju (#14 ruka 8:
    // Bora sa A pik i K,D karo, adut ne vuce: "trebalo je K karo").
    if (isDeclarer && trump && leadCtx) {
      const lead = declarerKingQueenLead(leadCtx) ?? declarerLead(leadCtx);
      if (lead) return lead;
    }
    // Pratilac: ne otvara K,x / D,x (aiLeads.ts, korisnik u partiji #11).
    if (!isDeclarer && trump && leadCtx) {
      const exit = defenderSafeExit(leadCtx);
      if (exit) return exit;
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

  const isBetlGame = args.declaredGame === 'Betl' || args.declaredGame === 'Igra-Betl';
  if (sameSuit.length > 0 && !isDeclarer && !isBetlGame && declarer != null) {
    const pick = followAfterPartner({ hand, legal, currentTrick, trump, declarer, tricks });
    if (pick) return pick;
  }
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

    // Cuvanje "stopera" za kasnije (korisnikova uzivo zapazena taktika,
    // runda 9, 2026-09-21: nosilac vodi J karo, pratilac drzi D karo ali je
    // NE igra jer zna da ce partner — vec pokazan bez karo — seci adutom;
    // cuva Damu za SLEDECI karo koji nosilac povede, kad partner mozda vise
    // nece imati adut). Razlikuje se od teammateIsWinning gore (koji gleda
    // SAMO trenutno vec odigrane karte u ovom stihu) — ovde partner JOS
    // NIJE odigrao u ovom stihu, ali njegov teren je vec poznat (pokazao je
    // ranije da je bez ove boje). Pošto ova funkcija nize (grana "Moram
    // adut") uvek NAMECE partneru da sece kad je bez boje i drzi adut, isti
    // ishod je izvestan i ovde — trošenje jake karte sad je uzaludno cim
    // partner sigurno presece bez obzira sta ja odigram.
    const teammate = !isDeclarer && myPosition != null && declarer != null
      ? ([0, 1, 2] as Position[]).find(p => p !== myPosition && p !== declarer)
      : undefined;
    let teammateWillCertainlyRuff = false;
    if (teammate !== undefined && !isTrumpHighest && !currentTrick.some(tc => tc.player === teammate)) {
      let teammateVoidInLead = false;
      let teammateVoidInTrump = false;
      for (const trick of tricks) {
        const ledSuit = trick[0]?.card.suit;
        const play = trick.find(tc => tc.player === teammate);
        if (!ledSuit || !play) continue;
        if (ledSuit === leadSuit && play.card.suit !== leadSuit) teammateVoidInLead = true;
        if (trump && ledSuit === trump && play.card.suit !== trump) teammateVoidInTrump = true;
      }
      teammateWillCertainlyRuff = teammateVoidInLead && !teammateVoidInTrump;
    }

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
    } else if (!teammateIsWinning && !teammateWillCertainlyRuff) {
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
  const isSansGame = args.declaredGame === 'Sans' || args.declaredGame === 'Igra-Sans';
  if (!isDeclarer && isSansGame && myPosition != null && declarer != null) {
    const card = sansDefenderDiscard({ legal, hand, trump, myPosition, declarer, tricks });
    if (card) return card;
  }
  // Inače — najslabija, ali NIKAD as/kralj ako postoji alternativa bez njih
  // (istrazivanje 2026-09-18, preferans.hr signalizacija: "nikad se ne
  // odbacuje karta iz boje u kojoj bi izvodjac mogao pasti" — kao pratilac
  // sam odbacaj, cuvaj eventualni stoper (as/kralj) u nekoj boji za
  // kasnije, dok god imam bar jednu kartu koja NIJE as/kralj da bacim
  // umesto toga).
  const nonHonor = legal.filter(c => c.rank !== 'A' && c.rank !== 'K');
  const basePool = nonHonor.length > 0 ? nonHonor : legal;
  const pool = isDeclarer ? basePool : withoutKingGuards(hand, basePool);
  // Visak duge boje sa A,K (korisnik 2026-10-24, #13 ruka 32: Milan ♣A,K,10,9
  // ♠K,J,8 ♦K,10 bacio 8 pik — "Ako ima A, K i jos 2 u trefu ... velika je
  // sansa da nosilac nema toliko trefova ... bas dobar primjer sta je lako
  // skartati"): niske karte te boje ne nose, a mala uz K,J cuva kralja.
  if (!isDeclarer && trump) {
    const spare = (['♠', '♥', '♦', '♣'] as Suit[])
      .map(s => hand.filter(c => c.suit === s).sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]))
      .filter(cards => cards.length >= 4 && cards.some(c => c.rank === 'A') && cards.some(c => c.rank === 'K'))
      .map(cards => cards[0]!)
      .filter(c => legal.includes(c));
    if (spare.length > 0) return spare.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])[0]!;
  }
  // Odbacivanje viska iz nosiočeve VEC POZNATE prazne boje (korisnikova
  // uzivo zapazena taktika, runda 11, 2026-09-21): "kad vidis da nosilac
  // nema jednu boju, znas sta mozes da skartas na njegove adute kasnije,
  // ali ne sve da bi opet imao da mu odigras kad bude tvoja ruka." Boja u
  // kojoj je nosilac vec pokazao void je odlicno oruzje za buduce vodjenje
  // (primorava ga da sece — ista logika kao napad-na-adute-nosioca gore u
  // ovoj funkciji), pa je odbacivanje VISKA iz te boje bezopasno (jedna
  // karta je dovoljna da se napad kasnije ponovi), dok bi trosenje neke
  // DRUGE boje moglo da ostavi bez ikakve karte za vodjenje kad se stih
  // konacno osvoji. Zadrzi BAR JEDNU — nikad ne prazni celu tu boju ovde.
  if (!isDeclarer && declarer != null && tricks.length > 0) {
    const declarerVoidSuits = new Set<Suit>();
    for (const trick of tricks) {
      const ledSuit = trick[0]?.card.suit;
      if (!ledSuit || ledSuit === trump) continue;
      const declarerPlay = trick.find(tc => tc.player === declarer);
      if (declarerPlay && declarerPlay.card.suit !== ledSuit) {
        declarerVoidSuits.add(ledSuit);
      }
    }
    if (declarerVoidSuits.size > 0) {
      const countInHand = new Map<Suit, number>();
      for (const c of hand) countInHand.set(c.suit, (countInHand.get(c.suit) ?? 0) + 1);
      const surplus = pool.filter(c => declarerVoidSuits.has(c.suit) && (countInHand.get(c.suit) ?? 0) > 1);
      if (surplus.length > 0) {
        return surplus.sort((a, b) => {
          const pa = CARD_POINTS[a.rank] ?? 0;
          const pb = CARD_POINTS[b.rank] ?? 0;
          if (pa !== pb) return pa - pb;
          return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
        })[0]!;
      }
    }
  }
  return pool.sort((a, b) => {
    const pa = CARD_POINTS[a.rank] ?? 0;
    const pb = CARD_POINTS[b.rank] ?? 0;
    if (pa !== pb) return pa - pb;
    return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  })[0]!;
}
