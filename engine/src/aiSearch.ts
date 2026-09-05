// Monte Carlo determinizacija ("Perfect Information Monte Carlo") pretraga
// za AI odluke — vidi plan "toasty-rolling-sparkle" (2026-09-05).
//
// Umesto da AI direktno bira potez po fiksnoj heuristici (ai.ts), za svaki
// kandidat-potez se uzorkuje N moguxih (ali VEROVATNIH, u skladu sa javnim
// znanjem) rasporeda tudjih karata, ceo ostatak ruke se odigra heuristicki
// (aiAutoplay.ts) do kraja, i bira se kandidat sa najboljim prosecnim
// stvarnim rezultatom (racuna ga sam engine — endHand() — ne izmisljena
// "procena pozicije").
import { Game } from './game.js';
import { makeDeck, shuffle } from './deck.js';
import { applyHeuristicTurn } from './aiAutoplay.js';
import type { Card, GameState, Position, Suit } from './types.js';

export type Rng = () => number;

// === Void-boja inferencija ===
// Za svako sedište, koje boje (ukljucujuci adut-po-inferenciji) je TA osoba
// dokazano prazna, na osnovu odigranih stihova OVE ruke (nije pratila boju
// -> prazna u toj boji; ako ni adutom nije udarila -> prazna i u adutu).
export function computeVoidSuits(state: GameState): [Set<Suit>, Set<Suit>, Set<Suit>] {
  const voidSuits: [Set<Suit>, Set<Suit>, Set<Suit>] = [new Set(), new Set(), new Set()];
  const tricks = state.currentTrick.length > 0 ? [...state.tricks, state.currentTrick] : state.tricks;
  for (const trick of tricks) {
    if (trick.length === 0) continue;
    const leadSuit = trick[0]!.card.suit;
    for (const { player, card } of trick) {
      if (card.suit !== leadSuit) {
        voidSuits[player].add(leadSuit);
        if (state.trump !== null && card.suit !== state.trump) {
          voidSuits[player].add(state.trump);
        }
      }
    }
  }
  return voidSuits;
}

type Bucket = { seat: Position | null; capacity: number; cards: Card[]; voidSuits: Set<Suit> };

/**
 * Uzorkuje JEDAN potpun, plauzibilan raspored skrivenih karata sa tacke
 * gledista `perspective`, konzistentan sa svim javno poznatim (licitacija,
 * odigrani stihovi, uzet talon) — vraca NOVI GameState (original se ne
 * dira). Nikad ne cita STVARNI identitet `state.discard` kad
 * `perspective` nije nosilac (to bi bio "cheat" — pravi pratilac to nikad
 * ne bi znao) — koristi se samo duzina kao kapacitet "mrtve" kutije.
 */
export function determinize(state: GameState, perspective: Position, rng: Rng): GameState {
  const clone: GameState = structuredClone(state);
  const myHandIds = new Set(clone.players[perspective]!.hand.map((c) => c.id));
  const playedIds = new Set<string>();
  for (const trick of clone.tricks) for (const tc of trick) playedIds.add(tc.card.id);
  for (const tc of clone.currentTrick) playedIds.add(tc.card.id);

  const isDeclarer = clone.winner !== null && perspective === clone.winner;
  // Talon se sme citati po identitetu SAMO dok jos nije uzet (state.talon
  // popunjen) — u tom trenutku niko (ni buduci nosilac) jos nije video te
  // karte, pa to nije "cheat", vec zajednicko nepoznato. lastTalon (VEC
  // uzet) je javno vidljivo svima (renderovano u UI), pa se i ono sme citati
  // po identitetu — ali NE ide u opsti pool, vec se "pribada" (videti nize).
  const discardKnownToMe = isDeclarer; // sopstveni odbacaj — nosilac ga zna

  const excludeIds = new Set<string>([...myHandIds, ...playedIds]);
  if (discardKnownToMe) {
    for (const c of clone.discard) excludeIds.add(c.id);
  }
  const pool = makeDeck().filter((c) => !excludeIds.has(c.id));

  // --- Kofe (buckets) — kapacitet izveden iz STVARNIH (javno vidljivih)
  // velicina ruku/talona/odbacaja, ne iz pretpostavki o fazi. ---
  const buckets: Bucket[] = [];
  const voidSuits = computeVoidSuits(clone);
  const otherSeats = ([0, 1, 2] as Position[]).filter((p) => p !== perspective);
  for (const seat of otherSeats) {
    buckets.push({
      seat,
      capacity: clone.players[seat]!.hand.length,
      cards: [],
      voidSuits: voidSuits[seat],
    });
  }
  let talonBucket: Bucket | null = null;
  if (clone.talon.length > 0) {
    // Talon jos nije uzet — niko (ni ja) ga nije video, ide u pool ravnopravno
    // (vec je u pool-u preko makeDeck() filtera iznad), samo mu treba kofa.
    talonBucket = { seat: null, capacity: clone.talon.length, cards: [], voidSuits: new Set() };
    buckets.push(talonBucket);
  }
  let deadBucket: Bucket | null = null;
  if (!discardKnownToMe && clone.discard.length > 0) {
    deadBucket = { seat: null, capacity: clone.discard.length, cards: [], voidSuits: new Set() };
    buckets.push(deadBucket);
  }

  const totalCapacity = buckets.reduce((sum, b) => sum + b.capacity, 0);
  if (totalCapacity !== pool.length) {
    throw new Error(
      `aiSearch.determinize: kapacitet kofa (${totalCapacity}) != velicina pool-a (${pool.length}) — ` +
      `neocekivano stanje igre za determinizaciju (phase=${clone.phase})`
    );
  }

  // --- lastTalon "pribadanje" + konstruktivna raspodela — u posebnoj
  // funkciji jer se ceo pokusaj ponekad mora ponoviti (vidi dole). ---
  const declarerBucket = buckets.find((b) => b.seat === clone.winner) ?? null;
  const pinTargets = [declarerBucket, deadBucket].filter((b): b is Bucket => b !== null);
  const shouldPinTalon = !isDeclarer && clone.lastTalon.length > 0 && clone.winner !== null;

  function attemptAssignment(): boolean {
    for (const b of buckets) b.cards = [];
    const shuffled = shuffle(pool, rng);
    const remaining: Card[] = [];
    if (shouldPinTalon && pinTargets.length > 0) {
      for (const card of shuffled) {
        const isPinned = clone.lastTalon.some((t) => t.id === card.id);
        if (isPinned) {
          const eligible = pinTargets.filter((b) => b.capacity > b.cards.length);
          if (eligible.length === 0) return false;
          const target = eligible[Math.floor(rng() * eligible.length)]!;
          target.cards.push(card);
        } else {
          remaining.push(card);
        }
      }
    } else {
      remaining.push(...shuffled);
    }

    // Najpre najogranicenije karte (void za najvise kofa) — pohlepna dodela
    // bez ovoga moze "zaglaviti" ograniceniju kartu bez slobodne kofe iako
    // globalno resenje postoji (nasumican redosled popuni slobodne kofe
    // necim sto je moglo otici igde, ostavljajuci samo void-sukobljenu kofu
    // za kasniju, ogranicenu kartu). Ovo je heuristika ("most constrained
    // first"), ne formalni dokaz izvodljivosti — otud i retry ispod.
    remaining.sort((a, b) => {
      const constraintsFor = (c: Card) => buckets.filter((bk) => bk.voidSuits.has(c.suit)).length;
      return constraintsFor(b) - constraintsFor(a);
    });

    for (const card of remaining) {
      const eligible = buckets.filter(
        (b) => b.capacity > b.cards.length && !b.voidSuits.has(card.suit),
      );
      if (eligible.length === 0) return false;
      const target = eligible[Math.floor(rng() * eligible.length)]!;
      target.cards.push(card);
    }
    return true;
  }

  const MAX_ATTEMPTS = 25;
  let succeeded = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attemptAssignment()) { succeeded = true; break; }
  }
  if (!succeeded) {
    throw new Error(
      `aiSearch.determinize: nije uspelo da rasporedi karte posle ${MAX_ATTEMPTS} pokusaja — ` +
      `void-ograničenja su preterano striktna ili je stanje nekonzistentno (phase=${clone.phase})`
    );
  }

  for (const b of buckets) {
    if (b.seat !== null) clone.players[b.seat]!.hand = b.cards;
  }
  if (talonBucket) clone.talon = talonBucket.cards;
  // deadBucket (pretpostavljeni odbacaj) se namerno nigde ne upisuje — te
  // karte su prosto "van igre" iz perspektive ovog uzorka.

  return clone;
}

/**
 * Vozi `game` kroz applyHeuristicTurn() dok ne stigne do stvarnog,
 * OBRACUNATOG kraja ruke (GAME_OVER/MATCH_OVER sa lastHandResult) — vraca
 * true — ili se detektuje da je ruka u medjuvremenu PONISTENA
 * (handleRefe/handleUnplayedHand interno pozvali newHand(), ili je
 * zavrsila bez ikakvog bodovanja jer je neko vec bio u seširu) — vraca
 * false, sto scoreCandidate tretira kao nagradu 0 (RULES-potvrdjeno: te
 * grane ne menjaju bule/supe).
 *
 * Detekcija ponistene ruke koristi ISTI trik kao app.js-ov handGeneration:
 * monkey-patch na `game.newHand` (interni pozivi iz handleRefe()/
 * handleUnplayedHand() koriste this.newHand(...), sto JS razresava na OWN
 * property override pre prototype metode).
 */
export function autoPlayToHandEnd(game: Game, rng: Rng, maxSteps = 60): boolean {
  let dealGeneration = 0;
  const originalNewHand = game.newHand.bind(game);
  (game as unknown as { newHand: typeof game.newHand }).newHand = ((...args: Parameters<Game['newHand']>) => {
    dealGeneration++;
    return originalNewHand(...args);
  }) as Game['newHand'];
  void rng; // rezervisano za buduce koriscenje (npr. seedovanje scratch-a), vidi plan §8.4

  let steps = 0;
  while (steps++ < maxSteps) {
    const phase = game.state.phase;
    if (phase === 'GAME_OVER' || phase === 'MATCH_OVER') {
      return game.state.lastHandResult !== null;
    }
    const startGen = dealGeneration;
    const result = applyHeuristicTurn(game);
    if (dealGeneration !== startGen) return false; // ruka ponistena usred poteza
    if (result === 'no_actor') return false; // neocekivano zaglavljivanje — tretiraj kao neobracunato
  }
  return false; // maxSteps probijen — bezbednosna kocnica, ne veruj rezultatu
}

/**
 * Jezgro pretrage: za DATOG kandidata (primenjuje se preko `applyCandidate`
 * na svaki uzorak), pokreni `samples` determinizovanih rollout-a i vrati
 * prosecnu nagradu za `perspective` (vise je bolje). Nagrada = stvarna
 * promena bule (negirana, jer manje/negativnije bule = uspesnija partija po
 * RULES 9.1) + supe zaradjene ovom rukom — ista formula kao postojeci
 * match-ranking racun u app.js, ne izmisljena nova metrika.
 */
export function scoreCandidate(args: {
  realState: GameState;
  perspective: Position;
  applyCandidate: (g: Game) => boolean;
  samples: number;
  rng: Rng;
}): number {
  const { realState, perspective, applyCandidate, samples, rng } = args;
  const preHandBula = realState.bulas[perspective];
  let total = 0;
  let counted = 0;
  for (let i = 0; i < samples; i++) {
    const sampledState = determinize(realState, perspective, rng);
    const g = new Game();
    g.state = sampledState;
    if (!applyCandidate(g)) continue; // kandidat bi trebalo da je uvek legalan; preskoci ako nije
    counted++;
    const ended = autoPlayToHandEnd(g, rng);
    if (ended && g.state.lastHandResult) {
      const r = g.state.lastHandResult;
      total += -(r.bulas[perspective] - preHandBula) + r.supeDelta[perspective];
    }
    // else: ponistena/neobracunata ruka -> doprinos 0, ali JOS UVEK broji se
    // u `counted` (uzorak je "ispitan", samo je ishod bio neutralan).
  }
  if (counted === 0) return 0;
  return total / counted;
}
