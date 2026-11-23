// Ruke iz igre protiv racunara (korisnikov zahtev 2026-11-23: "da analiziramo njihovu igru"): pregledac na kraju
// svake ruke javi zapis (isti kao za online partije, engine/src/handRecord.ts). Bez imena i IP adrese — samo
// nasumican broj posetioca. Server ne veruje klijentu: proverava oblik i velicinu, pa cuva samo poznata polja.

import type { HandSnapshot } from './handRecord.js';

const MATCH_ID_RE = /^[\w-]{8,40}$/;
const MAX_HAND_BYTES = 8000;
const MAX_ROUND = 500;

const isTriple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));

const isSeat = (value: unknown): boolean => value === 0 || value === 1 || value === 2;

export interface LocalHand {
  readonly matchId: string;
  readonly round: number;
  readonly final: boolean;
  readonly json: string;
}

/** Proveren zapis ruke ili null ako oblik nije dobar. */
export function cleanLocalHand(body: unknown): LocalHand | null {
  const input = body as { matchId?: unknown; final?: unknown; hand?: Record<string, unknown> } | null;
  const hand = input?.hand;
  if (typeof input?.matchId !== 'string' || !MATCH_ID_RE.test(input.matchId)) return null;
  if (hand === undefined || hand === null || typeof hand !== 'object') return null;
  const round = hand.round;
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 0 || round > MAX_ROUND) return null;
  if (!isTriple(hand.bulasAfter) || !isTriple(hand.supeDelta) || !isTriple(hand.tricksWon)) return null;
  if (typeof hand.declaredGame !== 'string' || hand.declaredGame.length > 20) return null;
  if (!isSeat(hand.declarer) || typeof hand.passed !== 'boolean') return null;
  if (!Array.isArray(hand.tricks) || hand.tricks.length > 10) return null;
  if (!Array.isArray(hand.bids) || hand.bids.length > 40) return null;
  if (!Array.isArray(hand.hands) || hand.hands.length !== 3) return null;
  const keep: readonly (keyof HandSnapshot)[] = [
    'round', 'declarer', 'declaredGame', 'caller', 'callee', 'followChoices', 'kontraLevel', 'passed',
    'bulasAfter', 'supeDelta', 'tricks', 'tricksWon', 'talon', 'dealer', 'bids', 'hands', 'discard',
    'kontraPlayer', 'claimedBy',
  ];
  const picked: Record<string, unknown> = {};
  for (const name of keep) if (name in hand) picked[name] = hand[name];
  const json = JSON.stringify(picked);
  if (json.length > MAX_HAND_BYTES) return null;
  return { matchId: input.matchId, round, final: input.final === true, json };
}
