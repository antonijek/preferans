// PREFERANS Game klasa — orchestruje sve module

import {
  INITIAL_BULAS,
  TRICKS_PER_HAND,
} from './constants.js';
import { deal } from './deal.js';
import { getTrumpSuit, isNoTrump, isBetl, isIgra, isSans, getGameValue } from './scoring.js';
import { trickWinner, isCardLegal, getLegalCards } from './trick.js';
import {
  calculateBulaChange,
  calculateBulaDistribution,
  calculateSupaForFollower,
  calculateBetlSupa,
  calculateWriteOff,
  type Multiplier,
} from './scoring.js';
import { CONTRA_MULTIPLIERS, REFE_MULTIPLIER } from './constants.js';
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
} from './types.js';

export interface GameConfig {
  playerNames?: [string, string, string];
  seed?: number;
  refePerPlayer?: number;
  initialBule?: number;
}

export interface EndOfHandResult {
  bulas: [number, number, number];
  supeDelta: [number, number, number];
  passed: boolean;
  winner: Position | null;
  winnerGame: GameT | null;
  refeConsumed: Position | null;
  refeActive: boolean;
  bulasAfter: [number, number, number];
}

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
      discard: [],
      currentTrick: [],
      tricks: [],
      trickCount: 0,
      followChoices: [null, null, null],
      caller: null,
      kontraPlayer: null,
      kontraLevel: null,
      mozeCount: 0,
      refeUsed: false,
      refeOccurred: false,
      scores: [0, 0, 0],
      bulas: [this.initialBule, this.initialBule, this.initialBule],
      refeCount: [0, 0, 0],
      igraPlayer: null,
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
    this.state.discard = [];
    this.state.currentTrick = [];
    this.state.tricks = [];
    this.state.trickCount = 0;
    this.state.followChoices = [null, null, null];
    this.state.caller = null;
    this.state.kontraPlayer = null;
    this.state.kontraLevel = null;
    this.state.mozeCount = 0;
    this.state.refeUsed = false;
    this.state.refeOccurred = false;
    this.state.igraPlayer = null;
    for (let i = 0; i < 3; i++) {
      const p = this.state.players[i]!;
      p.hand = result.hands[i]!.slice();
      p.tricksWon = 0;
      p.stihi = [];
      p.hasPassedBid = false;
      p.bidLevel = 0;
      p.kontraLevel = null;
      p.follows = null;
    }
    this.state.phase = 'BIDDING';
  }

  // LICITACIJA
  bid(player: Position, value: number): boolean {
    if (this.state.phase !== 'BIDDING') return false;
    if (player !== this.state.currentBidder) return false;
    const p = this.state.players[player]!;
    if (p.hasPassedBid) return false;
    if (value < 2 || value > 7) return false;
    // Potvrda iste vrednosti — samo pomeri bidding
    if (value === this.state.currentBid && this.state.currentBid > 0) {
      p.bidLevel = value;
      this.state.bids.push({ player, type: 'MOGU', value });
      this.advanceBidder();
      return true;
    }
    if (value <= this.state.currentBid) return false;
    this.state.currentBid = value;
    p.bidLevel = value;
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
    p.hasPassedBid = true;
    this.state.bids.push({ player, type: 'PASS' });
    this.advanceBidder();
    return true;
  }

  // IGRA — igrač odmah proglašava igru, BEZ talona
  // IGRA — samo kaže "igra" bez navođenja koje
  // Posle bidding završetka, ako je pobedio igrač koji je rekao "igra", on proglašava konkretnu igru
  sayIgra(player: Position): boolean {
    if (this.state.phase !== 'BIDDING') return false;
    if (player !== this.state.currentBidder) return false;
    this.state.igraPlayer = player;
    this.state.bids.push({ player, type: 'IGRA' });
    this.advanceBidder();
    return true;
  }

  declareIgra(game: GameT): boolean {
    if (this.state.phase !== 'DECLARING') return false;
    if (this.state.winner === null) return false;
    if (this.state.igraPlayer !== this.state.winner) return false;
    if (!isIgra(game)) return false;
    this.state.winnerGame = game;
    this.state.declaredGame = game;
    this.state.trump = getTrumpSuit(game);
    this.startFollowDeclaring();
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

    // Ako su svi prošli — refe (čak i ako su neki licitirali pa odustali)
    if (this.allPassed()) {
      this.handleRefe();
      return;
    }

    // Ako postoji bidder koji je ostao (nije prošao) — winner
    const bidders = ([0, 1, 2] as Position[]).filter(
      p => this.state.players[p]!.bidLevel > 0 || this.state.igraPlayer === p,
    );
    const activeBidders = bidders.filter(
      p => !this.state.players[p]!.hasPassedBid,
    );
    if (bidders.length > 0 && activeBidders.length === 1) {
      this.state.winner = activeBidders[0]!;
      this.afterBiddingWon();
    }
  }

  private allPassed(): boolean {
    return ([0, 1, 2] as Position[]).every(p => this.state.players[p]!.hasPassedBid);
  }

  private afterBiddingWon(): void {
    const winner = this.state.winner!;
    const winnerGame = this.state.winnerGame;
    if (winnerGame !== null && isIgra(winnerGame)) {
      // Igra: nema talona, već postavljeno u igra()
      this.startFollowDeclaring();
    } else {
      // Regularna pobeda: uzmi talon, DISCARDING
      this.takeTalon(winner);
      this.state.phase = 'DISCARDING';
    }
  }

  private takeTalon(player: Position): void {
    this.state.players[player]!.hand.push(...this.state.talon);
    this.state.talon = [];
  }

  private handleRefe(): void {
    this.state.refeOccurred = true;
    // Ako neko u šeširu — refe se ne važi
    const anyInHat = this.state.bulas.some(b => b < 0);
    if (anyInHat) {
      this.state.phase = 'GAME_OVER';
      return;
    }
    // Ako svi iskoristili refe — samo game over
    const maxRefe = 2;
    const allExhausted = this.state.refeCount.every(r => r >= maxRefe);
    if (allExhausted) {
      this.state.phase = 'GAME_OVER';
      return;
    }
    this.state.phase = 'REFE';
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
    // Desni od nosioca prvi
    if (this.state.winner !== null) {
      // currentPlayer se ne koristi ovde, ali pripremimo
    }
  }

  // U betlu svi prate automatski
  autoFollowBetl(): void {
    if (!isBetl(this.state.declaredGame!)) return;
    this.state.followChoices = ['DODJEM', 'DODJEM', 'DODJEM'];
    this.state.players[0]!.follows = 'DODJEM';
    this.state.players[1]!.follows = 'DODJEM';
    this.state.players[2]!.follows = 'DODJEM';
    this.startPlaying();
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
    } else if (this.state.caller !== null) {
      // Neko NE_DODJEM ali poziv uspešan
      this.proceedAfterFollow();
    }
    // Inače: čekamo call
  }

  private proceedAfterFollow(): void {
    if (this.canHaveKontra()) {
      this.startKontraDeclaring();
    } else {
      this.startPlaying();
    }
  }

  private canHaveKontra(): boolean {
    const declared = this.state.declaredGame;
    if (!declared) return false;
    if (isBetl(declared) || isSans(declared)) return false;
    return true;
  }

  // Poziv — "Idemo zajedno"
  call(caller: Position, callee: Position): boolean {
    if (this.state.phase !== 'FOLLOW_DECLARING') return false;
    if (caller === this.state.winner || callee === this.state.winner) return false;
    if (this.state.followChoices[callee] !== 'NE_DODJEM') return false;
    if (this.state.followChoices[caller] !== 'DODJEM') return false;
    this.state.followChoices[callee] = 'DODJEM';
    this.state.caller = caller;
    this.checkFollowComplete();
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

  private expectedKontraPlayer(): Position | null {
    if (this.state.winner === null) return null;
    const level = this.state.kontraLevel;
    const kontraPlayer = this.state.kontraPlayer;
    if (level === null || level === undefined) {
      // Prvi kontra — prvi "Dodjem" pratilac
      const followers = ([0, 1, 2] as Position[]).filter(p => p !== this.state.winner);
      for (const f of followers) {
        if (this.state.followChoices[f] === 'DODJEM') return f;
      }
      return null;
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
    // Ako nema kontre i svi pratioci rekli Moze
    if (this.state.kontraLevel === null) {
      if (this.allFollowersMozed()) {
        this.startPlaying();
      }
      return;
    }
    // Kontra data — čekaj Moze od druge strane
    if (this.state.mozeCount > 0) {
      this.activateAllFollowers();
      this.startPlaying();
    }
  }

  private allFollowersMozed(): boolean {
    if (this.state.winner === null) return true;
    const followers = ([0, 1, 2] as Position[]).filter(p => p !== this.state.winner);
    return followers.every(p => this.state.players[p]!.kontraLevel === null);
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
    // Sans specifičan: pratilac levo od nosioca
    if (game === 'Sans' || game === 'Igra-Sans') {
      const leftOfWinner = ((this.state.winner! + 2) % 3) as Position;
      return leftOfWinner;
    }
    // Betl i ostale: prvo licitirao
    if (this.state.players[this.state.bidStartPlayer]!.bidLevel > 0) {
      return this.state.bidStartPlayer;
    }
    // Ako bidStartPlayer nije licitirao, desni od njega
    return nextPlayer(this.state.bidStartPlayer);
  }

  // IGRA KARTE
  playCard(player: Position, cardId: string): boolean {
    if (this.state.phase !== 'PLAYING') return false;
    if (player !== this.state.currentPlayer) return false;
    const p = this.state.players[player]!;
    const cardIdx = p.hand.findIndex(c => c.id === cardId);
    if (cardIdx < 0) return false;
    const card = p.hand[cardIdx]!;
    if (!isCardLegal(card, p.hand, this.state.currentTrick, this.state.trump)) return false;
    p.hand.splice(cardIdx, 1);
    this.state.currentTrick.push({ player, card });
    if (this.state.currentTrick.length === 3) {
      this.resolveTrick();
    } else {
      this.state.currentPlayer = nextPlayer(this.state.currentPlayer);
    }
    return true;
  }

  private resolveTrick(): void {
    const winner = trickWinner(this.state.currentTrick, this.state.trump);
    if (winner === null) return;
    this.state.players[winner]!.tricksWon++;
    this.state.players[winner]!.stihi.push(this.state.currentTrick.map(tc => tc.card));
    this.state.tricks.push(this.state.currentTrick.slice());
    this.state.currentTrick = [];
    this.state.trickCount++;
    this.state.currentPlayer = winner;
    if (this.state.trickCount >= TRICKS_PER_HAND) {
      this.endHand();
    }
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
    const refeMultiplier: Multiplier = this.state.refeUsed ? REFE_MULTIPLIER : 1;

    const declarerDelta = calculateBulaChange(declarerTricks, declared, contraMultiplier, refeMultiplier);
    const passed = declarerDelta < 0;

    // Odredi aktivne pratioce
    const activeFollowers = this.state.followChoices
      .map((c, i) => c === 'DODJEM' ? i as Position : null)
      .filter((p): p is Position => p !== null && p !== declarer);

    const dist = calculateBulaDistribution(declarerDelta, {
      active: activeFollowers,
      kontraš: this.state.kontraPlayer,
      pozivalac: this.state.caller,
    });

    // Bule
    const bulas: [number, number, number] = [...this.state.bulas] as [number, number, number];
    bulas[declarer] += declarerDelta;
    for (let i = 0; i < 3; i++) {
      if (i !== declarer && dist[i as Position] !== undefined) {
        bulas[i] += dist[i as Position]!;
      }
    }

    // Supe
    const supeDelta: [number, number, number] = [0, 0, 0];
    if (isBetl(declared) && !passed) {
      // Betl pad: fiksno 60/70 po pratiocu
      const fixed = calculateBetlSupa(declared, contraMultiplier, refeMultiplier);
      for (const f of activeFollowers) {
        if (this.state.kontraPlayer === f || this.state.caller === null) {
          supeDelta[f] += fixed;
        } else if (this.state.caller === f) {
          // Pozivalac dobija supe (ali pozvanog NE upisuje)
          supeDelta[f] += fixed;
        }
      }
    } else if (!passed) {
      // Nosilac prošao — pratioci zarađuju supe za svoje štihove
      for (const f of activeFollowers) {
        const tricks = this.state.players[f]!.tricksWon;
        const supe = calculateSupaForFollower(tricks, declared, contraMultiplier, refeMultiplier);
        // Pozvani NE upisuje — sve ide pozivaocu
        if (this.state.caller !== null && f !== this.state.caller) continue;
        if (this.state.kontraPlayer !== null && f !== this.state.kontraPlayer) continue;
        supeDelta[f] += supe;
      }
    } else {
      // Nosilac pao — kontraš dobija supe za sve štihove nosioca
      const declarerTricks = this.state.players[declarer]!.tricksWon;
      const supe = calculateSupaForFollower(declarerTricks, declared, contraMultiplier, refeMultiplier);
      if (this.state.kontraPlayer !== null) {
        supeDelta[this.state.kontraPlayer] += supe;
      }
    }

    const refeConsumed = this.state.refeUsed ? declarer : null;
    if (refeConsumed !== null) {
      this.state.refeCount[refeConsumed]++;
    }

    this.state.bulas = bulas;
    this.state.phase = 'GAME_OVER';

    return {
      bulas: [...this.state.bulas] as [number, number, number],
      supeDelta,
      passed,
      winner: declarer,
      winnerGame: declared,
      refeConsumed,
      refeActive: this.state.refeUsed,
      bulasAfter: [...this.state.bulas] as [number, number, number],
    };
  }

  // Stanje za UI
  getState(): Readonly<GameState> {
    return this.state;
  }

  // Legalne karte za trenutnog igrača
  getLegalCards(player: Position = this.state.currentPlayer): Card[] {
    return getLegalCards(
      this.state.players[player]!.hand,
      this.state.currentTrick,
      this.state.trump,
    );
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
