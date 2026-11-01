// „Pref meseca“ (korisnikov zahtev 2026-11-01, uzor Lora server/src/monthly.ts): mesečna tabela za sve
// igrače. Svaki online meč (i sa računarom za stolom) donosi bodove za mesto kao u ligama (10-5-1,
// izjednačeni dele); prekinut meč ulazi tek posle 10 ruku (countsForLeague). Prvog u mesecu (po vremenu
// u Srbiji) kreće se ispočetka. Dve kategorije: zbir bodova i prosek po meču (mesto u proseku samo uz
// bar AVG_MIN mečeva u mesecu). Igra protiv računara bez prijave se ne vidi na serveru, pa se ne računa.

import { Router } from 'express';
import { all } from './db.js';
import { countsForLeague, placePoints } from './leagueStandings.js';

/** Vlasnikovi probni nalozi (antonije bez imena, chrome lap top, Edge, Telefon, Mozila) — igraju, ali nemaju
 *  red u tabeli. Korisnik 2026-11-01: Antonije (6), Dragan (28) i Knox (65) se vide. */
const HIDDEN_USERS = new Set([2, 30, 31, 32, 56]);
/** Korisnik 2026-11-01: „kreni od nule“ — raniji mečevi se ne računaju, prvi pobednik je novembarski. */
export const FIRST_MONTH = '2026-11';
const PLACE_POINTS: [number, number, number] = [10, 5, 1];
const TZ = 'Europe/Belgrade';
const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
/** „Pobednik septembra“ — padež za naslov. */
const MONTHS_OF = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
const CACHE_MS = 60_000;
/** Najmanje mečeva u mesecu za mesto u tabeli proseka — jedan srećan meč ne odlučuje. */
export const AVG_MIN = 10;

export interface MonthMatch {
  /** null = računar */
  userIds: (number | null)[];
  finalScores: number[];
  endReason: string;
  roundsPlayed: number;
}

export interface MonthRow {
  rank: number;
  userId: number;
  name: string;
  matches: number;
  points: number;
  /** bodovi po meču */
  avg: number;
}

/** Mesec (YYYY-MM) po vremenu u Srbiji za trenutak iz baze ('YYYY-MM-DD HH:MM:SS', UTC). */
export function belgradeMonth(endedAtUtc: string): string {
  return new Date(`${endedAtUtc.replace(' ', 'T')}Z`).toLocaleDateString('sv-SE', { timeZone: TZ }).slice(0, 7);
}

/**
 * Tabela meseca: zbir bodova za mesto po igraču (računar i skriveni nalozi zauzimaju mesto, ali nemaju red).
 * Poredak: više bodova, pa manje mečeva (isti bodovi iz manje mečeva su bolji), pa ime. Isti bodovi = isto mesto.
 * names: trenutno ime igrača (igrač koji nije u spisku — obrisan ili banovan — nema red).
 */
export function monthTable(
  matches: MonthMatch[],
  names: ReadonlyMap<number, string>,
  hidden: ReadonlySet<number> = HIDDEN_USERS
): MonthRow[] {
  const byUser = new Map<number, { name: string; matches: number; points: number }>();
  for (const m of matches) {
    if (m.finalScores.length !== 3 || !countsForLeague(m.endReason, m.roundsPlayed)) continue;
    const pts = placePoints(m.finalScores, PLACE_POINTS);
    m.userIds.forEach((userId, seat) => {
      const name = userId === null ? undefined : names.get(userId);
      if (userId === null || hidden.has(userId) || name === undefined) return;
      const row = byUser.get(userId) ?? { name, matches: 0, points: 0 };
      row.matches++;
      row.points += pts[seat]!;
      byUser.set(userId, row);
    });
  }
  const rows = [...byUser.entries()]
    .map(([userId, r]) => ({ userId, ...r, avg: r.points / r.matches }))
    .sort((a, b) => b.points - a.points || a.matches - b.matches || a.name.localeCompare(b.name, 'sr'));
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((x) => x.points > r.points).length }));
}

export interface AvgRow extends MonthRow {
  /** ima bar min mečeva — dobija mesto; ostali stoje ispod, bez mesta (rank 0) */
  ranked: boolean;
}

/**
 * Tabela proseka: svi koji su igrali. Mesto dobija samo ko ima bar min mečeva; ostali idu ispod njih.
 * U obe grupe poredak: veći prosek, pa više mečeva, pa ime. Isti prosek = isto mesto.
 */
export function avgTable(rows: MonthRow[], min = AVG_MIN): AvgRow[] {
  const byAvg = (a: MonthRow, b: MonthRow) => b.avg - a.avg || b.matches - a.matches || a.name.localeCompare(b.name, 'sr');
  const ok = rows.filter((r) => r.matches >= min).sort(byAvg);
  const rest = rows.filter((r) => r.matches < min).sort(byAvg);
  return [
    ...ok.map((r) => ({ ...r, ranked: true, rank: 1 + ok.filter((x) => x.avg > r.avg).length })),
    ...rest.map((r) => ({ ...r, ranked: false, rank: 0 })),
  ];
}

export interface MonthView {
  month: string;
  daysLeft: number;
  rows: MonthRow[];
  avgRows: AvgRow[];
  avgMin: number;
  prev: { month: string; name: string; points: number } | null;
  /** najbolji prosek prošlog meseca (kad ga ima) */
  prevAvg: { name: string; avg: number } | null;
  /** „1. decembra“ — kad prošli mesec nema pobednika, piše se kad će biti prvi. */
  nextOf: string;
}

interface LogRow {
  id: number;
  ended_at: string;
  player0_user_id: number | null;
  player1_user_id: number | null;
  player2_user_id: number | null;
  final_scores: string;
  match_end_reason: string;
  rounds_played: number;
}

/** Ime za tabelu: samo ime iz naloga (email se nikad ne prikazuje, tabela je javna). */
function playerNames(): Map<number, string> {
  const users = all<{ id: number; name: string | null }>('SELECT id, name FROM users WHERE banned = 0');
  return new Map(users.map((u) => [u.id, u.name?.trim() || `Igrač ${u.id}`]));
}

/** Tabela za ovaj mesec i pobednik prošlog — iz online mečeva poslednjih ~70 dana. */
export function monthView(now = Date.now()): MonthView {
  const since = new Date(now - 70 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = all<LogRow>(
    `SELECT id, ended_at, player0_user_id, player1_user_id, player2_user_id, final_scores, match_end_reason, rounds_played
     FROM match_log WHERE ended_at >= ? ORDER BY id`,
    [since]
  );
  const names = playerNames();
  const today = new Date(now).toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const thisKey = today.slice(0, 7);
  const prevKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const pick = (key: string): MonthMatch[] => {
    if (key < FIRST_MONTH) return [];
    const out: MonthMatch[] = [];
    for (const r of rows) {
      if (belgradeMonth(r.ended_at) !== key) continue;
      let finalScores: number[];
      try {
        finalScores = JSON.parse(r.final_scores);
      } catch (e) {
        console.error(`[monthly] pokvaren final_scores u match_log ${r.id}, partija preskocena:`, e);
        continue;
      }
      out.push({
        userIds: [r.player0_user_id, r.player1_user_id, r.player2_user_id],
        finalScores,
        endReason: r.match_end_reason,
        roundsPlayed: r.rounds_played,
      });
    }
    return out;
  };
  const prevRows = monthTable(pick(prevKey), names);
  const prevTop = prevRows[0];
  const prevAvg = avgTable(prevRows).find((r) => r.ranked);
  const thisRows = monthTable(pick(thisKey), names);
  return {
    month: MONTHS[m - 1]!,
    daysLeft: new Date(Date.UTC(y, m, 0)).getUTCDate() - d,
    rows: thisRows,
    avgRows: avgTable(thisRows),
    avgMin: AVG_MIN,
    prev: prevTop ? { month: MONTHS_OF[(m + 10) % 12]!, name: prevTop.name, points: prevTop.points } : null,
    prevAvg: prevAvg ? { name: prevAvg.name, avg: prevAvg.avg } : null,
    nextOf: MONTHS_OF[m % 12]!,
  };
}

let cache: { at: number; view: MonthView } | null = null;

export const monthlyRouter = Router();

// ista tabela za sve; računa se najviše jednom u minuti
monthlyRouter.get('/', (_req, res) => {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), view: monthView() };
  res.json(cache.view);
});
