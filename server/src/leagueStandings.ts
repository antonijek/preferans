// Tabela lige — cista funkcija bez baze (leagues.ts cita match_log i zove
// computeStandings), testirana u leagueStandings.test.ts.

export type LeagueScoring = { mode: 'places'; points: [number, number, number] } | { mode: 'result' };
export type LeagueRankBy = 'total' | 'avg';

// Korisnikova odluka 2026-10-20: partija prekinuta dogovorom ili posle
// napustanja ulazi u tabelu tek posle ovoliko ruku — inace bi se bodovi i
// norma "farmali" (jedna ruka, dogovoren kraj, 10-5-1). Do kraja odigrana
// partija (bula pala) ulazi uvek.
export const MIN_HANDS_FOR_EARLY_END = 10;

export function countsForLeague(endReason: string, roundsPlayed: number): boolean {
  return endReason === 'natural' || roundsPlayed >= MIN_HANDS_FOR_EARLY_END;
}

export interface LeagueMatch {
  userIds: [number | null, number | null, number | null];
  finalScores: number[];
  endReason: string;
  roundsPlayed: number;
}

export interface LeagueMemberRef {
  userId: number;
  name: string;
}

export interface StandingsRules {
  scoring: LeagueScoring;
  norma: number;
  rankBy: LeagueRankBy;
}

export interface StandingRow {
  userId: number;
  name: string;
  matches: number;
  points: number; // bodovi po mestu, ili zbir rezultata
  avg: number;
  result: number; // zbir rezultata (plus je dobro)
  wins: number;
  meetsNorma: boolean;
}

// Izjednaceni dele bodove mesta koja zajedno zauzimaju (npr. dvojica prva
// kod 10-5-1 dobijaju po 7.5).
function placePoints(scores: number[], points: [number, number, number]): number[] {
  const order = [0, 1, 2].sort((a, b) => scores[a]! - scores[b]!);
  const out = [0, 0, 0];
  for (let i = 0; i < 3; ) {
    let j = i;
    while (j + 1 < 3 && scores[order[j + 1]!] === scores[order[i]!]) j++;
    const share = points.slice(i, j + 1).reduce((s, p) => s + p, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) out[order[k]!] = share;
    i = j + 1;
  }
  return out;
}

/**
 * Plasman u partiji po konacnom skoru (nize je bolje, isto kao engine
 * calculateMatchScores). Rezultat = prosek skora − skor (zbir za troje 0,
 * isto kao u igri). Igraci ispod norme idu na dno tabele.
 */
export function computeStandings(
  members: LeagueMemberRef[],
  matches: LeagueMatch[],
  rules: StandingsRules
): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  for (const m of members) {
    rows.set(m.userId, {
      userId: m.userId, name: m.name, matches: 0, points: 0, avg: 0, result: 0, wins: 0, meetsNorma: false,
    });
  }
  for (const m of matches) {
    const scores = m.finalScores;
    if (m.userIds.some((u) => u === null) || scores.length !== 3) continue;
    if (!countsForLeague(m.endReason, m.roundsPlayed)) continue;
    const mean = (scores[0]! + scores[1]! + scores[2]!) / 3;
    const placePts = rules.scoring.mode === 'places' ? placePoints(scores, rules.scoring.points) : [0, 0, 0];
    const best = Math.min(...scores);
    const soleWinner = scores.filter((s) => s === best).length === 1;
    for (const seat of [0, 1, 2]) {
      // bivsi clan (uklonjen iz lige) — partija i dalje vazi za ostale
      const r = rows.get(m.userIds[seat]!);
      if (!r) continue;
      const res = mean - scores[seat]!;
      r.matches++;
      r.result += res;
      r.points += rules.scoring.mode === 'places' ? placePts[seat]! : res;
      if (soleWinner && scores[seat] === best) r.wins++;
    }
  }
  const out = [...rows.values()].map((r) => ({
    ...r,
    points: Math.round(r.points * 10) / 10,
    result: Math.round(r.result),
    avg: r.matches ? Math.round((r.points / r.matches) * 100) / 100 : 0,
    meetsNorma: r.matches >= rules.norma,
  }));
  const key = (r: StandingRow) => (rules.rankBy === 'avg' ? r.avg : r.points);
  return out.sort(
    (a, b) => Number(b.meetsNorma) - Number(a.meetsNorma) || key(b) - key(a) || b.result - a.result || b.matches - a.matches
  );
}
