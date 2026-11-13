// Partije koje su počele a nisu završene (korisnikov zahtev 2026-11-12): admin vidi kad je sto zatvoren pre
// kraja meča, ko je sedeo, na kojoj buli i zašto, pa može da pita igrače šta je bio problem.
// Ne ide u match_log: statistika, lige i mesečna lista čitaju samo završene partije.

import { all, run } from './db.js';
import type { RoomState } from './rooms/RoomState.js';

export interface UnfinishedRecord {
  room_code: string;
  reason: string;
  rounds_played: number;
  phase: string;
  had_bots: number;
  names: (string | null)[];
  user_ids: (number | null)[];
  bulas: number[];
  started_at: string;
  last_activity_at: string;
}

const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

/** Da li je za stolom meč u toku (počela je igra, a meč nije završen)? */
export function isStartedUnfinished(room: RoomState): boolean {
  const phase = room.game.state.phase;
  if (phase === 'MATCH_OVER') return false;
  return phase !== 'WAITING' || room.handsHistory.length > 0;
}

export function describeUnfinished(room: RoomState, reason: string): UnfinishedRecord {
  return {
    room_code: room.code,
    reason,
    rounds_played: room.handsHistory.length,
    phase: room.game.state.phase,
    had_bots: room.hadBots ? 1 : 0,
    names: [...room.seatNames],
    user_ids: [...room.seatUserIds],
    bulas: [...room.game.state.bulas],
    started_at: iso(room.createdAt),
    last_activity_at: iso(room.lastActivityAt),
  };
}

/** Upisuje sto koji se zatvara pre kraja meča. Greška upisa ne sme da zaustavi zatvaranje stola. */
export function recordUnfinished(room: RoomState, reason: string): void {
  if (!isStartedUnfinished(room)) return;
  try {
    const r = describeUnfinished(room, reason);
    run(
      `INSERT INTO unfinished_matches (room_code, reason, rounds_played, phase, had_bots, names_json, user_ids_json,
         bulas_json, started_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.room_code, r.reason, r.rounds_played, r.phase, r.had_bots, JSON.stringify(r.names),
        JSON.stringify(r.user_ids), JSON.stringify(r.bulas), r.started_at, r.last_activity_at],
    );
  } catch (e) {
    console.error('[unfinished] upis nije uspeo:', e);
  }
}

interface Row {
  id: number; room_code: string; closed_at: string; reason: string; rounds_played: number; phase: string;
  had_bots: number; names_json: string; user_ids_json: string; bulas_json: string; started_at: string;
  last_activity_at: string;
}

export function listUnfinished(limit: number) {
  return all<Row>('SELECT * FROM unfinished_matches ORDER BY id DESC LIMIT ?', [limit]).map((r) => ({
    id: r.id, roomCode: r.room_code, closedAt: r.closed_at, reason: r.reason, roundsPlayed: r.rounds_played,
    phase: r.phase, hadBots: r.had_bots === 1, names: JSON.parse(r.names_json) as (string | null)[],
    userIds: JSON.parse(r.user_ids_json) as (number | null)[], bulas: JSON.parse(r.bulas_json) as number[],
    startedAt: r.started_at, lastActivityAt: r.last_activity_at,
  }));
}
