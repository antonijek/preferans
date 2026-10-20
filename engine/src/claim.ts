// "Nosim sve stihove do kraja" (korisnikov zahtev 2026-10-20): da li igrac
// zaista nosi SVE preostale stihove, kako god ostali igrali? Racunar za
// stolom se slaze sa tvrdnjom samo ako je ovo tacno. Pretraga po stvarnim
// kartama: igrac koji tvrdi bira najbolji potez (postoji), ostali bilo koji
// dozvoljeni (za svaki) — cim jedan stih ode drugome, tvrdnja ne vazi.
// Tacna tvrdnja trazi celo stablo, pa bez skracivanja 8 aduta protiv
// bacanja nije stizalo do kraja: polozaj na pocetku stiha se pamti, a od
// karata koje su iste vrednosti (iz iste ruke, sve izmedju njih je vec
// odigrano) proverava se samo jedna. Kad bi pretraga bila preduga, odgovor je "ne".

import { RANK_VALUE } from './constants.js';
import { isCardLegal, trickWinner } from './trick.js';
import { isPlayerActive, nextActivePlayer } from './turnOrder.js';
import type { Card, GameState, Position, TrickCard } from './types.js';

/** Po jedna karta iz svake grupe karata iste vrednosti. */
function distinctChoices(legal: Card[], alive: Set<string>): Card[] {
  const out: Card[] = [];
  const sorted = legal
    .slice()
    .sort((a, b) => a.suit.localeCompare(b.suit) || RANK_VALUE[b.rank]! - RANK_VALUE[a.rank]!);
  // susedne u sortiranom nizu: izmedju njih nema mojih karata, pa je grupa lanac
  sorted.forEach((c, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.suit !== c.suit || aliveBetween(prev, c, alive)) out.push(c);
  });
  return out;
}

function aliveBetween(hi: Card, lo: Card, alive: Set<string>): boolean {
  for (const id of alive) {
    const [rank, suit] = [id.slice(0, -1), id.slice(-1)];
    const v = RANK_VALUE[rank]!;
    if (suit === hi.suit && v < RANK_VALUE[hi.rank]! && v > RANK_VALUE[lo.rank]!) return true;
  }
  return false;
}

export function claimIsCertain(state: GameState, player: Position, nodeLimit = 200_000): boolean {
  if (state.phase !== 'PLAYING' || state.currentTrick.length > 0) return false;
  if (!isPlayerActive(state, player)) return false;
  const trump = state.trump;
  const active = ([0, 1, 2] as Position[]).filter((p) => isPlayerActive(state, p));
  const nextOf = new Map(active.map((p) => [p, nextActivePlayer(state, p)]));
  const hands = new Map<Position, Card[]>(active.map((p) => [p, state.players[p]!.hand.slice()]));
  // karte koje jos nisu u zavrsenim stihovima (u rukama ili u tekucem stihu)
  const alive = new Set<string>(active.flatMap((p) => hands.get(p)!.map((c) => c.id)));
  const memo = new Map<string, boolean>();
  let nodes = 0;
  let aborted = false;

  const keyOf = (leader: Position) =>
    `${leader}|${active.map((p) => hands.get(p)!.map((c) => c.id).sort().join(',')).join('|')}`;

  // pocetak stiha: na redu je `leader`
  function fromTrickStart(leader: Position): boolean {
    if (hands.get(player)!.length === 0) return true;
    const key = keyOf(leader);
    const known = memo.get(key);
    if (known !== undefined) return known;
    const ok = playTrick(leader, []);
    if (!aborted) memo.set(key, ok);
    return ok;
  }

  // igra stiha: na redu je `actor`, u stihu je vec `trick`
  function playTrick(actor: Position, trick: TrickCard[]): boolean {
    if (aborted || ++nodes > nodeLimit) { aborted = true; return false; }
    if (trick.length === active.length) {
      if (trickWinner(trick, trump) !== player) return false;
      for (const tc of trick) alive.delete(tc.card.id);
      const ok = fromTrickStart(player);
      for (const tc of trick) alive.add(tc.card.id);
      return ok;
    }
    const hand = hands.get(actor)!;
    const legal = hand.filter((c) => isCardLegal(c, hand, trick, trump));
    if (legal.length === 0) return false;
    const mine = actor === player;
    for (const card of distinctChoices(legal, alive)) {
      hands.set(actor, hand.filter((c) => c !== card));
      const ok = playTrick(nextOf.get(actor)!, [...trick, { player: actor, card }]);
      hands.set(actor, hand);
      if (mine && ok) return true; // postoji moj potez koji nosi sve
      if (!mine && !ok) return false; // postoji odgovor koji mi uzme stih
    }
    return !mine;
  }

  const ok = fromTrickStart(state.currentPlayer);
  return ok && !aborted;
}
