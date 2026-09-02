// PREFERANS Game klasa — orchestruje sve module

import {
  INITIAL_BULAS,
  TRICKS_PER_HAND,
  REQUIRED_TRICKS,
} from './constants.js';
import { deal } from './deal.js';
import { getTrumpSuit, isNoTrump, isBetl, isIgra, getGameValue } from './scoring.js';
import { trickWinner, isCardLegal, getLegalCards } from './trick.js';
import {
  calculateBulaChange,
  calculateBulaDistribution,
  calculateSupaForFollower,
  calculateBetlSupa,
  calculateWriteOff,
  type Multiplier,
} from './scoring.js';
import { CONTRA_MULTIPLIERS, REFE_MULTIPLIER, STANDARD_GAMES, IGRA_GAMES, GAME_VALUES } from './constants.js';
import { cardToString } from './cards.js';
import {
  createEmptyPlayer,
  type Action,
  type Card,
  type Game as GameT,
  type GameState,
  type Position,
  type BidRecord,
  type TrickCard,
  type FollowChoice,
  type ContraLevel,
  type LegalAction,
  type EndOfHandResult,
} from './types.js';

export interface GameConfig {
  playerNames?: [string, string, string];
  seed?: number;
  refePerPlayer?: number;
  initialBule?: number;
}

export type { EndOfHandResult };

const POS_LABELS = ['Jug', 'Istok', 'Zapad'] as const;

function nextPlayer(p: Position): Position {
  return ((p + 1) % 3) as Position;
}

export class Game {
  state: GameState;
  private rng: () => number;
  private refePerPlayer: number;
  private initialBule: number;

  constructor(config: GameConfig = {}) {
    const names = config.playerNames ?? ['Jug', 'Istok', 'Zapad'];
    this.rng = makeRng(config.seed ?? Date.now());
    this.refePerPlayer = config.refePerPlayer ?? 2;
    this.initialBule = config.initialBule ?? INITIAL_BULAS;

    this.state = {
      phase: 'WAITING',
      round: 1,
      dealer: 0 as Position,
      players: [
        { ...createEmptyPlayer('0', names[0]!, 0 as Position) },
        { ...createEmptyPlayer('1', names[1]!, 1 as Position) },
        { ...createEmptyPlayer('2', names[2]!, 2 as Position) },
      ] as GameState['players'],
      currentPlayer: 0 as Position,
      currentBidder: 0 as Position,
      currentBid: 0,
      bids: [],
      winner: null,
      winnerGame: null,
      bidStartPlayer: 0 as Position,
      declaredGame: null,
      trump: null,
      talon: [],
      lastTalon: [],
      discard: [],
      currentTrick: [],
      tricks: [],
      trickCount: 0,
      followChoices: [null, null, null],
      caller: null,
      callee: null,
      kontraPlayer: null,
      kontraLevel: null,
      mozeCount: 0,
      refeOccurred: false,
      scores: [0, 0, 0],
      bulas: [this.initialBule, this.initialBule, this.initialBule],
      refeCount: [0, 0, 0],
      refePending: [0, 0, 0],
      igraPlayer: null,
      igraCompetitors: null,
      igraDeclarations: {},
      lastHandResult: null,
    };
  }

  // FAZA: DEALING
  newHand(dealer: Position = this.state.dealer): void {
    const result = deal(this.rng);
    const firstBidder = nextPlayer(dealer);
    this.state.dealer = dealer;
    this.state.bidStartPlayer = firstBidder;
    this.state.currentBidder = firstBidder;
    this.state.currentPlayer = firstBidder;
    this.state.currentBid = 0;
    this.state.bids = [];
    this.state.winner = null;
    this.state.winnerGame = null;
    this.state.declaredGame = null;
    this.state.trump = null;
    this.state.talon = result.talon;
    this.state.lastTalon = [];
    this.state.discard = [];
    this.state.currentTrick = [];
    this.state.tricks = [];
    this.state.trickCount = 0;
    this.state.followChoices = [null, null, null];
    this.state.caller = null;
    this.state.callee = null;
    this.state.kontraPlayer = null;
    this.state.kontraLevel = null;
    this.state.mozeCount = 0;
    // refeOccurred ostaje true ako je bilo REFE — to je istorijski flag.
    // refePending/refeCount TAKOĐE ostaju netaknuti — to je budžet po
    // igraču koji traje preko VIŠE ruka (dodeljen refePending se ne gubi
    // dok ga taj igrač lično ne potroši kao nosilac neke buduće ruke).
    this.state.igraPlayer = null;
    this.state.igraCompetitors = null;
    this.state.igraDeclarations = {};
    for (let i = 0; i < 3; i++) {
      const p = this.state.players[i]!;
      p.hand = result.hands[i]!.slice();
      p.tricksWon = 0;
      p.stihi = [];
      p.hasPassedBid = false;
      p.bidLevel = 0;
      p.kontraLevel = null;
      p.follows = null;
      p.igraEligible = true;
    }
    this.state.phase = 'BIDDING';
  }

  // LICITACIJA
  bid(player: Position, value: number): boolean {
    if (this.state.phase !== 'BIDDING') return false;
    if (player !== this.state.currentBidder) return false;
    // Kad je neko rekao "Igra", numericka licitacija se zamrzava — ostali
    // mogu samo "dalje" ili konkurisati svojom Igra (RULES 3.4/3.4.1).
    if (this.state.igraPlayer !== null) return false;
    const p = this.state.players[player]!;
    if (p.hasPassedBid) return false;
    if (value < 2 || value > 7) return false;
    // RULES 3.4: ako mu je OVO prvi potez u licitaciji (jos nije ni licitirao
    // ni rekao dalje), a bira broj (ne Igra) — trajno gubi pravo na "Igra"
    // do kraja runde. Vidi igraEligible u types.ts. MOGU grana ispod nikad
    // nije "prvi potez" (zahteva p.bidLevel>0 vec), pa se ovo odnosi samo na
    // stvarno podizanje licitacije.
    const isFirstBidTurn = p.bidLevel === 0 && !p.hasPassedBid;
    // "Mogu X" — potvrda da igrac prihvata trenutnu vrednost (RULES 3.3).
    // Igrac koji NIJE UOPSTE licitirao (ne BID, ne MOGU) u ovoj rundi NEMA
    // pravo da kaze "mogu" — mora ili podici licitaciju ili reci "dalje"
    // (potvrdjeno direktno od korisnika). Dodatno: igrac koji VEC drzi
    // trenutnu vrednost (on ju je poslednji postavio, bid ili mogu) NIKAD ne
    // moze reci "mogu" za nju ponovo — mora ili podici ili reci "dalje"
    // (potvrdjeno sa dva nezavisna izvora srpskih pravila Preferansa —
    // preferansklub.com i prefdamaherc.com, i uzivo prijavljenim bagom:
    // "Mogu 3" je bilo ponudjeno igracu koji vec drzi 3).
    // SAMO JEDAN igrac sme reci "Mogu X" za DATU trenutnu vrednost X — ako
    // je NEKO VEC potvrdio ovu vrednost preko Mogu, ostali koji su iza
    // moraju podici ili otici dalje, ne mogu i oni "parkirati" na istoj
    // vrednosti (potvrdjeno direktno, vise puta i vrlo eksplicitno od
    // korisnika — "ne mogu 2 igraca da kazu mogu X, to je totalno
    // neispravno"). Ovo se prirodno resetuje na svaku novu vrednost jer
    // proverava samo MOGU zapise koji se poklapaju sa TRENUTNIM currentBid.
    const alreadyConfirmedByMogu = this.state.bids.some(
      b => b.type === 'MOGU' && b.value === this.state.currentBid,
    );
    if (
      value === this.state.currentBid &&
      this.state.currentBid > 0 &&
      p.bidLevel > 0 &&
      p.bidLevel < this.state.currentBid &&
      !alreadyConfirmedByMogu
    ) {
      p.bidLevel = value;
      this.state.bids.push({ player, type: 'MOGU', value });
      this.advanceBidder();
      return true;
    }
    if (value <= this.state.currentBid) return false;
    // Igrac koji je Mogu-eligible (vec licitirao I trenutno nadmasen) SME da
    // podigne licitaciju SAMO ako je Mogu opcija za trenutnu vrednost VEC
    // zauzeta od strane DRUGOG igraca (alreadyConfirmedByMogu) — dok je Mogu
    // jos slobodan, mora prvo njega (ili "dalje"), ne sme ga preskociti.
    // Kad Mogu vise nije dostupan, NE SME ostati zaglavljen samo na "dalje"
    // (uzivo prijavljen bag: igrac primoran da pasira sa jakom rukom za
    // podizanje samo zato sto je NEKO DRUGI vec "pokupio" Mogu slot —
    // potvrdjeno direktno od korisnika, ekran je nudio SAMO "Dalje" bez
    // opcije podizanja na sledecu vrednost).
    if (p.bidLevel > 0 && p.bidLevel < this.state.currentBid && !alreadyConfirmedByMogu) return false;
    // RULES 3.2: licitacija ide striktno redom, +1 u odnosu na trenutnu
    // vrednost (pocevsi od 2) — skok (npr. 0 -> 5) NIJE dozvoljen.
    const requiredNext = Math.max(2, this.state.currentBid + 1);
    if (value !== requiredNext) return false;
    this.state.currentBid = value;
    p.bidLevel = value;
    if (isFirstBidTurn) p.igraEligible = false;
    this.state.bids.push({ player, type: 'BID', value });
    this.advanceBidder();
    return true;
  }

  pass(player: Position): boolean {
    if (this.state.phase !== 'BIDDING') return false;
    if (player !== this.state.currentBidder) return false;
    const p = this.state.players[player]!;
    if (p.hasPassedBid) {
      // Već je prošao — samo pomeri bidding
      this.advanceBidder();
      return true;
    }
    // RULES 3.4: prvi potez ovog igraca u rundi je "dalje" (ne Igra) —
    // trajno gubi pravo na "Igra" do kraja runde.
    if (p.bidLevel === 0) p.igraEligible = false;
    p.hasPassedBid = true;
    this.state.bids.push({ player, type: 'PASS' });
    this.advanceBidder();
    return true;
  }

  // IGRA — igrač odmah kaže SAMO "Igra" (bez imena igre, bez talona).
  // Konkretnu igru winner imenuje TEK po zavrsetku licitacije, preko
  // declareIgra() (RULES 3.4). Ako vise igraca kaze Igra — prvi koji je
  // rekao ostaje "lider" (RULES 3.4.1 first-mover tiebreak); puna poredba
  // jacine kad se igre razlikuju nije implementirana (redak slucaj — vidi
  // TODO.md).
  sayIgra(player: Position): boolean {
    if (this.state.phase !== 'BIDDING') return false;
    if (player !== this.state.currentBidder) return false;
    // RULES 3.4 (korisnikov zahtev — uzivo prijavljen bag): "Igra" sme SAMO
    // na igracev prvi potez u rundi. Cim je na svom prvom potezu vec rekao
    // broj ili "dalje", vise ne moze konkurisati sa Igra kasnije.
    if (!this.state.players[player]!.igraEligible) return false;
    if (this.state.igraPlayer === null) {
      this.state.igraPlayer = player;
    }
    this.state.bids.push({ player, type: 'IGRA' });
    this.advanceBidder();
    return true;
  }

  declareIgra(player: Position, game: GameT): boolean {
    if (this.state.phase !== 'DECLARING') return false;
    if (!isIgra(game)) return false;
    if (getGameValue(game) < this.state.currentBid) return false;

    if (this.state.igraCompetitors !== null) {
      // RULES 3.4.1 tiebreak — VISE igraca reklo Igra, svaki mora proglasiti
      // SVOJU igru pre nego sto se odredi pobednik.
      if (player !== this.state.currentBidder) return false;
      if (!this.state.igraCompetitors.includes(player)) return false;
      if (this.state.igraDeclarations[player] !== undefined) return false;
      this.state.igraDeclarations[player] = game;

      const remaining = this.state.igraCompetitors.filter(
        p => this.state.igraDeclarations[p] === undefined,
      );
      if (remaining.length > 0) {
        this.state.currentBidder = remaining[0]!;
        return true;
      }
      // Svi su proglasili — odredi pobednika: najjaca igra pobedjuje, kod
      // izjednacenja pobedjuje PRVI koji je rekao Igra (redosled u
      // igraCompetitors je vec redosled prijave).
      let winner = this.state.igraCompetitors[0]!;
      let bestValue = getGameValue(this.state.igraDeclarations[winner]!);
      for (const p of this.state.igraCompetitors.slice(1)) {
        const v = getGameValue(this.state.igraDeclarations[p]!);
        if (v > bestValue) {
          winner = p;
          bestValue = v;
        }
      }
      const winningGame = this.state.igraDeclarations[winner]!;
      this.state.winner = winner;
      this.state.igraPlayer = winner;
      this.state.winnerGame = winningGame;
      this.state.declaredGame = winningGame;
      this.state.trump = getTrumpSuit(winningGame);
      this.state.igraCompetitors = null;
      this.state.igraDeclarations = {};
      if (isBetl(winningGame)) {
        this.autoFollowBetl();
      } else {
        this.startFollowDeclaring();
      }
      return true;
    }

    // Standardan slucaj — samo JEDAN igrac je rekao Igra.
    if (this.state.winner === null) return false;
    if (this.state.igraPlayer !== this.state.winner) return false;
    if (player !== this.state.winner) return false;
    this.state.winnerGame = game;
    this.state.declaredGame = game;
    this.state.trump = getTrumpSuit(game);
    // RULES 5.1 — "u betlu I igra-betlu: svi automatski prate". declareIgra
    // je ranije UVEK isla na normalno (rucno) pracenje, cak i za Igra-Betl —
    // otkriveno kroz direktnu proveru REFERENTNI_PRIMERI.md runde #4/#14
    // (auto-follow se nikad nije desio, umesto toga se trazilo Dodjem/Ne
    // dodjem kao za obicnu igru). Uskladjeno sa declareGame(), koji ovo vec
    // radi ispravno za obican (ne-Igra) Betl.
    if (isBetl(game)) {
      this.autoFollowBetl();
    } else {
      this.startFollowDeclaring();
    }
    return true;
  }

  private advanceBidder(): void {
    let next = nextPlayer(this.state.currentBidder);
    let safety = 0;
    while (this.state.players[next]!.hasPassedBid && safety < 5) {
      next = nextPlayer(next);
      safety++;
    }
    this.state.currentBidder = next;
    this.checkBiddingEnd();
  }

private checkBiddingEnd(): void {
    // Ako je već winner (igra tok), pređi dalje
    if (this.state.winner !== null && this.state.winnerGame !== null) {
      this.afterBiddingWon();
      return;
    }

    // Po RULES 3.2: Licitacija se zavrsava kad ostanu SAMO JEDAN ili NIJEDAN igrac
    // (tj. kad 2 ili vise igraca kazu "dalje")
    const notPassed = ([0, 1, 2] as Position[]).filter(
      p => !this.state.players[p]!.hasPassedBid,
    );

    // Ako su svi prosli — refe
    if (notPassed.length === 0) {
      this.handleRefe();
      return;
    }

    // IGRA tok: bidding se zavrsava kad SVI odgovore (pass ili Igra)
    if (this.state.igraPlayer !== null) {
      const followers = ([0, 1, 2] as Position[]).filter(p => p !== this.state.igraPlayer);
      const allResponded = followers.every(p =>
        this.state.players[p]!.hasPassedBid ||
        (this.state.bids.some(b => b.player === p && b.type === 'IGRA')),
      );
      if (allResponded) {
        // RULES 3.4.1 — ako je VISE igraca reklo Igra, SVAKI mora proglasiti
        // SVOJU igru pre nego sto se odredi pobednik (najjaca igra pobedjuje,
        // izjednacenje -> prvi koji je rekao Igra). Uzivo prijavljen bag:
        // ranije se OVDE odmah proglasavao pobednik = PRVI koji je rekao
        // Igra, bez ikakvog trazenja/poredjenja od ostalih koji su TAKODJE
        // rekli Igra — "svi kazu igra... nema govorenja cija je koja, nego
        // prvi odigrava". Redosled prijave = redosled IGRA zapisa u bids.
        const competitors: Position[] = [];
        for (const b of this.state.bids) {
          if (b.type === 'IGRA' && !competitors.includes(b.player)) {
            competitors.push(b.player);
          }
        }
        this.state.phase = 'DECLARING';
        if (competitors.length > 1) {
          this.state.igraCompetitors = competitors;
          this.state.igraDeclarations = {};
          this.state.currentBidder = competitors[0]!;
          // winner OSTAJE null dok svi ne proglase i pobednik se ne odredi
        } else {
          this.state.winner = this.state.igraPlayer;
          this.state.currentBidder = this.state.winner;
        }
      }
      return;
    }

    // Po RULES 3.2: bidding se zavrsava ISKLJUCIVO kad ostane samo jedan
    // (ili nijedan) aktivan igrac, tj. kroz "dalje" (pass). "Mogu" NIKAD
    // sam po sebi ne zavrsava licitaciju — vidi RULES 3.3 primer ("P1: mogu
    // 3" nastavlja na "P2: 4" ili "P2: dalje", ne zavrsava rundu). Ranije je
    // ovde postojala dodatna grana koja je zavrsavala licitaciju cim bi oba
    // aktivna igraca "pokrila" istu vrednost (BID+MOGU) — to je bio bag:
    // proglasavalo je pobednika odmah posle "mogu X" umesto da vrati red
    // pravom bidder-u da bira izmedju dizanja i "dalje" (potvrdjeno od
    // korisnika uzivo — "Mogu 4" je odmah zavrsavalo licitaciju sa POGRESNIM
    // pobednikom). Uklonjeno.
    //
    // Ako je ostao samo jedan aktivan bidder ALI on jos nista nije licitirao
    // (currentBid === 0), on i dalje mora da odigra svoj potez (bid ili pass)
    // pre nego sto bidding zavrsi - inace bi pravilo "svi kazu dalje -> REFE"
    // bilo nemoguce postici kad poslednji igrac takodje pasira.
    if (notPassed.length === 1 && this.state.currentBid > 0) {
      this.state.winner = notPassed[0]!;
      this.afterBiddingWon();
      return;
    }

    // Inace, bidding se nastavlja — nista ne radimo
  }

  private afterBiddingWon(): void {
    // Napomena: IGRA tok ne prolazi kroz ovu funkciju (ide u DECLARING preko
    // checkBiddingEnd-a i tek onda declareIgra()) — ovo je uvek regularna
    // pobeda, uzmi talon.
    const winner = this.state.winner!;
    this.takeTalon(winner);
    this.state.phase = 'DISCARDING';
  }

  private takeTalon(player: Position): void {
    // Sacuvaj koje su karte bile u talonu — RULES: mora biti vidljivo dok
    // nosilac ne proglasi igru (uzivo prijavljen zahtev korisnika).
    this.state.lastTalon = [...this.state.talon];
    this.state.players[player]!.hand.push(...this.state.talon);
    this.state.talon = [];
  }

  // RULES 7.1/7.3 (model potvrđen uživo od korisnika): kad refe "okine" —
  // bilo "svi kažu dalje" bilo "Pik bez kontre" — SVA TRI igrača dobijaju po
  // JEDNU refu "na raspolaganju" (refePending), ne samo budući nosilac.
  // Svaki od njih je troši SAM, prvi put kad ON LIČNO postane nosilac neke
  // ruke (ne mora biti odmah sledeća) — vidi refePending u endHand() /
  // handleNoOneFollows(). Ne dodeljuje se igraču koji je već na budžetskom
  // maksimumu (iskorišćeno+na raspolaganju === refePerPlayer).
  // NAPOMENA: ranije je ovo davalo refu SVA TRI igrača ODMAH kao "iskorišćeno"
  // (refeCount++), što je bio drugačiji, uživo prijavljen bag (tabela je
  // pokazivala 1/2 za sve iako je samo jedan od njih stvarno odigrao rundu
  // pod refeom) — sada se razdvaja "dodeljeno" (refePending) od "potrošeno"
  // (refeCount), pa se ANI problem ne ponavlja: dodela svima ne menja
  // "iskorišćeno" dok stvarno NE POTROŠE svoju refu kao nosilac.
  private awardRefeToAll(): void {
    const pending: [number, number, number] = [...this.state.refePending] as [number, number, number];
    for (let i = 0; i < 3; i++) {
      if (this.state.refeCount[i]! + pending[i]! < this.refePerPlayer) {
        pending[i]! += 1;
      }
    }
    this.state.refePending = pending;
  }

  private handleRefe(): void {
    this.state.refeOccurred = true;
    // Ako neko u šeširu — refe se ne važi, samo game over
    const anyInHat = this.state.bulas.some(b => b < 0);
    if (anyInHat) {
      this.state.phase = 'GAME_OVER';
      return;
    }
    this.awardRefeToAll();
    // Ruka se poništava — iste bule, novi dealer
    this.newHand(this.state.dealer);
  }

  // Zajednicka logika za rundu koja se NE ODIGRAVA do kraja jer nosilac nema
  // stvarnog protivnika (RULES 7.1.1 "Pik bez kontre" I RULES 5.4 "niko ne
  // prati" — potvrđeno uživo od korisnika da obe situacije prate ISTU
  // tri-granu strukturu, ne samo Pik-bez-kontre):
  //   1. Neko je vec u seširu (negativne bule) → IZUZETAK: regularan prolaz
  //      nosioca upisan bez igranja, bez mnozenja refeom.
  //   2. Niko u seširu, nosilac ima slobodan refe-budzet → refe se PISE
  //      (dodela SVA TRI igraca, vidi awardRefeToAll()), ruka se ponistava
  //      (BEZ promene bula — ne "prolaz -4").
  //   3. Niko u seširu, nosilac NEMA slobodan budzet → ruka se prosto
  //      PONAVLJA (redeal), bez promene bula, bez dodele refe.
  // Uzivo prijavljen bag: handleNoOneFollows() je ranije UVEK upisivala
  // fiksni "prolaz" (-igra*2, eventualno x2 ako je vec bila naoruzana refeom)
  // bez ikakve hat/refe grane — korisnik je potvrdio da to vazi SAMO kad je
  // neko u seširu; inace treba refe (ili ponavljanje ruke), ne automatski pad.
  private handleUnplayedHand(declarer: Position, declared: GameT): void {
    const anyInHat = this.state.bulas.some(b => b < 0);
    if (anyInHat) {
      const delta = -(getGameValue(declared) * 2);
      const bulasRaw: [number, number, number] = [...this.state.bulas] as [number, number, number];
      bulasRaw[declarer] += delta;
      const capped = this.capHandToMatchEnd(this.state.bulas, bulasRaw, [0, 0, 0]);
      this.state.bulas = capped.bulas;
      this.state.phase = capped.matchOver ? 'MATCH_OVER' : 'GAME_OVER';
      this.state.lastHandResult = {
        bulas: [...capped.bulas] as [number, number, number],
        supeDelta: capped.supeDelta,
        passed: true,
        winner: declarer,
        winnerGame: declared,
        kontraLevel: null,
        refeConsumed: null,
        refeActive: false,
        bulasAfter: [...capped.bulas] as [number, number, number],
      };
      return;
    }
    if (this.state.refeCount[declarer]! + this.state.refePending[declarer]! < this.refePerPlayer) {
      this.state.refeOccurred = true;
      this.awardRefeToAll();
      this.newHand(this.state.dealer);
      return;
    }
    // Nosilac nema slobodan budžet, niko u seširu — ruka se poništava, bez
    // promene bula i bez dodele (RULES 7.2).
    this.newHand(this.state.dealer);
  }

  // RULES 7.1.1 — standardni Pik, nijedan pratilac ne da kontru (oba Moze).
  private handlePikWithoutKontra(): void {
    this.handleUnplayedHand(this.state.winner!, 'Pik');
  }

  // Odbacivanje 2 karte
  discard(player: Position, cardIds: [string, string]): boolean {
    if (this.state.phase !== 'DISCARDING') return false;
    if (player !== this.state.winner) return false;
    const hand = this.state.players[player]!.hand;
    if (cardIds[0] === cardIds[1]) return false;
    const c1 = hand.find(c => c.id === cardIds[0]);
    const c2 = hand.find(c => c.id === cardIds[1]);
    if (!c1 || !c2) return false;
    if (c1 === c2) return false;
    if (cardIds.length !== 2) return false;
    this.state.players[player]!.hand = hand.filter(c => c.id !== cardIds[0] && c.id !== cardIds[1]);
    this.state.discard.push(c1, c2);
    this.state.phase = 'DECLARING';
    return true;
  }

  // IGRA — proglašenje
  declareGame(player: Position, game: GameT): boolean {
    if (this.state.phase !== 'DECLARING') return false;
    if (player !== this.state.winner) return false;
    // Validacija: igra mora biti >= contract
    const contractValue = this.state.currentBid;
    const gameValue = getGameValue(game);
    if (gameValue < contractValue) return false;
    this.state.winnerGame = game;
    this.state.declaredGame = game;
    this.state.trump = getTrumpSuit(game);
    if (isBetl(game)) {
      this.autoFollowBetl();
    } else {
      this.startFollowDeclaring();
    }
    return true;
  }

  private startFollowDeclaring(): void {
    this.state.phase = 'FOLLOW_DECLARING';
    this.state.followChoices = [null, null, null];
    // Desni od nosioca prvi (RULES 5.1) — u nasem engine-u to je (winner + 2) % 3
    if (this.state.winner !== null) {
      const right = ((this.state.winner + 2) % 3) as Position;
      this.state.currentPlayer = this.isPlayerActive(right) ? right : this.nextActivePlayer(this.state.winner);
    }
  }

  // U betlu svi prate automatski
  autoFollowBetl(): void {
    if (!isBetl(this.state.declaredGame!)) return;
    this.state.followChoices = ['DODJEM', 'DODJEM', 'DODJEM'];
    this.state.players[0]!.follows = 'DODJEM';
    this.state.players[1]!.follows = 'DODJEM';
    this.state.players[2]!.follows = 'DODJEM';
    // Betl auto-prati (RULES 5.1), ali kontra je i dalje moguca (RULES 6.9) —
    // nastavi kroz proceedAfterFollow() umesto direktno u PLAYING.
    this.proceedAfterFollow();
  }

  // PRAĆENJE
  follow(player: Position, choice: FollowChoice): boolean {
    if (this.state.phase !== 'FOLLOW_DECLARING') return false;
    if (isBetl(this.state.declaredGame!)) return false;
    if (player === this.state.winner) return false;
    this.state.followChoices[player] = choice;
    this.state.players[player]!.follows = choice;
    this.checkFollowComplete();
    return true;
  }

  private checkFollowComplete(): void {
    if (this.state.winner === null) return;
    const followers = ([0, 1, 2] as Position[]).filter(p => p !== this.state.winner);
    const allDecided = followers.every(p => this.state.followChoices[p] !== null);
    if (!allDecided) return;

    const neDodjemCount = followers.filter(
      p => this.state.followChoices[p] === 'NE_DODJEM',
    ).length;

    if (neDodjemCount === 0) {
      // Svi DODJEM
      this.proceedAfterFollow();
    } else if (neDodjemCount === followers.length) {
      // RULES 5.4 — niko ne prati: nosilac automatski dobija 10 stihova
      this.handleNoOneFollows();
    } else if (this.state.caller !== null) {
      // Neko NE_DODJEM ali poziv uspešan
      this.proceedAfterFollow();
    }
    // Inače: čekamo call
  }

  // Ako nosilac ima refu "na raspolaganju" (refePending), OVA (STVARNO
  // ODIGRANA, do kraja) ruka je pod refeom — troši je (refePending--,
  // refeCount++), jer RULES 7.3 kaze da se refe otpisuje cim se ruka POD
  // REFEOM zavrsi. NAPOMENA: koristi se SAMO za rundu koja se stvarno
  // odigrala (endHand()) — "niko ne prati"/"Pik bez kontre" NISU odigrane
  // runde, tamo vazi drugacija (fresh) provera, vidi handleUnplayedHand().
  //
  // Uzivo prijavljen bag: ako je BILO KO (ne nužno sam nosilac) VEĆ u seširu
  // (negativne bule) kad ova ruka počne, raspoloziva refa NE SME da se
  // potroši — ostaje BLOKIRANA (ne izgubljena, i dalje na raspolaganju za
  // kasnije kad niko vise ne bude u seširu). RULES 7.2 ovo vec kaze za NOVO
  // pisanje refe ("Refe se NE piše ako bar jedan igrač ima negativne bule")
  // — korisnik je potvrdio da isto ogranicenje vazi i za POTROSNJU vec
  // dodeljene, ne samo za novo dodeljivanje.
  private consumeRefeIfPending(declarer: Position): { multiplier: Multiplier; consumed: Position | null } {
    const anyInHat = this.state.bulas.some(b => b < 0);
    if (!anyInHat && this.state.refePending[declarer]! > 0) {
      this.state.refePending[declarer]!--;
      this.state.refeCount[declarer]++;
      return { multiplier: REFE_MULTIPLIER, consumed: declarer };
    }
    return { multiplier: 1, consumed: null };
  }

  // RULES 5.4 — oba pratioca "Ne dodjem": partija se NE IGRA (nema stvarnog
  // protivnika nosiocu). Potvrdjeno uzivo od korisnika, u DVA odvojena
  // pitanja koja se ne smeju pomesati:
  //
  // A) Da li OVAJ dogadjaj sam po sebi OKIDA novu refe dodelu/redeal?
  //    SAMO kad je declaredGame TACNO 'Pik' (ne Igra-Pik, ne bilo koja druga
  //    igra) — prati tri-granu logiku "Pik bez kontre" (7.1.1) preko
  //    handleUnplayedHand(). Za SVE OSTALE igre — NE, nema novog trigera.
  // B) Da li se VEC DODELJENA (ranija) raspoloziva refa TROSI kad ovaj
  //    igrac ovde postane nosilac? DA, uvek, bez obzira na igru — refa je
  //    licna osobina igraca (RULES 7.3), ne vezana za mehanizam kojim se
  //    NJEGOVA ruka zavrsava. Uzivo potvrdjeno: "kako bez refe kad je refa
  //    dodeljena rundu pre?" — prethodna verzija je za ne-Pik igre potpuno
  //    ignorisala VEC POSTOJECU raspolozivu refu, ne samo novo trigerovanje.
  private handleNoOneFollows(): void {
    const declarer = this.state.winner!;
    const declared = this.state.declaredGame!;
    if (declared === 'Pik') {
      this.handleUnplayedHand(declarer, declared);
      return;
    }
    const { multiplier: refeMultiplier, consumed: refeConsumed } = this.consumeRefeIfPending(declarer);
    const delta = -(getGameValue(declared) * 2) * refeMultiplier;
    const bulasRaw: [number, number, number] = [...this.state.bulas] as [number, number, number];
    bulasRaw[declarer] += delta;
    const capped = this.capHandToMatchEnd(this.state.bulas, bulasRaw, [0, 0, 0]);
    this.state.bulas = capped.bulas;
    this.state.phase = capped.matchOver ? 'MATCH_OVER' : 'GAME_OVER';
    this.state.lastHandResult = {
      bulas: [...capped.bulas] as [number, number, number],
      supeDelta: capped.supeDelta,
      passed: true,
      winner: declarer,
      winnerGame: declared,
      kontraLevel: null,
      refeConsumed,
      refeActive: refeConsumed !== null,
      bulasAfter: [...capped.bulas] as [number, number, number],
    };
  }

  private proceedAfterFollow(): void {
    if (this.canHaveKontra()) {
      this.startKontraDeclaring();
    } else {
      this.startPlaying();
    }
  }

  // RULES 6.9 — kontra je dozvoljena za sve tipove igre, uklj. Betl/Sans.
  private canHaveKontra(): boolean {
    return this.state.declaredGame !== null;
  }

  // Poziv - "Idemo zajedno"
  call(caller: Position, callee: Position): boolean {
    if (this.state.phase !== 'FOLLOW_DECLARING') return false;
    if (caller === this.state.winner) return false;
    // callee moze biti winner (caller zove nosioca) ili NE_DODJEM sparing
    if (callee !== this.state.winner && this.state.followChoices[callee] !== 'NE_DODJEM') return false;
    if (this.state.followChoices[caller] !== 'DODJEM') return false;
    // Pozvani NE_DODJEM ostaje NE_DODJEM u followChoices,
    // ali postaje aktivan preko `callee` polja u state-u
    this.state.caller = caller;
    this.state.callee = callee;
    this.checkFollowComplete();
    return true;
  }

  // DODJEM bira da NE zove NE_DODJEM sparinga — winner + DODJEM igraju sami
  continueWithoutCall(): boolean {
    if (this.state.phase !== 'FOLLOW_DECLARING') return false;
    this.proceedAfterFollow();
    return true;
  }

  // Javna verzija za UI/testove
  expectedKontraPlayerPublic(): Position | null {
    return this.expectedKontraPlayer();
  }

  // KONTRA faza
  kontra(player: Position, level: ContraLevel): boolean {
    if (this.state.phase !== 'KONTRA_DECLARING') return false;
    const expected = this.expectedKontraPlayer();
    if (expected === null || player !== expected) return false;
    // Validacija nivoa
    const current = this.state.kontraLevel;
    if (current === null && level !== 'KONTRA') return false;
    if (current === 'KONTRA' && level !== 'REKONTRA') return false;
    if (current === 'REKONTRA' && level !== 'SUBKONTRA') return false;
    if (current === 'SUBKONTRA' && level !== 'MORTKONTRA') return false;
    if (current === 'MORTKONTRA') return false;
    // kontraPlayer je ORIGINALNI kontraš (onaj ko je rekao KONTRA)
    if (level === 'KONTRA') {
      this.state.kontraPlayer = player;
    }
    this.state.kontraLevel = level;
    this.state.players[player]!.kontraLevel = level;
    this.state.mozeCount = 0;
    // Ako je mortkontra — kraj kontra faze
    if (level === 'MORTKONTRA') {
      this.activateAllFollowers();
      this.startPlaying();
    }
    return true;
  }

  moze(player: Position): boolean {
    if (this.state.phase !== 'KONTRA_DECLARING') return false;
    const expected = this.expectedKontraPlayer();
    if (expected === null || player !== expected) return false;
    this.state.mozeCount++;
    this.checkKontraComplete();
    return true;
  }

  // Redosled u kome pratioci odlucuju kontra/moze dok nema kontre (RULES 5.1):
  // desni od nosioca prvi, zatim treci igrac. VAZNO: kontru sme dati SAMO
  // pratilac koji je LICNO rekao "Dodjem" — pozvani "Ne dodjem" partner
  // (callee) JESTE aktivan za igranje karata (isPlayerActive), ali NEMA pravo
  // glasa oko kontre (RULES 5.1: "Kontra – daje onaj KOJI JE DOSAO, ne
  // pozvani"). Zato ovde NE koristimo isPlayerActive, vec direktno
  // followChoices === 'DODJEM' (potvrdjeno uzivo prijavljenim bagom: pozvani
  // NE_DODJEM igrac je dobijao opciju "Kontra").
  private followersInKontraOrder(): Position[] {
    if (this.state.winner === null) return [];
    const winner = this.state.winner;
    const right = ((winner + 2) % 3) as Position; // desni od nosioca
    const third = ((winner + 1) % 3) as Position;
    return [right, third].filter(p => this.state.followChoices[p] === 'DODJEM');
  }

  private expectedKontraPlayer(): Position | null {
    if (this.state.winner === null) return null;
    const level = this.state.kontraLevel;
    const kontraPlayer = this.state.kontraPlayer;
    if (level === null || level === undefined) {
      // Pratioci odlucuju redom (desni prvi); mozeCount = koliko je vec reklo Moze
      const order = this.followersInKontraOrder();
      return order[this.state.mozeCount] ?? null;
    }
    if (level === 'KONTRA') return this.state.winner; // nosilac odgovara
    if (level === 'REKONTRA') return kontraPlayer;
    if (level === 'SUBKONTRA') return this.state.winner;
    if (level === 'MORTKONTRA') return kontraPlayer;
    return null;
  }

  private checkKontraComplete(): void {
    // Ako je Mortkontra data — kraj
    if (this.state.kontraLevel === 'MORTKONTRA') {
      this.activateAllFollowers();
      this.startPlaying();
      return;
    }
    // Ako nema kontre — ceka se dok svi (aktivni) pratioci redom ne kazu Moze
    if (this.state.kontraLevel === null) {
      const order = this.followersInKontraOrder();
      if (this.state.mozeCount >= order.length) {
        if (this.state.declaredGame === 'Pik') {
          // RULES 7.1.1 — standardni Pik bez kontre je posebno pravilo
          this.handlePikWithoutKontra();
        } else {
          this.startPlaying();
        }
      }
      return;
    }
    // Kontra data — čekaj Moze od druge strane
    if (this.state.mozeCount > 0) {
      this.activateAllFollowers();
      this.startPlaying();
    }
  }

  private activateAllFollowers(): void {
    // Kad je data kontra, svi igraju
    for (let i = 0; i < 3; i++) {
      if (i !== this.state.winner && this.state.followChoices[i] !== 'DODJEM') {
        this.state.followChoices[i] = 'DODJEM';
        this.state.players[i]!.follows = 'DODJEM';
      }
    }
  }

  private startKontraDeclaring(): void {
    this.state.phase = 'KONTRA_DECLARING';
    this.state.mozeCount = 0;
  }

  private startPlaying(): void {
    this.state.phase = 'PLAYING';
    this.state.currentPlayer = this.getFirstPlayer();
    this.state.currentTrick = [];
  }

  private getFirstPlayer(): Position {
    const game = this.state.declaredGame!;
    // Sans specifican: pratilac levo od nosioca (RULES 8.1.3 — suprotno od
    // 8.1.1). "Levo" u ovom engine-u je (winner + 1) % 3 — vidi isti "desno"
    // = (winner + 2) % 3 konvenciju u startFollowDeclaring() i kontra redosledu.
    if (game === 'Sans' || game === 'Igra-Sans') {
      const leftOfWinner = ((this.state.winner! + 1) % 3) as Position;
      if (this.isPlayerActive(leftOfWinner)) return leftOfWinner;
      return this.nextActivePlayer(leftOfWinner);
    }
    // Betl i ostale: prvo licitirao
    let candidate: Position;
    if (this.state.players[this.state.bidStartPlayer]!.bidLevel > 0) {
      candidate = this.state.bidStartPlayer;
    } else {
      candidate = nextPlayer(this.state.bidStartPlayer);
    }
    // Preskoci NE_DODJEM koji nije zvan
    if (this.isPlayerActive(candidate)) return candidate;
    return this.nextActivePlayer(candidate);
  }

// IGRA KARTE
  playCard(player: Position, cardId: string): boolean {
    if (this.state.phase !== 'PLAYING') return false;
    if (player !== this.state.currentPlayer) return false;
    // NE_DODJEM koji nije zvan NE igra karte
    if (!this.isPlayerActive(player)) return false;
    const p = this.state.players[player]!;
    const cardIdx = p.hand.findIndex(c => c.id === cardId);
    if (cardIdx < 0) return false;
    const card = p.hand[cardIdx]!;
    if (!isCardLegal(card, p.hand, this.state.currentTrick, this.state.trump)) return false;
    p.hand.splice(cardIdx, 1);
    this.state.currentTrick.push({ player, card });
    if (this.state.currentTrick.length >= this.activePlayerCount()) {
      this.resolveTrick();
    } else {
      this.state.currentPlayer = this.nextActivePlayer(this.state.currentPlayer);
    }
    return true;
  }

  private resolveTrick(): void {
    // Pobednik je medju igracima koji su zaista igrali kartu
    const trickCards = this.state.currentTrick.filter(
      (tc): tc is { player: Position; card: Card } =>
        tc.player === this.state.winner ||
        this.state.followChoices[tc.player] === 'DODJEM' ||
        (this.state.followChoices[tc.player] === 'NE_DODJEM' && this.state.callee === tc.player),
    );
    if (trickCards.length === 0) return;
    const winner = trickWinner(trickCards, this.state.trump);
    if (winner === null) return;
    this.state.players[winner]!.tricksWon++;
    this.state.players[winner]!.stihi.push(trickCards.map(tc => tc.card));
    this.state.tricks.push(this.state.currentTrick.slice());
    this.state.currentTrick = [];
    this.state.trickCount++;
    this.state.currentPlayer = winner;
    if (this.state.trickCount >= TRICKS_PER_HAND || this.isDeclarerCertainlyDown()) {
      this.endHand();
    }
  }

  // Runda se prekida automatski cim je nosiocev pad IZVESTAN — protivnicima
  // vise ne mogu da se otmu preostali stihovi, pa nema smisla dalje igrati.
  // Za standardne igre (potreban prag 6/10): cim protivnici zajedno uhvate
  // toliko stihova da nosilac vise NE MOZE stici do praga (5. protivnicki
  // stih), partija staje — supe se racunaju na osnovu stihova uhvacenih DO
  // TAD, bez daljeg igranja. Za Betl (prag je 0, tj. nosilac ne sme uhvatiti
  // NI JEDAN stih): nosilac pada cim uhvati i samo jedan stih.
  // Potvrdjeno uzivo od korisnika (primer: nosilac 3, pratioci 7 -> treba
  // stati na 5, ne pustiti da naraste na 7).
  private isDeclarerCertainlyDown(): boolean {
    const declared = this.state.declaredGame;
    const declarer = this.state.winner;
    if (declared === null || declarer === null) return false;
    const declarerTricks = this.state.players[declarer]!.tricksWon;
    if (isBetl(declared)) {
      return declarerTricks >= 1;
    }
    const required = REQUIRED_TRICKS[declared];
    const opponentTricks = this.state.trickCount - declarerTricks;
    return opponentTricks >= TRICKS_PER_HAND - required + 1;
  }

// Broj aktivnih igraca (ne NE_DODJEM koji nije zvan)
  activePlayerCount(): number {
    let count = 0;
    for (let i = 0; i < 3; i++) {
      if (this.isPlayerActive(i as Position)) count++;
    }
    return count;
  }

  // Da li igrac ucestvuje u ovoj ruci
  // Aktivan: winner + DODJEM + pozvani NE_DODJEM (callee)
  isPlayerActive(player: Position): boolean {
    const s = this.state;
    if (s.winner === player) return true;
    if (s.followChoices[player] === 'DODJEM') return true;
    if (s.followChoices[player] === 'NE_DODJEM' && s.callee === player) return true;
    return false;
  }

  // Sledeci aktivni igrac (preskace NE_DODJEM koji sedi)
  nextActivePlayer(from: Position): Position {
    let next = nextPlayer(from);
    let safety = 0;
    while (safety < 3) {
      if (this.isPlayerActive(next)) return next;
      next = nextPlayer(next);
      safety++;
    }
    return next;
  }
  // KRAJ PARTIJE
  endHand(): EndOfHandResult {
    const declared = this.state.declaredGame!;
    const declarer = this.state.winner!;
    const declarerTricks = this.state.players[declarer]!.tricksWon;
    const contraMultiplier: Multiplier = this.state.kontraLevel === 'KONTRA' ? CONTRA_MULTIPLIERS.KONTRA
      : this.state.kontraLevel === 'REKONTRA' ? CONTRA_MULTIPLIERS.REKONTRA
      : this.state.kontraLevel === 'SUBKONTRA' ? CONTRA_MULTIPLIERS.SUBKONTRA
      : this.state.kontraLevel === 'MORTKONTRA' ? CONTRA_MULTIPLIERS.MORTKONTRA
      : CONTRA_MULTIPLIERS.NONE;
    const { multiplier: refeMultiplier, consumed: refeConsumed } = this.consumeRefeIfPending(declarer);

    const declarerDelta = calculateBulaChange(declarerTricks, declared, contraMultiplier, refeMultiplier);
    const passed = declarerDelta < 0;

    // Odredi aktivne pratioce — DODJEM igraci I pozvani NE_DODJEM partner
    // (koji STVARNO igra karte, vidi isPlayerActive()). Uzivo prijavljen bag:
    // ranije se ovde gledalo SAMO na 'DODJEM' izbor, pa je pozvani (koji je
    // rekao NE_DODJEM ali je pozvan da igra) ispadao iz tricksWon mape —
    // njegovi stihovi se nikad nisu racunali u zajednicki zbir za pozivaoca.
    const activeFollowers = ([0, 1, 2] as Position[])
      .filter(p => p !== declarer && this.isPlayerActive(p));

    const tricksWon: Partial<Record<Position, number>> = {};
    for (const f of activeFollowers) tricksWon[f] = this.state.players[f]!.tricksWon;
    const dist = calculateBulaDistribution(declarerDelta, {
      active: activeFollowers,
      kontraš: this.state.kontraPlayer,
      pozivalac: this.state.caller,
      pozvani: this.state.callee,
      tricksWon,
      isBetl: isBetl(declared),
    });

    // Bule
    const bulas: [number, number, number] = [...this.state.bulas] as [number, number, number];
    bulas[declarer] += declarerDelta;
    for (let i = 0; i < 3; i++) {
      if (i !== declarer && dist[i as Position] !== undefined) {
        bulas[i] += dist[i as Position]!;
      }
    }

    // Supe. NAPOMENA: `passed` = nosilac USPEO (declarerDelta < 0). Ove grane
    // su ranije bile OBRNUTE (kod "nosilac prošao" komentara je zapravo
    // izvršavao kod za "nosilac pao" i obrnuto) — zato supe NISU bile pisane
    // kad nosilac uspe bez kontre (uzivo prijavljeni bag). Popravljeno.
    const supeDelta: [number, number, number] = [0, 0, 0];
    if (isBetl(declared)) {
      if (!passed) {
        // Betl pad: fiksno 60/70 po pratiocu (RULES 9.4.1) — NAMERNO ide
        // SVAKOM aktivnom pratiocu, ne samo kontrasu. Ovo je izuzetak od
        // opsteg "kontras upisuje sve" pravila (9.4/6.3), koje vazi za
        // standardne igre gde se supe racunaju po stvarnim stihovima. Betl
        // je fiksna vrednost nevezana za stihove, pa oba pratioca vode
        // sopstveni upis nezavisno od toga ko je dao kontru — potvrdjeno
        // RULES.md "Pitanje 9 -> A" i nezavisno preferansklub.com ("pri
        // padu na betl pratioci beleze po 60 supa", bez uslova o kontri).
        const fixed = calculateBetlSupa(declared, contraMultiplier, refeMultiplier);
        for (const f of activeFollowers) {
          supeDelta[f] += fixed;
        }
      }
      // Betl prošao (0 stihova nosioca): RULES 9.4.1 — pratioci NE zaradjuju
      // supe uopste, bez obzira na njihove stihove. supeDelta ostaje 0.
    } else if (passed && this.state.caller !== null) {
      // Pozvan igrač (RULES 5.3): "njegovi bodovi idu pratiocu koji ga je
      // pozvao" — stihovi pozivaoca I pozvanog se SABIRAJU, ceo zbir ide
      // pozivaocu. Pozvani NE upisuje nista (uzivo prijavljen bag: koristio
      // se SAMO pozivaočev sopstveni broj štihova, pozvanog se gubio).
      const caller = this.state.caller;
      const callee = this.state.callee;
      const combinedTricks =
        this.state.players[caller]!.tricksWon +
        (callee !== null ? this.state.players[callee]!.tricksWon : 0);
      supeDelta[caller] += calculateSupaForFollower(combinedTricks, declared, contraMultiplier, refeMultiplier);
    } else if (passed && this.state.kontraPlayer !== null) {
      // Nosilac prošao, ALI kontra data — kontraš snosi SVU odgovornost
      // (RULES 6.3), pa dobija supe za SVE štihove koje je ODBRANA (svi
      // ne-nosioci ZAJEDNO) uhvatila, ne samo svoje lične — isto kao kad
      // nosilac PADNE (vidi granu ispod, ista formula). Uzivo prijavljen
      // bag: ovde se ranije koristila SAMO kontraševa lična tricksWon, pa
      // je npr. "kontraš 0 ličnih + drugi pratilac 2 zajedno = 2 ukupno"
      // davalo 0 supa umesto supe računate na ta 2 zajednička štiha.
      const opponentTricks =
        this.state.players[0]!.tricksWon + this.state.players[1]!.tricksWon +
        this.state.players[2]!.tricksWon - declarerTricks;
      const supe = calculateSupaForFollower(opponentTricks, declared, contraMultiplier, refeMultiplier);
      supeDelta[this.state.kontraPlayer] += supe;
    } else if (passed) {
      // Nosilac prošao, BEZ kontre — pratioci zarađuju supe za svoje
      // štihove, svako nezavisno (RULES 9.4)
      for (const f of activeFollowers) {
        const tricks = this.state.players[f]!.tricksWon;
        const supe = calculateSupaForFollower(tricks, declared, contraMultiplier, refeMultiplier);
        supeDelta[f] += supe;
      }
    } else if (this.state.kontraPlayer !== null) {
      // Nosilac pao, kontra data — kontraš dobija supe za SVE stihove koje
      // je ODBRANA (svi ne-nosioci ZAJEDNO) uhvatila, ne samo nosiočeve
      // preostale, i ne samo kontraševe licne. Runda se automatski prekida
      // cim odbrana uhvati 5. stih (isDeclarerCertainlyDown — RULES 9.4/8),
      // pa je taj zbir UVEK tacno 5 za standardne/Igra igre. Potvrdjeno
      // uzivo i tekstom REFERENTNI_PRIMERI.md runda #11: "Janko: 80 supa
      // (5 x 8 x 2)" gde je 5 = odbrambeni STIHOVI ZAJEDNO, ne nosiočevi
      // (tu su slucajno bili jednaki 5-5, pa je ranija verzija — koja je
      // koristila nosiočeve stihove — prosla neopazeno pogresna).
      const opponentTricks =
        this.state.players[0]!.tricksWon + this.state.players[1]!.tricksWon +
        this.state.players[2]!.tricksWon - declarerTricks;
      const supe = calculateSupaForFollower(opponentTricks, declared, contraMultiplier, refeMultiplier);
      supeDelta[this.state.kontraPlayer] += supe;
    } else if (this.state.caller !== null) {
      // Nosilac pao, pozivalac bez kontre (RULES 5.3) — isto sabiranje kao
      // na uspeh-strani, radi konzistentnosti.
      const caller = this.state.caller;
      const callee = this.state.callee;
      const combinedTricks =
        this.state.players[caller]!.tricksWon +
        (callee !== null ? this.state.players[callee]!.tricksWon : 0);
      supeDelta[caller] += calculateSupaForFollower(combinedTricks, declared, contraMultiplier, refeMultiplier);
    } else {
      // Nosilac pao, NEZAVISNI pratioci (bez poziva/kontre) — SVAKO
      // zaradjuje supe za SVOJE stihove (RULES 9.4), nezavisno od toga da
      // li je dostigao licni prag za bulu (5.2). Uzivo prijavljen bag: ova
      // grana uopste nije postojala — nezavisni pratioci nisu dobijali
      // NIKAKVE supe kad nosilac padne bez kontre.
      for (const f of activeFollowers) {
        const tricks = this.state.players[f]!.tricksWon;
        const supe = calculateSupaForFollower(tricks, declared, contraMultiplier, refeMultiplier);
        supeDelta[f] += supe;
      }
    }

    // RULES 9.1 — partija (cela sesija, ne samo ova ruka) traje dok zbir
    // bula sva tri igraca ne postane TACNO 0. Ako bi ova ruka odvela zbir
    // ISPOD 0 (preterala cilj), sve promene ruke se PROPORCIONALNO smanjuju
    // da zbir sleti tacno na 0 umesto da ga preskoci. Uzivo prijavljen bag:
    // "partija ne moze da se zavrsi" — ranije se ovaj cilj uopste nije
    // proveravao, partija se samo nastavljala unedogled.
    const capped = this.capHandToMatchEnd(this.state.bulas, bulas, supeDelta);
    this.state.bulas = capped.bulas;
    this.state.phase = capped.matchOver ? 'MATCH_OVER' : 'GAME_OVER';

    const result: EndOfHandResult = {
      bulas: [...this.state.bulas] as [number, number, number],
      supeDelta: capped.supeDelta,
      passed,
      winner: declarer,
      winnerGame: declared,
      kontraLevel: this.state.kontraLevel,
      refeConsumed,
      refeActive: refeConsumed !== null,
      bulasAfter: [...this.state.bulas] as [number, number, number],
    };
    this.state.lastHandResult = result;
    return result;
  }

  // Vidi endHand() — deljena logika "ne dozvoli da zbir bula preskoci 0".
  // Kad ruka BEZ capovanja preteruje cilj (zbir bi pao ispod 0), sve
  // promene (bula i supe, svakom igracu nezavisno) se skaliraju ISTIM
  // razmerom tako da zbir POSLE ruke bude tacno 0 — ne manje. Kad ruka ne
  // preteruje, prosledjuje se bez izmene.
  private capHandToMatchEnd(
    bulasBefore: [number, number, number],
    bulasAfterRaw: [number, number, number],
    supeDeltaRaw: [number, number, number],
  ): { bulas: [number, number, number]; supeDelta: [number, number, number]; matchOver: boolean } {
    const sumBefore = bulasBefore[0]! + bulasBefore[1]! + bulasBefore[2]!;
    if (sumBefore <= 0) {
      // Partija je vec trebalo da bude gotova pre ove ruke — odbrambeno,
      // ne diraj brojeve, samo oznaci kraj.
      return { bulas: bulasAfterRaw, supeDelta: supeDeltaRaw, matchOver: true };
    }
    const sumAfterRaw = bulasAfterRaw[0]! + bulasAfterRaw[1]! + bulasAfterRaw[2]!;
    if (sumAfterRaw >= 0) {
      return { bulas: bulasAfterRaw, supeDelta: supeDeltaRaw, matchOver: sumAfterRaw === 0 };
    }
    // Preterano — cap-uj sve promene ISTIM razmerom da zbir sleti tacno na 0.
    const rawTotalChange = sumAfterRaw - sumBefore; // negativan
    const ratio = -sumBefore / rawTotalChange; // (0, 1)
    const bulas: [number, number, number] = [0, 0, 0];
    const supeDelta: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const rawDelta = bulasAfterRaw[i]! - bulasBefore[i]!;
      bulas[i] = bulasBefore[i]! + Math.round(rawDelta * ratio);
      supeDelta[i] = Math.round(supeDeltaRaw[i]! * ratio);
    }
    return { bulas, supeDelta, matchOver: true };
  }

  // Stanje za UI
  getState(): Readonly<GameState> {
    return this.state;
  }

  // Legalne karte za trenutnog igrača
  getLegalCards(player: Position = this.state.currentPlayer): Card[] {
    // NE_DODJEM igrac koji nije zvan — nema legalnih karata (ne igra)
    if (this.state.followChoices[player] === 'NE_DODJEM' && this.state.callee !== player) {
      return [];
    }
    return getLegalCards(
      this.state.players[player]!.hand,
      this.state.currentTrick,
      this.state.trump,
    );
  }

  // Legalne akcije za UI — UI koristi da prikaze samo dugmad za legalne akcije
  getLegalActions(): LegalAction[] {
    const s = this.state;
    const actions: LegalAction[] = [];

    switch (s.phase) {
      case 'BIDDING': {
        const player = s.currentBidder;
        const bidLevel = s.players[player]!.bidLevel;
        // MOGU-eligible: vec licitirao I trenutno nadmasen. Takav igrac
        // prvo ima pravo na Mogu (potvrda) — ali ne sme sam da podigne DOK
        // je Mogu jos dostupan (potvrdjeno direktno od korisnika).
        const moguEligible = bidLevel > 0 && s.currentBid > bidLevel;
        // PASS je uvek dozvoljen
        actions.push({ type: 'pass', player, label: 'Dalje' });
        // SAMO JEDAN igrac sme potvrditi (Mogu) datu vrednost — ako je NEKO
        // VEC potvrdio, ova opcija nestaje za sve ostale (potvrdjeno
        // direktno, vise puta od korisnika).
        const alreadyConfirmedByMogu = s.bids.some(
          b => b.type === 'MOGU' && b.value === s.currentBid,
        );
        if (moguEligible && !alreadyConfirmedByMogu) {
          actions.push({ type: 'mogu', player, value: s.currentBid, label: `Mogu ${s.currentBid}` });
        }
        // BID X — dozvoljeno kad igrac NIJE Mogu-eligible (drzi vrh ili jos
        // nije licitirao), ILI kad JESTE Mogu-eligible ali je Mogu vec
        // zauzet od DRUGOG igraca. Uzivo prijavljen bag: Mogu-eligible
        // igrac je ostajao zaglavljen SAMO sa "Dalje" (bez ikakve opcije
        // podizanja) cim bi mu Mogu slot bio zauzet, iako je imao dovoljno
        // jaku ruku za legitimno podizanje na sledecu vrednost.
        if (!moguEligible || alreadyConfirmedByMogu) {
          const nextBid = Math.max(2, s.currentBid + 1);
          if (nextBid <= 7) {
            actions.push({ type: 'bid', player, value: nextBid, label: `${nextBid}` });
          }
        }
        // IGRA samo dok je igracEligible (RULES 3.4 — mora biti njegov PRVI
        // potez u rundi; cim je na svom prvom potezu vec rekao broj ili
        // "dalje", trajno gubi pravo do kraja runde, vidi igraEligible u
        // types.ts). Stari uslov (samo bidLevel===0) nije hvatao slucaj kad
        // je prvi potez bio "dalje" (bidLevel ostaje 0, ali igrac vise ne
        // sme Igra) — uzivo prijavljen bag.
        if (s.players[player]!.igraEligible) {
          actions.push({ type: 'igra', player, label: 'Igra' });
        }
        break;
      }

      case 'DISCARDING': {
        const winner = s.winner ?? 0;
        actions.push({
          type: 'discard-info',
          player: winner,
          handSize: s.players[winner]!.hand.length,
          label: 'Odbaci 2 karte',
        });
        break;
      }

      case 'DECLARING': {
        // RULES 3.4.1 tiebreak — VISE igraca reklo Igra: winner je JOS null,
        // trenutni deklarant je s.currentBidder (isti obrazac kao bidding).
        const declarer = s.igraCompetitors !== null ? s.currentBidder : s.winner!;
        const contract = s.currentBid;
        if (s.igraPlayer !== null) {
          for (const g of IGRA_GAMES) {
            if (GAME_VALUES[g] >= contract) {
              actions.push({ type: 'declare', player: declarer, game: g, label: g.replace('Igra-', '') });
            }
          }
        } else {
          for (const g of STANDARD_GAMES) {
            if (GAME_VALUES[g] >= contract) {
              actions.push({ type: 'declare', player: declarer, game: g, label: g });
            }
          }
        }
        break;
      }

      case 'FOLLOW_DECLARING': {
        const followers = ([0, 1, 2] as Position[]).filter(p => p !== s.winner);
        // Prikazi DODJEM/NE_DODJEM za svakog pratioca koji jos nije odlucio
        for (const f of followers) {
          if (s.followChoices[f] === null) {
            actions.push({ type: 'follow', player: f, choice: 'DODJEM', label: 'Dodjem' });
            actions.push({ type: 'follow', player: f, choice: 'NE_DODJEM', label: 'Ne dodjem' });
          }
        }
        // Ako su svi odlucili ali caller nije postavljen, DODJEM bira
        if (s.followChoices.every((c, i) => i === s.winner || c !== null) && s.caller === null) {
          const dodjemCount = followers.filter(p => s.followChoices[p] === 'DODJEM').length;
          const neDodjemCount = followers.filter(p => s.followChoices[p] === 'NE_DODJEM').length;
          if (dodjemCount === 1 && neDodjemCount === 1) {
            const dodjemPlayer = followers.find(p => s.followChoices[p] === 'DODJEM')!;
            const neDodjemPlayer = followers.find(p => s.followChoices[p] === 'NE_DODJEM')!;
            actions.push({ type: 'call', player: dodjemPlayer, callee: neDodjemPlayer, label: `Zovi ${neDodjemPlayer}` });
            actions.push({ type: 'continueWithoutCall', player: dodjemPlayer, label: 'Igram sam' });
          }
        }
        break;
      }

      case 'KONTRA_DECLARING': {
        const expected = this.expectedKontraPlayer();
        if (expected !== null) {
          // Kontra dugme
          const nextLevel = this.nextKontraLevel();
          if (nextLevel !== null) {
            actions.push({ type: 'kontra', player: expected, level: nextLevel, label: nextLevel });
          }
          // Moze dugme
          actions.push({ type: 'moze', player: expected, label: 'Moze' });
        }
        break;
      }

      case 'PLAYING': {
        const player = s.currentPlayer;
        if (this.isPlayerActive(player)) {
          const legal = this.getLegalCards(player);
          for (const c of legal) {
            actions.push({ type: 'playCard', player, cardId: c.id, label: `${c.rank}${c.suit}` });
          }
        }
        break;
      }

      case 'WAITING':
      case 'REFE':
      case 'GAME_OVER':
      default:
        break;
    }

    return actions;
  }

  // Helper za getLegalActions — sledeci nivo kontre
  private nextKontraLevel(): ContraLevel | null {
    const current = this.state.kontraLevel;
    if (current === null) return 'KONTRA';
    if (current === 'KONTRA') return 'REKONTRA';
    if (current === 'REKONTRA') return 'SUBKONTRA';
    if (current === 'SUBKONTRA') return 'MORTKONTRA';
    return null;
  }

  // Otpisivanje ako partija ne može da se završi
  writeOff(): { writeOff: [number, number, number]; finalBule: [number, number, number] } {
    return calculateWriteOff(this.state.bulas);
  }
}

function makeRng(seed: number): () => number {
  let state = seed % 4294967296;
  if (state === 0) state = 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export { POS_LABELS, cardToString, isNoTrump };
