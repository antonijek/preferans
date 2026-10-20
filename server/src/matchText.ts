// Partija iz match_log kao tekst, ruku po ruku — za analizu gresaka AI-ja
// (korisnikov zahtev 2026-10-20). Cista funkcija; ispis pravi
// tools/printMatch.ts. Stariji zapisi (pre 2026-10-20) nemaju pocetne ruke
// ni licitaciju — tad se ispisuje samo ono sto postoji.

import type { Position } from '../../engine/dist/types.js';
import { bidLabel, trickWinners } from './replayModel.js';
import type { HandSnapshot } from './rooms/RoomState.js';

export interface MatchRow {
  id: number;
  room_code: string;
  ended_at: string;
  match_end_reason: string;
  rounds_played: number;
  names: [string, string, string];
  final_scores: number[];
  hands: HandSnapshot[];
}

type PlainCard = { suit: string; rank: string };

const SUIT_ORDER = ['♣', '♥', '♠', '♦']; // isto kao ruka u igri (app.js HAND_SUIT_ORDER)
const RANK_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
const card = (c: PlainCard) => `${c.rank}${c.suit}`;

export function formatHand(cards: PlainCard[]): string {
  return SUIT_ORDER.map((s) => {
    const ranks = cards.filter((c) => c.suit === s).map((c) => c.rank)
      .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
    return ranks.length ? `${s} ${ranks.join(' ')}` : `${s} —`;
  }).join('   ');
}

export function matchToText(m: MatchRow): string {
  const who = (p: number) => m.names[p] ?? `#${p}`;
  const out: string[] = [];
  out.push(`Partija #${m.id} (soba ${m.room_code}) — završena ${m.ended_at}, ${m.match_end_reason}, ${m.rounds_played} ruku`);
  out.push(`Igrači: 0=${who(0)}  1=${who(1)}  2=${who(2)}   skor na kraju: ${m.final_scores.join(' / ')}`);
  m.hands.forEach((h, i) => {
    out.push('');
    const kontra = h.kontraLevel ? ` (${h.kontraLevel})` : '';
    out.push(`=== Ruka ${i + 1} (runda ${h.round}) — nosilac ${who(h.declarer)}: ${h.declaredGame || '?'}${kontra} — ${h.passed ? 'PROŠAO' : 'PAO'}`);
    if (h.dealer !== undefined) out.push(`Delilac: ${who(h.dealer)}`);
    if (h.hands) for (const p of [0, 1, 2]) out.push(`  ${who(p).padEnd(14)} ${formatHand(h.hands[p] ?? [])}`);
    out.push(`  Talon: ${h.talon.map(card).join(' ') || '—'}${h.discard?.length ? `   Škart: ${h.discard.map(card).join(' ')}` : ''}`);
    if (h.bids) out.push(`  Licitacija: ${h.bids.map((b) => `${who(b.player)} ${bidLabel(b)}`).join(', ') || '—'}`);
    const follow = h.followChoices.map((f, p) => (f ? `${who(p)} ${f}` : null)).filter(Boolean);
    if (follow.length) out.push(`  Pratnja: ${follow.join(', ')}`);
    if (h.caller !== null) out.push(`  Poziv: ${who(h.caller)} → ${h.callee !== null ? who(h.callee) : 'niko'}`);
    const winners = trickWinners(h);
    h.tricks.forEach((t, k) => {
      const w = winners[k] ?? null;
      out.push(`  ${String(k + 1).padStart(2)}. ${t.map((c) => `${who(c.position)} ${card(c)}`).join(', ')}${w !== null ? `  → ${who(w as Position)}` : ''}`);
    });
    out.push(`  Štihova: ${[0, 1, 2].map((p) => `${who(p)} ${h.tricksWon[p]}`).join(', ')}   bule posle: ${h.bulasAfter.join(' / ')}   supe Δ: ${h.supeDelta.join(' / ')}`);
  });
  return out.join('\n');
}
