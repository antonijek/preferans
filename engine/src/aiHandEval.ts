// AI heuristike za Preferans — procena snage ruke (deljeno izmedju
// biddinga, follow/kontra, i discard/play odluka). Ciste funkcije, bez
// stanja.

import { RANK_VALUE, SUITS, GAME_VALUES } from './constants.js';
import type { Card, Game, Rank, Suit } from './types.js';

// Bodovi karata (high card points) — za procenu snage ruke
export const CARD_POINTS: Record<string, number> = {
  'A': 10, 'K': 4, 'Q': 3, 'J': 2, '10': 1,
  '9': 0, '8': 0, '7': 0,
};

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
export function sequentialRunFromAce(hand: Card[], suit: Suit): number {
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

export function countDeclarerTricks(hand: Card[], trump: Suit | null): number {
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

// Siguran prolaz kad nosilac prvi baca kartu (korisnik 2026-10-24, #12 ruka
// 5: Milan sa A,K,D,J karo, A,10,9,8,7 pik i A herc proglasio Igra-Pik —
// "mogao je da igra karo, posto prvi baca kartu, potpuno je siguran prolaz.
// Jako je vazno ko prvi baca kartu u ruci"): aduti od asa nadole pokrivaju
// sve tudje adute i kad su svi kod jednog pratioca, pa nosi svaki moj adut i
// niz od asa u svakoj sporednoj boji. Kad prvi igra pratilac, nosilac moze
// morati da sece pre nego sto izvuce adute — tad nista nije sigurno.
export function certainTricks(hand: Card[], trump: Suit, declarerLeads: boolean): number {
  const trumps = hand.filter((c) => c.suit === trump).length;
  if (!declarerLeads || sequentialRunFromAce(hand, trump) < 8 - trumps) return 0;
  return trumps + SUITS.filter((s) => s !== trump).reduce((n, s) => n + sequentialRunFromAce(hand, s), 0);
}

// Potrebno stihova U RUCI (pre talona) da bi se licitiralo — korisnikova
// kalibracija uzivo (2026-09-06): nosiocu treba 6 stihova ukupno, a JEDAN
// se racuna kao "besplatan" iz talona (2 uzete karte, 2 se odbacuju — u
// proseku donosi priblizno 1 dodatni stih), pa u SVOJIH 10 karata treba
// ~5 realnih stihova pre nego sto se uopste razmatra licitacija. Ovo je
// mnogo stroze od praga koji vazi za DOLAZAK/pratnju (>=3 u chooseFollow)
// — korisnik je eksplicitno razdvojio ta dva praga ("to je rezon za dolaz,
// ne za odigravanje... ovdje imas samo 2, dakle obavezno dalje").
const MIN_TRICKS_TO_BID = 5;

// Korisnik 2026-10-20: "Sans ne moze da se igra ni bez jedne boje".
export function hasVoidSuit(hand: Card[]): boolean {
  return SUITS.some((s) => !hand.some((c) => c.suit === s));
}

export function estimatedMaxLevel(hand: Card[]): number {
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
  if (!hasVoidSuit(hand) && countSansTricks(hand) >= MIN_TRICKS_TO_BID) {
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
//
// Korisnik 2026-10-24 (#13 ruka 16, ♥K,D,J,9,7 ♦A,9,8,7 i jos dve karte):
// Igra "uvek", i bez prazne boje — 5+ aduta sa K,D,J (ili A,D,J) gube
// najvise jedan stih, pa je 5 procenjenih stihova dovoljno i bez talona.
function hasSolidLongTrumps(hand: Card[], suit: Suit): boolean {
  const ranks = new Set(hand.filter((c) => c.suit === suit).map((c) => c.rank));
  return ranks.size >= 5 && ranks.has('Q') && ranks.has('J') && (ranks.has('K') || ranks.has('A'));
}

export function isIgraWorthy(hand: Card[]): boolean {
  for (const s of SUITS) {
    const tricks = countDeclarerTricks(hand, s);
    if (tricks >= 6 || (tricks >= 5 && hasSolidLongTrumps(hand, s))) return true;
  }
  return !hasVoidSuit(hand) && countSansTricks(hand) >= 6;
}

// Igra bez ikakvog rizika: neka boja daje siguran prolaz (certainTricks).
export function isIgraCertain(hand: Card[]): boolean {
  return SUITS.some((s) => certainTricks(hand, s, true) >= 6);
}

// Betl (RULES 8 — cilj je NE uzeti nijedan stih). Da li je JEDNA boja
// bezbedna — korisnikovo pravilo (2026-10-24, posle partije #13 ruka 32, gde
// je Bora licitirao Betl sa D,10,9,8 herc jer je staro pravilo "ima 7 ili 8 i
// vise niskih nego visokih" to propustalo): "sigurno je samo 7,8,9 kao i
// 7,9,J ili 7,8,J, a pored ovoga moze da ima i jos karata ... Sve ostalo je
// rizik. Neki rizik se podnosi kao sto je suva 8. Ali nikako 8 i 9 u jednoj
// boji ili vise od toga." Isti dan potvrdio i kratke boje (suva 7, 7-8, 7-9)
// i da 7,10,J NIJE sigurno (na vodjenu 8 bacim 7, na 9 moram 10 ili J).
// 7,8,10 i 7,9,10 su nize od 7,8,J i 7,9,J (potvrdjene i 2026-09-06).
const BETL_SAFE_SHORT: Rank[][] = [['7'], ['8'], ['7', '8'], ['7', '9']];
const BETL_SAFE_BASES: Rank[][] = [
  ['7', '8', '9'], ['7', '8', '10'], ['7', '8', 'J'], ['7', '9', '10'], ['7', '9', 'J'],
];

function isSuitBetlSafe(hand: Card[], suit: Suit): boolean {
  const ranks = hand.filter((c) => c.suit === suit).map((c) => c.rank);
  if (ranks.length === 0) return true;
  const contains = (combo: Rank[]): boolean => combo.every((r) => ranks.includes(r));
  if (ranks.length <= 2) {
    return BETL_SAFE_SHORT.some((combo) => combo.length === ranks.length && contains(combo));
  }
  return BETL_SAFE_BASES.some(contains);
}

export function isBetlSafe(hand: Card[]): boolean {
  return SUITS.every(s => isSuitBetlSafe(hand, s));
}

// Sans (bez aduta) — korisnikova kalibracija uzivo (2026-09-06): bez aduta
// nema "izvlacenja" protivnickih karata, pa se stihovi broje SAMO kao
// neprekinuti niz OD ASA NADOLE po boji (A sam=1, A+K=2, A+Q BEZ K=i dalje
// samo 1 — "nema vezanih karata", prekid lanca znaci da Kralj kod nekog
// drugog moze da uzme pre nego sto Dama dodje na red).
//
// ISPRAVKA (2026-10-03, uzivo prijavljeno + potvrdjeno konkretnom rukom):
// ranije je ovde stajalo da je rizik "neko drugi drzi 5 najjacih u boji gde
// ja nemam nista" uglavnom samo-eliminisan, jer bi taj neko vec licitirao
// pre nego sto dodje red na mene. Korisnikov protivprimer (Zapad: A♣ K♠ Q♣
// J♣ 10♣ Q♥ A♠ A♦ K♦ Q♦ — samo JEDNA herc karta, bez asa te boje) to
// obara: countSansTricks je vracao tacno 6 (prag za prolaz), proglasio je
// Sans, i pao — baš u toj usamljenoj boji, jer protivnik koji drzi asa
// herca NIJE morao da ima dovoljno JAKU celu ruku da bi licitirao, dovoljno
// je bilo da drzi samo tu jednu boju. Sada: svaka boja gde NEMAM asa i
// imam najvise JEDNU kartu (prazna ili "suva" usamljena) nosi stvarni
// rizik — protivnik sa asom te boje moze da je povede kad god hoce, uzme
// moju jedinu kartu (ili odmah, ako sam prazan), i ja ostajem bez ikakvog
// otpora u njoj do kraja ruke. Svaka takva boja skida 1 stih od ukupne
// procene (ne ispod 0).
export function countSansTricks(hand: Card[]): number {
  let total = 0;
  for (const s of SUITS) {
    total += sequentialRunFromAce(hand, s);
  }
  let risk = 0;
  for (const s of SUITS) {
    const cards = hand.filter(c => c.suit === s);
    const hasAce = cards.some(c => c.rank === 'A');
    if (!hasAce && cards.length <= 1) risk += 1;
  }
  return Math.max(0, total - risk);
}

// Samo ADUTSKI deo sigurnih stihova (bez vanadutskih asova/kraljeva) —
// izdvojeno iz countSafeTricks jer ga posebno koristi Pik-specificno
// pravilo u chooseFollow.
export function trumpOnlySafeTricks(hand: Card[], trump: Suit | null): number {
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
  // Bez asa: niz od kralja (K, K,D, K,D,J) nosi onoliko stihova koliko ima
  // karata u nizu, ako ima i malu da je baci na asa — K,D,10 = 2 (korisnik
  // 2026-10-21: "moram doci, imam 2 sigurna adutska stiha"), K,D = 1, K,x = 1.
  if (trumpK) {
    const run = ['K', 'Q', 'J', '10'].findIndex((r) => !trumps.some((c) => c.rank === r));
    return Math.min(run === -1 ? 4 : run, trumpLength - 1);
  }
  return trumpD && trumpLength >= 3 ? 1 : 0;
}

// Rezoni pratioca u adutskoj igri (koliko stihova verovatno nosi), prag
// za dolazak je 3 (chooseFollow). Korisnik 2026-10-21: "K i mala se racuna
// ... ali treba 3 rezona da bi dosao — jer vecinom jedan rezon sece
// nosilac", pa na konkretne ruke (iste ruke su u testu ai-match10):
//  - kratka boja (do 3 karte) daje 1 rezon: as, ili kralj sa jos bar jednom
//    kartom — i A,K je samo 1 (A,K,7 pik i A,9,8 tref: "ovdje su samo 2
//    rezona, pik i tref"), drugi krug nosilac obicno sece; 2 tek A,K,D ili
//    K,D,J; D,J,10 bez asa i kralja = 1 ("dodjem");
//  - duga boja (4+): as bez kralja = 1 (A,9,8,7: "dodjem"), K,D bez asa = 1;
//    A,K,x,x je bio 0 ("najverovatnije on pika nema ili ga je skartao"), ali
//    2026-10-24 (#12 ruka 9, ♣K,10,7 ♠A,K,8,7 ♦K,9: "ima 3 rezona") = 1, a
//    A,K,D,x = 2 (#13 ruka 24, A,K,D,7 karo: "po 2 stiha");
//  - D,10,9 (tacno te tri karte) = 1 (#13 ruka 17: ♠D,10,9 je treci rezon
//    uz adutskog i karo asa — "Milan je morao da dodje"); D,J,9 nije — u
//    partiji #10 je sa ♠D,J,9 i dva K,7 rekao "ne dodjem";
//  - 3+ aduta i prazna boja ili singl = pola rezona: J,9,7 adut i bez herca
//    je "na granici", "da je Dama umesto J ... dosao bih sigurno".
export function countSafeTricks(hand: Card[], trump: Suit | null): number {
  let rezoni = trumpOnlySafeTricks(hand, trump);
  const trumps = hand.filter((c) => c.suit === trump).length;
  let short = false;
  for (const suit of ['♠', '♥', '♦', '♣'] as Suit[]) {
    if (suit === trump) continue;
    const cards = hand.filter((c) => c.suit === suit);
    const has = (r: string) => cards.some((c) => c.rank === r);
    if (cards.length <= 1) short = true;
    if (cards.length >= 4) {
      if (has('A') && has('K')) rezoni += has('Q') ? 2 : 1;
      else if (has('A') || (has('K') && has('Q'))) rezoni += 1;
    } else if (has('A') || (has('K') && cards.length >= 2)) {
      const threeHonours = has('K') && has('Q') && (has('A') || has('J'));
      rezoni += threeHonours ? 2 : 1;
    }
    if (!has('A') && !has('K') && has('Q')) {
      const queenTenNine = cards.length === 3 && has('10') && has('9');
      if ((has('J') && has('10')) || queenTenNine) rezoni += 1;
    }
  }
  if (trumps >= 3 && short) rezoni += 0.5;
  return rezoni;
}

// Helper: izvlaci adut boju iz igre
export function getTrumpSuitFromGame(game: Game): Suit | null {
  const map: Partial<Record<Game, Suit>> = {
    'Pik': '♠', 'Igra-Pik': '♠',
    'Herc': '♥', 'Igra-Herc': '♥',
    'Karo': '♦', 'Igra-Karo': '♦',
    'Tref': '♣', 'Igra-Tref': '♣',
  };
  return map[game] ?? null;
}
