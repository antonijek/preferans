// Zatvorene lige (korisnikov zahtev 2026-10-14, posle poredjenja sa
// konkurencijom i povratne informacije igraca iz Lora grupa): grupa igraca
// koja u zadatom periodu igra partije medjusobno i vodi tabelu.
//
//  - liga je ZATVORENA: ulazi se samo pozivnim kodom/linkom, admin lige
//    moze da ukloni igraca i da postavi druge admine;
//  - admin bira trajanje, normu (najmanji broj partija za plasman),
//    bodovanje i poredak — 10-6-3-1 iz Lore ne vazi za 3 igraca, pa su
//    bodovi po mestu podesivi (predlog 10-5-1), ili zbir rezultata;
//  - nova liga moze da prekopira sve igrace (i admine) iz prethodne — da
//    admini ne ubacuju 150-200 igraca rucno svakih 25 dana;
//  - ligaska partija: samo clanovi lige sedaju, racunar ne igra; tabela se
//    racuna iz match_log (league_id).

import { Router } from 'express';
import { all, get, run } from './db.js';
import { requireAuth } from './auth/middleware.js';
import type { AuthedRequest } from './auth/middleware.js';
import { computeStandings, MIN_HANDS_FOR_EARLY_END } from './leagueStandings.js';
import type { LeagueRankBy, LeagueScoring, StandingRow } from './leagueStandings.js';

export interface LeagueRow {
  id: number;
  code: string;
  name: string;
  created_by: number;
  starts_at: string;
  ends_at: string;
  norma: number;
  scoring_json: string;
  rank_by: LeagueRankBy;
  initial_bule: number;
  refe_per_player: number;
  turn_seconds: number;
  created_at: string;
}

export type LeagueStatus = 'upcoming' | 'active' | 'finished';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_LEAGUES_PER_CREATOR = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function newCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (get('SELECT 1 AS x FROM leagues WHERE code = ?', [code]));
  return code;
}

export function getLeague(id: number): LeagueRow | undefined {
  return get<LeagueRow>('SELECT * FROM leagues WHERE id = ?', [id]);
}

export function leagueStatus(l: LeagueRow, now = Date.now()): LeagueStatus {
  if (now < Date.parse(l.starts_at)) return 'upcoming';
  if (now >= Date.parse(l.ends_at)) return 'finished';
  return 'active';
}

export function isLeagueMember(leagueId: number, userId: number): boolean {
  return !!get('SELECT 1 AS x FROM league_members WHERE league_id = ? AND user_id = ?', [leagueId, userId]);
}

export function isLeagueAdmin(leagueId: number, userId: number): boolean {
  return !!get('SELECT 1 AS x FROM league_members WHERE league_id = ? AND user_id = ? AND is_admin = 1', [leagueId, userId]);
}

function scoringOf(l: LeagueRow): LeagueScoring {
  try {
    const s = JSON.parse(l.scoring_json) as LeagueScoring;
    if (s.mode === 'result') return s;
    if (s.mode === 'places' && Array.isArray(s.points) && s.points.length === 3) return s;
  } catch (e) {
    console.error(`[leagues] pokvaren scoring_json lige ${l.id}, koristim 10-5-1:`, e);
  }
  return { mode: 'places', points: [10, 5, 1] };
}

function intIn(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Proverava i pravi ligu. Vraca ligu ili poruku greske za korisnika. */
export function createLeague(userId: number, body: Record<string, unknown>): LeagueRow | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 3 || name.length > 40) return { error: 'Naziv lige mora imati od 3 do 40 znakova.' };
  const startsAt = Date.parse(String(body.startsAt ?? ''));
  const now = Date.now();
  if (!Number.isFinite(startsAt) || startsAt < now - 2 * DAY_MS || startsAt > now + 60 * DAY_MS) {
    return { error: 'Početak lige mora biti između danas i 60 dana unapred.' };
  }
  const days = intIn(body.days, 1, 90);
  if (days === null) return { error: 'Trajanje lige: od 1 do 90 dana.' };
  const norma = intIn(body.norma, 0, 500);
  if (norma === null) return { error: 'Norma: od 0 do 500 partija.' };
  let scoring: LeagueScoring;
  if (body.scoringMode === 'result') {
    scoring = { mode: 'result' };
  } else {
    const pts = Array.isArray(body.points) ? body.points.map((p) => intIn(p, 0, 100)) : [];
    if (pts.length !== 3 || pts.some((p) => p === null)) return { error: 'Bodovi za 1., 2. i 3. mesto: celi brojevi od 0 do 100.' };
    const [a, b, c] = pts as number[];
    if (!(a! >= b! && b! >= c!)) return { error: 'Bodovi moraju da opadaju: 1. mesto ≥ 2. mesto ≥ 3. mesto.' };
    scoring = { mode: 'places', points: [a!, b!, c!] };
  }
  const rankBy = body.rankBy === 'avg' ? 'avg' : 'total';
  const initialBule = intIn(body.initialBule, 50, 300) ?? 100;
  const refeMax = Math.max(1, Math.min(5, Math.round(initialBule / 50)));
  const refe = intIn(body.refePerPlayer, 0, refeMax) ?? Math.min(2, refeMax);
  const turnSeconds = [0, 15, 30, 60].includes(Number(body.turnSeconds)) ? Number(body.turnSeconds) : 30;

  const owned = get<{ c: number }>('SELECT COUNT(*) AS c FROM leagues WHERE created_by = ?', [userId])?.c ?? 0;
  if (owned >= MAX_LEAGUES_PER_CREATOR) return { error: `Možeš napraviti najviše ${MAX_LEAGUES_PER_CREATOR} liga.` };

  const copyFrom = body.copyFromLeagueId != null ? Number(body.copyFromLeagueId) : null;
  if (copyFrom !== null && !isLeagueAdmin(copyFrom, userId)) {
    return { error: 'Igrače možeš prekopirati samo iz lige u kojoj si admin.' };
  }

  const code = newCode();
  run(
    `INSERT INTO leagues (code, name, created_by, starts_at, ends_at, norma, scoring_json, rank_by,
       initial_bule, refe_per_player, turn_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, name, userId, new Date(startsAt).toISOString(), new Date(startsAt + days * DAY_MS).toISOString(),
      norma, JSON.stringify(scoring), rankBy, initialBule, refe, turnSeconds]
  );
  const league = get<LeagueRow>('SELECT * FROM leagues WHERE code = ?', [code])!;
  run('INSERT INTO league_members (league_id, user_id, is_admin) VALUES (?, ?, 1)', [league.id, userId]);
  if (copyFrom !== null) {
    // svi igraci i admini prethodne lige — jednim klikom
    run(
      `INSERT OR IGNORE INTO league_members (league_id, user_id, is_admin)
       SELECT ?, user_id, is_admin FROM league_members WHERE league_id = ?`,
      [league.id, copyFrom]
    );
  }
  return league;
}

export function joinLeagueByCode(userId: number, code: unknown): LeagueRow | { error: string } {
  const league = typeof code === 'string' ? get<LeagueRow>('SELECT * FROM leagues WHERE code = ?', [code.trim().toUpperCase()]) : undefined;
  if (!league) return { error: 'Liga sa tim kodom ne postoji.' };
  if (leagueStatus(league) === 'finished') return { error: 'Ova liga je završena.' };
  run('INSERT OR IGNORE INTO league_members (league_id, user_id, is_admin) VALUES (?, ?, 0)', [league.id, userId]);
  return league;
}

interface MemberRow { user_id: number; name: string | null; email: string; is_admin: number }

function leagueMembers(leagueId: number): MemberRow[] {
  return all<MemberRow>(
    `SELECT m.user_id, u.name, u.email, m.is_admin FROM league_members m JOIN users u ON u.id = m.user_id
     WHERE m.league_id = ? ORDER BY m.joined_at`,
    [leagueId]
  );
}

interface MatchLogLeagueRow {
  id: number;
  player0_user_id: number | null;
  player1_user_id: number | null;
  player2_user_id: number | null;
  final_scores: string;
  match_end_reason: string;
  rounds_played: number;
}

export function leagueStandings(l: LeagueRow): StandingRow[] {
  const members = leagueMembers(l.id).map((m) => ({ userId: m.user_id, name: m.name || m.email }));
  const rows = all<MatchLogLeagueRow>(
    `SELECT id, player0_user_id, player1_user_id, player2_user_id, final_scores, match_end_reason, rounds_played
     FROM match_log WHERE league_id = ?`,
    [l.id]
  );
  const matches = [];
  for (const m of rows) {
    let finalScores: number[];
    try {
      finalScores = JSON.parse(m.final_scores);
    } catch (e) {
      console.error(`[leagues] pokvaren final_scores u match_log ${m.id}, partija preskocena:`, e);
      continue;
    }
    matches.push({
      userIds: [m.player0_user_id, m.player1_user_id, m.player2_user_id] as [number | null, number | null, number | null],
      finalScores,
      endReason: m.match_end_reason,
      roundsPlayed: m.rounds_played,
    });
  }
  return computeStandings(members, matches, { scoring: scoringOf(l), norma: l.norma, rankBy: l.rank_by });
}

function publicLeague(l: LeagueRow) {
  return {
    id: l.id,
    code: l.code,
    name: l.name,
    status: leagueStatus(l),
    startsAt: l.starts_at,
    endsAt: l.ends_at,
    norma: l.norma,
    scoring: scoringOf(l),
    rankBy: l.rank_by,
    initialBule: l.initial_bule,
    refePerPlayer: l.refe_per_player,
    turnSeconds: l.turn_seconds,
    minHandsEarlyEnd: MIN_HANDS_FOR_EARLY_END,
    members: get<{ c: number }>('SELECT COUNT(*) AS c FROM league_members WHERE league_id = ?', [l.id])?.c ?? 0,
  };
}

export const leaguesRouter = Router();
leaguesRouter.use(requireAuth);

// moje lige (clan ili admin), najnovije prve
leaguesRouter.get('/', (req: AuthedRequest, res) => {
  const rows = all<LeagueRow & { is_admin: number }>(
    `SELECT l.*, m.is_admin FROM leagues l JOIN league_members m ON m.league_id = l.id
     WHERE m.user_id = ? ORDER BY l.starts_at DESC`,
    [req.userId!]
  );
  res.json({
    leagues: rows.map((l) => ({ ...publicLeague(l), isAdmin: !!l.is_admin })),
    minHandsEarlyEnd: MIN_HANDS_FOR_EARLY_END,
  });
});

leaguesRouter.post('/', (req: AuthedRequest, res) => {
  const out = createLeague(req.userId!, req.body ?? {});
  if ('error' in out) { res.status(400).json(out); return; }
  res.json({ league: publicLeague(out) });
});

leaguesRouter.post('/join', (req: AuthedRequest, res) => {
  const out = joinLeagueByCode(req.userId!, req.body?.code);
  if ('error' in out) { res.status(400).json(out); return; }
  res.json({ league: publicLeague(out) });
});

leaguesRouter.get('/:id', (req: AuthedRequest, res) => {
  const league = getLeague(Number(req.params.id));
  if (!league || !isLeagueMember(league.id, req.userId!)) { res.status(404).json({ error: 'Liga ne postoji ili nisi njen član.' }); return; }
  res.json({
    league: publicLeague(league),
    isAdmin: isLeagueAdmin(league.id, req.userId!),
    myUserId: req.userId,
    members: leagueMembers(league.id).map((m) => ({ userId: m.user_id, name: m.name || m.email, isAdmin: !!m.is_admin })),
    standings: leagueStandings(league),
  });
});

// admin: ukloni igraca iz lige (sebe ne — da liga ne ostane bez admina)
leaguesRouter.post('/:id/members/:userId/remove', (req: AuthedRequest, res) => {
  const leagueId = Number(req.params.id);
  const target = Number(req.params.userId);
  if (!isLeagueAdmin(leagueId, req.userId!)) { res.status(403).json({ error: 'Samo admin lige.' }); return; }
  if (target === req.userId) { res.status(400).json({ error: 'Ne možeš ukloniti sebe.' }); return; }
  run('DELETE FROM league_members WHERE league_id = ? AND user_id = ?', [leagueId, target]);
  res.json({ ok: true });
});

// admin: dodeli/oduzmi admina lige
leaguesRouter.post('/:id/members/:userId/admin', (req: AuthedRequest, res) => {
  const leagueId = Number(req.params.id);
  const target = Number(req.params.userId);
  if (!isLeagueAdmin(leagueId, req.userId!)) { res.status(403).json({ error: 'Samo admin lige.' }); return; }
  if (target === req.userId) { res.status(400).json({ error: 'Ne možeš menjati svoja prava.' }); return; }
  run('UPDATE league_members SET is_admin = ? WHERE league_id = ? AND user_id = ?', [req.body?.admin ? 1 : 0, leagueId, target]);
  res.json({ ok: true });
});
