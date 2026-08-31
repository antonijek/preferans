// SVI TIPOVI za Preferans engine
// Ovaj fajl definiše sve domenske tipove — ništa sem tipova.

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export type CardId = string;

export interface Card {
  id: CardId;
  suit: Suit;
  rank: Rank;
}

export type Position = 0 | 1 | 2;

export const POSITIONS: readonly Position[] = [0, 1, 2] as const;

export interface Player {
  id: string;
  name: string;
  position: Position;
  hand: Card[];
  tricksWon: number;
  stihi: Card[][];
  hasPassedBid: boolean;
  bidLevel: number;
  kontraLevel: ContraLevel | null;
  follows: FollowChoice | null;
  // RULES 3.4: igrac sme reci "Igra" SAMO ako mu je to prvi potez u licitaciji
  // ove runde. Cim odigra bilo sta drugo (broj ili "dalje") na svom PRVOM
  // potezu, trajno gubi pravo na "Igra" do kraja te runde (uzivo prijavljen
  // bag — ranije je "Igra" ostajala ponudjena tokom cele licitacije).
  igraEligible: boolean;
}

export type FollowChoice = 'DODJEM' | 'NE_DODJEM';

export type ContraLevel = 'KONTRA' | 'REKONTRA' | 'SUBKONTRA' | 'MORTKONTRA';

export type Game =
  | 'Pik' | 'Karo' | 'Herc' | 'Tref' | 'Betl' | 'Sans'
  | 'Igra-Pik' | 'Igra-Karo' | 'Igra-Herc' | 'Igra-Tref' | 'Igra-Betl' | 'Igra-Sans';

export type StandardGame = Exclude<Game, `Igra-${string}`>;
export type IgraGame = Extract<Game, `Igra-${string}`>;
export type TrumpGame = Exclude<Game, 'Betl' | 'Sans' | 'Igra-Betl' | 'Igra-Sans'>;
export type NoTrumpGame = 'Betl' | 'Sans' | 'Igra-Betl' | 'Igra-Sans';

// Legalne akcije koje UI moze da prikaze
export type LegalAction =
  | { type: 'pass'; player: Position; label: string }
  | { type: 'bid'; player: Position; value: number; label: string }
  | { type: 'mogu'; player: Position; value: number; label: string }
  | { type: 'igra'; player: Position; label: string }
  | { type: 'discard-info'; player: Position; handSize: number; label: string }
  | { type: 'declare'; player: Position; game: Game; label: string }
  | { type: 'follow'; player: Position; choice: 'DODJEM' | 'NE_DODJEM'; label: string }
  | { type: 'call'; player: Position; callee: Position; label: string }
  | { type: 'continueWithoutCall'; player: Position; label: string }
  | { type: 'kontra'; player: Position; level: ContraLevel; label: string }
  | { type: 'moze'; player: Position; label: string }
  | { type: 'playCard'; player: Position; cardId: string; label: string };

export type GamePhase =
  | 'WAITING'
  | 'DEALING'
  | 'BIDDING'
  | 'TAKING_TALON'
  | 'DISCARDING'
  | 'DECLARING'
  | 'FOLLOW_DECLARING'
  | 'KONTRA_DECLARING'
  | 'PLAYING'
  | 'TRICK_RESULT'
  | 'SCORING'
  | 'REFE'
  | 'GAME_OVER'
  // Kraj CELE partije (RULES 9.1: "partija traje dok zbir bula svih igrača
  // ne postane 0"), ne samo jedne ruke — razlikuje se od GAME_OVER (koji
  // engine koristi za kraj SVAKE pojedinačne ruke, partija se inače
  // nastavlja sledećom rukom). Postavlja se u endHand() kad zbir bula
  // dostigne 0 (posle eventualnog capovanja ruke, vidi capHandToMatchEnd()).
  | 'MATCH_OVER';

export interface BidAction {
  type: 'BID';
  player: Position;
  value: number;
}

export interface PassAction {
  type: 'PASS';
  player: Position;
}

export interface MoguAction {
  type: 'MOGU';
  player: Position;
  value: number;
}

export interface IgraAction {
  type: 'IGRA';
  player: Position;
  game: Game;
}

export interface DeclareGameAction {
  type: 'DECLARE_GAME';
  player: Position;
  game: Game;
}

export interface FollowAction {
  type: 'FOLLOW';
  player: Position;
  follows: FollowChoice;
}

export interface CallAction {
  type: 'CALL';
  player: Position;
}

export interface KontraAction {
  type: 'KONTRA';
  player: Position;
  level: ContraLevel;
}

export interface MozeAction {
  type: 'MOZE';
  player: Position;
}

export interface DiscardAction {
  type: 'DISCARD';
  player: Position;
  cardIds: [CardId, CardId];
}

export interface PlayCardAction {
  type: 'PLAY_CARD';
  player: Position;
  cardId: CardId;
}

export type Action =
  | BidAction | PassAction | MoguAction | IgraAction
  | DeclareGameAction | FollowAction | CallAction
  | KontraAction | MozeAction | DiscardAction | PlayCardAction;

export interface BidRecord {
  player: Position;
  type: 'BID' | 'PASS' | 'MOGU' | 'IGRA';
  value?: number;
  game?: Game;
  mogu?: boolean;
}

export interface TrickCard {
  player: Position;
  card: Card;
}

export interface GameState {
  phase: GamePhase;
  round: number;
  dealer: Position;
  players: [Player, Player, Player];
  currentPlayer: Position;
  currentBidder: Position;
  currentBid: number;
  bids: BidRecord[];
  winner: Position | null;
  winnerGame: Game | null;
  bidStartPlayer: Position;
  declaredGame: Game | null;
  trump: Suit | null;
  talon: Card[];
  // Snimak talona u trenutku uzimanja (RULES: vidljivo dok nosilac ne
  // proglasi igru) — `talon` se prazni cim ga nosilac uzme u ruku, ovo polje
  // pamti koje su to karte bile do sledece podele.
  lastTalon: Card[];
  discard: Card[];
  currentTrick: TrickCard[];
  tricks: TrickCard[][];
  trickCount: number;
  followChoices: (FollowChoice | null)[];
  caller: Position | null;
  callee: Position | null;
  kontraPlayer: Position | null;
  kontraLevel: ContraLevel | null;
  mozeCount: number;
  refeOccurred: boolean;
  igraPlayer: Position | null;
  scores: [number, number, number];
  bulas: [number, number, number];
  // RULES 7 — refe budžet po igraču. refeCount = koliko je SVAKI igrač VEĆ
  // POTROŠIO (iskorišćeno), max refePerPlayer. refePending = koliko refa
  // ima "na raspolaganju" (dodeljeno kad "svi dalje" ili "Pik bez kontre"
  // trigeruje refe, ALI JOŠ NIJE potrošeno) — dodeljuje se SVA TRI igrača
  // odjednom (ne samo budućem nosiocu), a svaki ga troši SAM tek kad on
  // lično sledeći put postane nosilac neke ruke (ne mora biti odmah sledeća
  // ruka za onog ko ga ne potroši prvi). Potvrđeno direktno od korisnika.
  refeCount: [number, number, number];
  refePending: [number, number, number];
  // RULES 3.4.1 — kad VIŠE igrača kaže "Igra", svako mora proglasiti SVOJU
  // igru pre nego što se odredi pobednik (najjača igra pobeđuje; kod
  // izjednačenja pobeđuje prvi koji je rekao "Igra"). igraCompetitors je
  // redosled prijave (null van ovog tiebreak toka — uobičajen slučaj gde je
  // samo JEDAN igrač rekao Igra ne prolazi kroz ovo, vidi checkBiddingEnd).
  // igraDeclarations čuva proglašenu igru svakog dok svi ne prijave.
  igraCompetitors: Position[] | null;
  igraDeclarations: Partial<Record<Position, Game>>;
  lastHandResult: EndOfHandResult | null;
}

export interface ScoreUpdate {
  bulas: [number, number, number];
  supeDelta: [number, number, number];
  refeConsumed?: Position;
}

export interface EndOfHandResult {
  bulas: [number, number, number];
  supeDelta: [number, number, number];
  passed: boolean;
  winner: Position | null;
  winnerGame: Game | null;
  kontraLevel: ContraLevel | null;
  refeConsumed: Position | null;
  refeActive: boolean;
  bulasAfter: [number, number, number];
}

export function createEmptyPlayer(id: string, name: string, position: Position): Player {
  return {
    id,
    name,
    position,
    hand: [],
    tricksWon: 0,
    stihi: [],
    hasPassedBid: false,
    bidLevel: 0,
    kontraLevel: null,
    follows: null,
    igraEligible: true,
  };
}
