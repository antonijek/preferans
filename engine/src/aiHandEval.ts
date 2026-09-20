// AI heuristike za Preferans — procena snage ruke (deljeno izmedju
// biddinga, follow/kontra, i discard/play odluka). Ciste funkcije, bez
// stanja.

import { RANK_VALUE, SUITS, GAME_VALUES } from './constants.js';
import type { Card, Game, Suit } from './types.js';

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

// Potrebno stihova U RUCI (pre talona) da bi se licitiralo — korisnikova
// kalibracija uzivo (2026-09-06): nosiocu treba 6 stihova ukupno, a JEDAN
// se racuna kao "besplatan" iz talona (2 uzete karte, 2 se odbacuju — u
// proseku donosi priblizno 1 dodatni stih), pa u SVOJIH 10 karata treba
// ~5 realnih stihova pre nego sto se uopste razmatra licitacija. Ovo je
// mnogo stroze od praga koji vazi za DOLAZAK/pratnju (>=2 u countSafeTricks)
// — korisnik je eksplicitno razdvojio ta dva praga ("to je rezon za dolaz,
// ne za odigravanje... ovdje imas samo 2, dakle obavezno dalje").
const MIN_TRICKS_TO_BID = 5;

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
export function isIgraWorthy(hand: Card[]): boolean {
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

export function isBetlSafe(hand: Card[]): boolean {
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
export function countSansTricks(hand: Card[]): number {
  let total = 0;
  for (const s of SUITS) {
    total += sequentialRunFromAce(hand, s);
  }
  return total;
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
  let safe = 0;
  if (trumpK && trumpLength >= 2) safe += 1;
  if (trumpD && trumpLength >= 3 && !trumpK) safe += 1;
  return safe;
}

// Broji "sigurne stihove" u ruci za tu igru (adut + as van aduta)
export function countSafeTricks(hand: Card[], trump: Suit | null): number {
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
