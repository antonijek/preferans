// Licna statistika igraca (korisnikov zahtev, tacka 8; po uzoru na Lorinu
// "moja statistika, licni rekordi i niz dana"). computePlayerStats je cista
// funkcija nad partijama iz match_log; ruta /api/stats/me je na dnu.

import { Router } from 'express';
import { get, getMatchesForUser } from './db.js';
import type { MatchLogRow } from './db.js';
import { requireAuth } from './auth/middleware.js';
import type { AuthedRequest } from './auth/middleware.js';
import type { HandSnapshot } from './rooms/RoomState.js';

export interface StatsMatch {
  endedAt: string; // ISO (UTC)
  seat: number;
  finalScores: number[];
  withComputer: boolean;
  newRating: number | null; // null = partija bez rejtinga (racunar za stolom)
  hands: Pick<HandSnapshot, 'declarer' | 'declaredGame' | 'passed' | 'kontraLevel'>[];
}

export interface PlayerStats {
  matches: number;
  withComputer: number;
  places: [number, number, number]; // 1., 2., 3. mesto (izjednaceni dele bolje mesto)
  avgResult: number;
  bestResult: number | null;
  worstResult: number | null;
  peakRating: number | null;
  hands: number;
  declared: number;
  declaredPassed: number;
  games: Record<string, number>; // igre kao nosilac: Pik, Karo, Herc, Tref, Betl, Sans, Igra
  kontraAgainstMe: number;
  daysPlayed: number;
  currentStreak: number; // uzastopnih dana sa partijom, zakljucno sa danas ili juce
  longestStreak: number;
}

const DAY_MS = 86400000;

/** Kalendarski dan u Srbiji (YYYY-MM-DD) — niz dana ne sme da pukne u ponoc po UTC-u. */
export function belgradeDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date(iso));
}

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

export function computePlayerStats(matches: StatsMatch[], now = new Date()): PlayerStats {
  const out: PlayerStats = {
    matches: matches.length, withComputer: 0, places: [0, 0, 0], avgResult: 0, bestResult: null, worstResult: null,
    peakRating: null, hands: 0, declared: 0, declaredPassed: 0, games: {}, kontraAgainstMe: 0,
    daysPlayed: 0, currentStreak: 0, longestStreak: 0,
  };
  let resultSum = 0;
  const days = new Set<string>();
  for (const m of matches) {
    if (m.withComputer) out.withComputer++;
    const s = m.finalScores;
    const mine = s[m.seat]!;
    out.places[s.filter((x) => x < mine).length]!++;
    const result = Math.round((s[0]! + s[1]! + s[2]!) / 3 - mine);
    resultSum += result;
    out.bestResult = out.bestResult === null ? result : Math.max(out.bestResult, result);
    out.worstResult = out.worstResult === null ? result : Math.min(out.worstResult, result);
    if (m.newRating !== null) out.peakRating = Math.max(out.peakRating ?? m.newRating, m.newRating);
    out.hands += m.hands.length;
    for (const h of m.hands) {
      if (h.declarer !== m.seat || !h.declaredGame) continue;
      out.declared++;
      if (h.passed) out.declaredPassed++;
      if (h.kontraLevel) out.kontraAgainstMe++;
      const game = h.declaredGame.startsWith('Igra-') ? 'Igra' : h.declaredGame;
      out.games[game] = (out.games[game] ?? 0) + 1;
    }
    days.add(belgradeDay(m.endedAt));
  }
  out.avgResult = matches.length ? Math.round(resultSum / matches.length) : 0;
  out.daysPlayed = days.size;
  const sorted = [...days].map(dayNumber).sort((a, b) => a - b);
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1;
    out.longestStreak = Math.max(out.longestStreak, run);
  }
  const today = dayNumber(belgradeDay(now.toISOString()));
  const last = sorted[sorted.length - 1];
  out.currentStreak = last !== undefined && today - last <= 1 ? run : 0;
  return out;
}

export function statsMatchFromRow(m: MatchLogRow, userId: number): StatsMatch | null {
  const seats = [m.player0_user_id, m.player1_user_id, m.player2_user_id];
  const seat = seats.indexOf(userId);
  if (seat < 0) return null;
  // racunar sedi na mestu bez naloga; takva partija nema rejting
  const withComputer = seats.includes(null);
  return {
    endedAt: `${m.ended_at.replace(' ', 'T')}Z`,
    seat,
    finalScores: JSON.parse(m.final_scores),
    withComputer,
    newRating: withComputer ? null : (JSON.parse(m.new_ratings) as number[])[seat] ?? null,
    hands: JSON.parse(m.hands_json || '[]'),
  };
}

export const statsRouter = Router();
statsRouter.use(requireAuth);

statsRouter.get('/me', (req: AuthedRequest, res) => {
  const matches = getMatchesForUser(req.userId!, 5000)
    .map((m) => statsMatchFromRow(m, req.userId!))
    .filter((m): m is StatsMatch => m !== null);
  const rating = get<{ rating: number }>('SELECT rating FROM users WHERE id = ?', [req.userId!])?.rating ?? null;
  const stats = computePlayerStats(matches);
  res.json({ stats: { ...stats, rating, peakRating: Math.max(stats.peakRating ?? 0, rating ?? 0) || null } });
});
