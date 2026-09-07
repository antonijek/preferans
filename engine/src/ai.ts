// AI heuristike za Preferans — čiste funkcije, bez stanja
// Koriste se iz app.js za AI igrače

import { RANK_VALUE, SUITS, GAME_VALUES, STANDARD_GAMES } from './constants.js';
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

// Najviši nivo (2-7) koji ruka realno moze da odbrani kao NOSILAC —
// REQUIRED_TRICKS je 6/10 za SVE standardne igre (constants.ts), pa broj
// licita 2-7 sam po sebi ne govori NISTA o broju potrebnih stihova, samo
// bira koji CE SE adut/igra kasnije smeti proglasiti (declareGame trazi
// gameValue >= konacna licitirana vrednost). Uzivo prijavljen bag: stara
// verzija je gledala SAMO duzinu najbolje boje kod SVAKOG sledeceg nivoa,
// bez provere da li ta boja uopste JOS SME da se proglasi na tom nivou —
// npr. ruka jaka u Piku (vrednost 2) je slepo "Mogu"-ovala do 3 ili 5, pa
// se na kraju MORALA proglasiti Karo/Tref umesto Pik, i redovno padala.
// Ovo racuna: (a) za svaku od 4 boje kao adut, countSafeTricks — ako ima
// bar 2 sigurna stiha I dovoljnu duzinu, boja "vazi" do SVOJE GAME_VALUES
// vrednosti; (b) Sans (bez aduta) — potrebna siroko rasprostranjena snaga
// (3+ asa), ne samo jedna duga boja.
// Sigurni stihovi ZA NOSIOCA (deklaranta) — namerno STROZE od
// countSafeTricks (koje je za PRATIOCA). Korisnikov zahtev, uzivo
// potvrdjeno 2026-09-06 kroz rucnu kalibraciju ("drugi/treci K ima
// vrednost kada pratis, mozes da racunas da imas stih, ali kao nosilac
// ne"): go Kralj (bez keca iza njega u istoj boji) NIJE siguran stih za
// deklaranta — nosilac mora SAM da vodi/probija tu boju bez pozicione
// prednosti koju pratilac ima (cekanje da vidi ko je prazan pre nego sto
// baci svoju kartu). Samo pravi asovi (i adutska A+K kombinacija) racunaju.
const RANK_ORDER_DESC = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'] as const;

// Koliko karata drzim u nizu OD ASA NADOLE u datoj boji (A,K,D,J,10,9,8,7 —
// prvi "rupa" prekida niz). Koristi se i za Sans (bez aduta, gde SVE boje
// rade po ovom principu) i za sporedne boje POSLE izvlacenja aduta (vidi
// countDeclarerTricks — korisnikov zahtev, uzivo potvrdjeno 2026-09-06).
function sequentialRunFromAce(hand: Card[], suit: Suit): number {
  const ranksHeld = new Set(hand.filter(c => c.suit === suit).map(c => c.rank));
  let run = 0;
  for (const r of RANK_ORDER_DESC) {
    if (!ranksHeld.has(r)) break;
    run += 1;
  }
  return run;
}

// Sporedna boja (POSLE izvlacenja aduta, secenje vise nije rizik) kad NE
// drzim njen As: korisnikov zahtev, uzivo potvrdjeno 2026-09-06 ("K i D su
// uvek stih... ko god da igra, neka K odnese A, ostaje D najjaca, siguran
// stih") — As kod nekog drugog moze da "ubije" SAMO JEDNU od moje dve
// najjace karte (K ili D), bez obzira kad je odigra, pa mi ostaje TACNO 1
// sigurno kad drzim i K i D (bez obzira na dodatnu duzinu — za razliku od
// aduta, ovde "prazna" boja kod pratioca ne cini ostatak automatski
// sigurnim, jer nema secenja/izvlacenja da to iznudi).
function sideSuitTricksPostDraw(hand: Card[], suit: Suit): number {
  const cards = hand.filter(c => c.suit === suit);
  if (cards.some(c => c.rank === 'A')) return sequentialRunFromAce(hand, suit);
  const hasK = cards.some(c => c.rank === 'K');
  const hasD = cards.some(c => c.rank === 'Q');
  // Korisnikov zahtev, uzivo potvrdjeno 2026-09-06: garancija vazi SAMO za
  // kratku boju (K,D same ili K,D + 1 mala — dužina do 3); za dužu ("ako
  // nije predugacko") se gubi — razlog jos nije potpuno razjasnjen (pitanje
  // postavljeno korisniku), privremeno ograniceno na dužinu <=3.
  return hasK && hasD && cards.length <= 3 ? 1 : 0;
}

function countDeclarerTricks(hand: Card[], trump: Suit | null): number {
  const trumps = hand.filter(c => trump !== null && c.suit === trump);
  const trumpA = trumps.some(c => c.rank === 'A');
  const trumpK = trumps.some(c => c.rank === 'K');
  const trumpD = trumps.some(c => c.rank === 'Q');
  let safe = 0;
  // Kalibrisano uzivo od korisnika (2026-09-06, rucno prosao ~10 ruku):
  // As+Kralj u adutu nosi CELU duzinu boje kao stihove (npr. A,K,Q,8 = 4,
  // A,K,J,10 = 4, A,K,7,8,9 = 5 — i treca Dama kod pratioca je "mala sansa",
  // ne racuna se kao rizik). Go As (bez Kralja) ILI Kralj+Dama (bez Asa)
  // nose duzinu MINUS JEDAN — u oba slucaja SAMO JEDNA visa karta (Kralj
  // odn. As) je "u riziku" kod nekog pratioca; korisnikov konkretan primer
  // za K,D,9,8 (duzina 4, bez Asa, tipican 2-2 raspored kod pratilaca):
  // "igras K, oni uhvate A, posle toga igras D, oni bace po jednu sto im je
  // ostala, i ti nosis i sledeca 2 aduta jer ih pratioci vise nemaju" — 3 od
  // 4, izgubljen tacno 1 (Kralj) na Asa. Go Kralj BEZ Dame (ni Asa ni Dame)
  // se NE racuna uopste za nosioca (vidi countSafeTricks komentar — go
  // Kralj sam ima vrednost SAMO za pratioca, ne za deklaranta) — dve karte
  // (i As i Dama) su tada "u riziku", ne samo jedna.
  const hasTrumpAK = trumpA && trumpK;
  if (hasTrumpAK) {
    safe += trumps.length;
  } else if (trumpA && !trumpK) {
    // Go As (bez Kralja) — DVE opasne karte (K i D) su i dalje kod
    // protivnika. Sa kratkom duzinom (<=3) nema "viska" rundi: protivnik sa
    // dužom rukom pokriva sve moje preostale karte do kraja (korisnikov
    // zahtev, uzivo potvrdjeno 2026-09-06: duzina3=1, ne 2 — "Ako imas samo
    // 3 aduta... treci A je samo jedan stih... duza boja znaci kod njih
    // manje aduta"). Tek od duzine 4 ostaje visak (korisnikova formula:
    // "4,5,ili 6 aduta sa A, bez K... broj aduta -1").
    safe += trumps.length <= 3 ? 1 : trumps.length - 1;
  } else if (trumpK && trumpD) {
    safe += Math.max(0, trumps.length - 1);
  }

  // Bilo koja "vredna" adutska kombinacija (As+Kralj, go-As, ili Kralj+Dama)
  // SAMA PO SEBI ne garantuje da ce SVI protivnicki aduti biti izvuceni —
  // bitna je DUZINA, ne tacno koje karte drzim: vodjenje aduta primorava
  // svakoga da prati (ko god pojedinacnu rundu dobije), pa se svih 8 karata
  // ionako isprazni posle dovoljno rundi (korisnikov zahtev, uzivo
  // potvrdjeno 2026-09-06 — go-As dužine 4 [bez Kralja] JOS UVEK stiti
  // sporedne boje, isto kao As+Kralj: "kao nosilac racunao bih da mozda
  // imam i 5... Na pik 3, herc 1 i K,D,9 takodje 1"). Duzina >=3 je minimum
  // da se u najgorem rasporedu (do 2 preostala po protivniku) sve izvuku
  // pre nego sto meni ponestane aduta za vodjenje.
  // KRITICNO: mora zahtevati da adut SAM PO SEBI vec nosi realan kredit
  // (hasTrumpAK, go-As, ili Kralj+Dama) — go-Kralj BEZ Asa i BEZ Dame ne
  // garantuje ni prvu rundu (protivnicki as ga odmah kupi), pa nikako ne
  // moze "stititi" sporedne boje (uzivo prijavljen bag: Pik K,J,8 bez ijedne
  // druge cаsne karte je pogresno otkljucavao sporedni Tref K,D bonus).
  const trumpHasRealCredit = hasTrumpAK || trumpA || (trumpK && trumpD);
  const trumpsFullyDrawable = trumpHasRealCredit && trumps.length >= 3;

  if (trumpsFullyDrawable) {
    // Korisnikov zahtev, uzivo potvrdjeno 2026-09-06 ("racunas da imas 4 na
    // tref i 2 na herc, jer ces adute izbiti pre odigravanja herca, pa
    // eventualno ti ne mogu seci — dakle imas 6 stihova"): kad se adut moze
    // POTPUNO izvuci (drzim As+Kralj), rizik od SECENJA u sporednim bojama
    // nestaje, pa se ONE racunaju kao u Sansu (niz od asa nadole), ne samo
    // "+1 po asu" — npr. A,K,10 u sporednoj boji tad nosi 2 (As+Kralj), ne 1.
    for (const s of SUITS) {
      if (s === trump) continue;
      safe += sideSuitTricksPostDraw(hand, s);
    }
  } else {
    // Adut se NE moze pouzdano potpuno izvuci — sporedni as je i dalje
    // vredan, ali bez garancije da ce sporedni Kralj/dodatna duzina prezivi
    // eventualno secenje, pa ostaje na konzervativnom "+1 po asu".
    const offAces = hand.filter(c => c.rank === 'A' && c.suit !== trump).length;
    safe += offAces;
  }
  return safe;
}

// Potrebno stihova U RUCI (pre talona) da bi se licitiralo — korisnikova
// kalibracija uzivo (2026-09-06): nosiocu treba 6 stihova ukupno, a JEDAN
// se racuna kao "besplatan" iz talona (2 uzete karte, 2 se odbacuju — u
// proseku donosi priblizno 1 dodatni stih), pa u SVOJIH 10 karata treba
// ~5 realnih stihova pre nego sto se uopste razmatra licitacija. Ovo je
// mnogo stroze od praga koji vazi za DOLAZAK/pratnju (>=2 u countSafeTricks)
// — korisnik je eksplicitno razdvojio ta dva praga ("to je rezon za dolaz,
// ne za odigravanje... ovdje imas samo 2, dakle obavezno dalje").
const MIN_TRICKS_TO_BID = 5;

function estimatedMaxLevel(hand: Card[]): number {
  const evalRes = evaluateHand(hand);
  let maxLevel = 0;
  const SUIT_GAME: Record<Suit, Game> = {
    '♠': 'Pik', '♦': 'Karo', '♥': 'Herc', '♣': 'Tref',
  };
  for (const s of evalRes.suits) {
    const safe = countDeclarerTricks(hand, s.suit);
    if (safe >= MIN_TRICKS_TO_BID) {
      maxLevel = Math.max(maxLevel, GAME_VALUES[SUIT_GAME[s.suit]]);
    }
  }
  if (countSansTricks(hand) >= MIN_TRICKS_TO_BID) {
    maxLevel = Math.max(maxLevel, GAME_VALUES['Sans']);
  }
  if (isBetlSafe(hand)) {
    maxLevel = Math.max(maxLevel, GAME_VALUES['Betl']);
  }
  return maxLevel;
}

// Da li ruka VEC dostize pun REQUIRED_TRICKS (6) bez ikakve pomoci talona —
// koristi se SAMO za IGRA odluku (vidi poziv u chooseBidAction), razlicito
// od estimatedMaxLevel-ovog MIN_TRICKS_TO_BID(5) koji racuna na +1 iz
// talona za OBICNU licitaciju.
function isIgraWorthy(hand: Card[]): boolean {
  for (const s of SUITS) {
    if (countDeclarerTricks(hand, s) >= 6) return true;
  }
  return countSansTricks(hand) >= 6;
}

// Betl (RULES 8 — cilj je NE uzeti nijedan stih, suprotno od svega ostalog
// ovde) — NIJE JOS kalibrisano uzivo sa korisnikom kao ostatak ove datoteke
// (korisnikov zahtev 2026-09-06: "nismo pomenuli bet uopste"). Namerno
// KONZERVATIVNO dok se ne uradi prava kalibracija: zahteva skoro savrsenu
// nisku ruku (najvise 1 karta J ili visa u CELOJ ruci) — radije propusti
// dobru Betl priliku nego da lose izracuna i preporuci siguran pad.
// Da li je JEDNA boja bezbedna za Betl — korisnikova kalibracija uzivo
// (2026-09-06, konkretni primeri): 7,8,9 / 7,8,10 / 7,9,10 / 7,9,J / suva 8 /
// 7,8,9,K,A / 7,9,10,D su SVI 0 stihova. Dva odvojena mehanizma:
//   (a) BEZ Asa te boje — neko drugi UVEK drzi nesto jace od moje najvise
//       karte (K,D,J i nize su sve "pokrivene" Asom/vecim kod protivnika),
//       ALI mi treba BAR JEDNA niska karta (7-10) da ne budem primoran da
//       odmah uzmem stih na prvi vodjeni nizak potez — K,D,J,10 bez ijedne
//       niske NIJE bezbedno (korisnikov zahtev: "naravno da ne moze da se
//       igra sa K,D,J,10, to je suludo").
//   (b) SA Asom te boje — Asa nema ko da "pokrije", pa niske karte (7-10)
//       moraju biti dovoljno brojne da apsorbuju SVAKI moguci vodjeni potez
//       protivnika u toj boji pre nego sto meni ponestane niskih (korisnikov
//       primer: 7,8,9,K,A — 3 niske >= 3 preostale kod protivnika [8-5],
//       pa K i As nikad ne moraju da izadju).
function isSuitBetlSafe(hand: Card[], suit: Suit): boolean {
  const cards = hand.filter(c => c.suit === suit);
  if (cards.length === 0) return true;
  const lowCount = cards.filter(c => RANK_VALUE[c.rank] <= RANK_VALUE['10']).length;
  if (cards.some(c => c.rank === 'A')) {
    const opponentsRemaining = 8 - cards.length;
    return lowCount >= opponentsRemaining;
  }
  // Svi korisnikovi potvrdjeni primeri (7,9,J / 7,9,10,D) imaju NAJVISE 1
  // visoku kartu po boji — "bar 1 niska, bez obzira koliko visokih" je
  // prejaka ekstrapolacija (npr. K,D,J + samo 1 niska NIJE bezbedno: 2 od 3
  // visokih karata ostaju bez pokrica). Zahtevaj niske >= visoke.
  const highCount = cards.length - lowCount;
  return lowCount >= highCount;
}

function isBetlSafe(hand: Card[]): boolean {
  return SUITS.every(s => isSuitBetlSafe(hand, s));
}

// Sans (bez aduta) — korisnikova kalibracija uzivo (2026-09-06): bez aduta
// nema "izvlacenja" protivnickih karata, pa se stihovi broje SAMO kao
// neprekinuti niz OD ASA NADOLE po boji (A sam=1, A+K=2, A+Q BEZ K=i dalje
// samo 1 — "nema vezanih karata", prekid lanca znaci da Kralj kod nekog
// drugog moze da uzme pre nego sto Dama dodje na red). Rizik da neko drugi
// drzi 5 najjacih u boji gde ja nemam nista je uglavnom samo-eliminisan:
// ako bi neko IMAO takvu boju, taj bi vec bio licitirao pre nego sto je red
// dosao do mene da proglasim Sans.
function countSansTricks(hand: Card[]): number {
  let total = 0;
  for (const s of SUITS) {
    total += sequentialRunFromAce(hand, s);
  }
  return total;
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

// Samo ADUTSKI deo sigurnih stihova (bez vanadutskih asova/kraljeva) —
// izdvojeno iz countSafeTricks jer ga posebno koristi Pik-specificno
// pravilo ispod (chooseFollow).
function trumpOnlySafeTricks(hand: Card[], trump: Suit | null): number {
  const trumps = hand.filter(c => trump !== null && c.suit === trump);
  const trumpA = trumps.some(c => c.rank === 'A');
  const trumpK = trumps.some(c => c.rank === 'K');
  const trumpD = trumps.some(c => c.rank === 'Q');
  const trumpLength = trumps.length;
  // As+Kralj u adutu nosi CELU duzinu — isti fizicki mehanizam (izvlacenje
  // aduta) vazi za koga god drzi te karte, nosioca ILI pratioca (korisnikov
  // zahtev, uzivo potvrdjeno 2026-09-06, za A,K,D,9,7 herca kao adut kod
  // pratioca: "imas 5 stihova, obavezna kontra" — ne flat 2 kao ranije).
  if (trumpA && trumpK) return trumpLength;
  // Go As (bez Kralja) — isti "manje aduta kod njih sa duzom bojom" mehanizam
  // vazi za koga god drzi karte (vidi countDeclarerTricks): kratka duzina
  // (<=3) daje samo 1, duzina 4+ daje duzinu-1.
  if (trumpA) return trumpLength <= 3 ? 1 : trumpLength - 1;
  let safe = 0;
  if (trumpK && trumpLength >= 2) safe += 1;
  if (trumpD && trumpLength >= 3 && !trumpK) safe += 1;
  return safe;
}

// Broji "sigurne stihove" u ruci za tu igru (adut + as van aduta)
function countSafeTricks(hand: Card[], trump: Suit | null): number {
  let safe = trumpOnlySafeTricks(hand, trump);

  // Van-adutski A/K su sigurni SAMO ako je ta boja KOD MENE kratka (do 3
  // karte). Kad je duga (4+) I ja drzim njen vrh (npr. A,K,Q,8 treفa),
  // nosiocu ostaju samo mali listovi te boje — pri odbacaju posle uzimanja
  // talona, ima veliki podsticaj da bas njih baci i ostane prazan, pa onda
  // moze da zatura MOJ as/kralj adutom kad se ta boja povede (korisnikov
  // zahtev, uzivo potvrdjeno 2026-09-06: "ako je rekao igru karo... velika
  // sansa je da bi odbacio upravo trefa jer... su kod mene najjaci... u tom
  // slucaju tu nemam stih"). Ovaj rizik postoji SAMO protiv nosioca (jedini
  // koji uopste bira sta odbacuje) — zato ova provera vazi ovde (pratilac),
  // a ne u countDeclarerTricks (nosilac nema od koga da "strahuje" od tudjeg
  // odbacaja).
  const offSuitLengths = new Map<Suit, number>();
  for (const c of hand) {
    if (c.suit === trump) continue;
    offSuitLengths.set(c.suit, (offSuitLengths.get(c.suit) ?? 0) + 1);
  }
  const offAces = hand.filter(
    c => c.rank === 'A' && c.suit !== trump && (offSuitLengths.get(c.suit) ?? 0) <= 3,
  ).length;
  // Svaki POJEDINACNI vanadutski kralj sa bar JEDNOM pratecom kartom u istoj
  // boji (duzina 2-3) je SAM PO SEBI siguran stih za pratioca — NE treba mu
  // drugi kralj negde drugde da bi vazio (korisnikov zahtev, uzivo
  // potvrdjeno 2026-09-06: "K i jos jedna je stih ako si pratilac", "kad ima
  // pratilac drugog K [tj. jos jednu kartu uz K], tu se racuna stih").
  // Potpuno go Kralj (duzina 1, bez ijedne prateце karte) i dalje NE racuna.
  const offKings = hand.filter((c) => {
    if (c.rank !== 'K' || c.suit === trump) return false;
    const len = offSuitLengths.get(c.suit) ?? 0;
    return len >= 2 && len <= 3;
  }).length;

  safe += offAces; // svaki as van aduta je siguran
  safe += offKings;

  return safe;
}

export function chooseFollow(ctx: FollowContext): FollowAction {
  const trump = getTrumpSuitFromGame(ctx.declaredGame);
  const isPik = ctx.declaredGame === 'Pik' || ctx.declaredGame === 'Igra-Pik';
  if (isPik) {
    // Pik nosi OBAVEZNU kontru (RULES 7.1.1 — bez ikakve kontre se
    // ponistava/redeal), pa je dolazak stroziji (korisnikov zahtev, uzivo
    // potvrdjeno 2026-09-06): treba ili 2 sigurna ADUTSKA stiha, ili 2 (bilo
    // koja, i adutska i vanadutska) asa — ne bilo koja mesovita kombinacija
    // koja inace zadovoljava opsti prag od 2.
    const trumpTricks = trumpOnlySafeTricks(ctx.hand, trump);
    const totalAces = ctx.hand.filter(c => c.rank === 'A').length;
    return (trumpTricks >= 2 || totalAces >= 2) ? 'DODJEM' : 'NE_DODJEM';
  }
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