// /api/replay/:id — partija za pregled ruku po ruku (replay.html). Ko sme
// da gleda (kao u privatnost.html): igraci te partije, za ligasku i
// clanovi lige, i admin sajta.

import { Router } from 'express';
import { get, getMatchById } from './db.js';
import type { MatchLogRow } from './db.js';
import { requireAuth } from './auth/middleware.js';
import type { AuthedRequest } from './auth/middleware.js';
import { getLeague, isLeagueMember } from './leagues.js';
import { handReplay } from './replayModel.js';
import type { HandSnapshot } from './rooms/RoomState.js';

const seatsOf = (m: MatchLogRow) => [m.player0_user_id, m.player1_user_id, m.player2_user_id];

export function canViewMatch(m: MatchLogRow, userId: number): boolean {
  if (seatsOf(m).includes(userId)) return true;
  if (m.league_id != null && isLeagueMember(m.league_id, userId)) return true;
  return !!get<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', [userId])?.is_admin;
}

export const replayRouter = Router();
replayRouter.use(requireAuth);

replayRouter.get('/:id', (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const m = Number.isInteger(id) ? getMatchById(id) : undefined;
  if (!m) { res.status(404).json({ error: 'Partija ne postoji.' }); return; }
  if (!canViewMatch(m, req.userId!)) {
    res.status(403).json({ error: 'Ovu partiju mogu da gledaju samo njeni igrači i članovi lige.' });
    return;
  }
  const league = m.league_id != null ? getLeague(m.league_id) : undefined;
  const hands = JSON.parse(m.hands_json || '[]') as HandSnapshot[];
  res.json({
    id: m.id,
    endedAt: `${m.ended_at.replace(' ', 'T')}Z`,
    reason: m.match_end_reason,
    rounds: m.rounds_played,
    names: [m.player0_name, m.player1_name, m.player2_name].map((n) => n ?? '?'),
    bots: seatsOf(m).map((u) => u === null),
    mySeat: seatsOf(m).indexOf(req.userId!),
    finalScores: JSON.parse(m.final_scores),
    league: league ? { id: league.id, name: league.name } : null,
    hands: hands.map(handReplay),
  });
});
