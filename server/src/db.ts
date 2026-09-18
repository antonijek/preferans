import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

const DB_PATH = process.env.DB_PATH || './data.db';

let db: Database;

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  const usersTable = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
  );
  if (usersTable.length === 0) {
    const migrationPath = path.join(process.cwd(), 'src', 'migrations', '001_init.sql');
    db.run(fs.readFileSync(migrationPath, 'utf-8'));
  } else {
    // Existing DB predating one or more of these columns/tables (real
    // production accounts already registered) — add whatever's missing in
    // place instead of wiping/re-creating.
    const columns = db.exec('PRAGMA table_info(users)');
    const existingCols = new Set((columns[0]?.values ?? []).map((row) => row[1]));
    // `name` has no sensible default (nullable; app code falls back to
    // email for rows that predate it) — the others get a real default,
    // which SQLite's ADD COLUMN allows even on a non-empty table.
    if (!existingCols.has('name')) db.run('ALTER TABLE users ADD COLUMN name TEXT');
    if (!existingCols.has('is_admin')) db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    // Admin panel "banuj nalog" (korisnikov zahtev 2026-09-17) — reversibilan
    // suspend, za razliku od trajnog brisanja naloga koje vec postoji.
    if (!existingCols.has('banned')) db.run('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
    if (!existingCols.has('credits')) db.run('ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0');
    // Ranking sistem (korisnikov zahtev 2026-09-10) — ELO-stil bodovi,
    // default 1000 za nove/postojece igrace (isti obrazac kao credits).
    if (!existingCols.has('rating')) db.run('ALTER TABLE users ADD COLUMN rating INTEGER NOT NULL DEFAULT 1000');

    const creditLogTable = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='credit_log'"
    );
    if (creditLogTable.length === 0) {
      db.run(`CREATE TABLE credit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        delta INTEGER NOT NULL,
        reason TEXT,
        admin_user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    }
  }

  // Istorija partija (korisnikov zahtev 2026-09-11) — zasebna migracija
  // 002_match_log.sql. BAG NADJEN 2026-09-18 (potvrdjeno padom servera na
  // svezoj bazi tokom testiranja): ovo je ranije bilo UNUTAR else grane
  // iznad, pa se NIKAD nije pokretalo na potpuno svezoj instalaciji (fresh
  // `users` tabela ide granom iznad koja radi SAMO 001_init.sql) —
  // saveMatchLog() bi pukao sa "no such table: match_log" i SRUSIO CEO
  // SERVER PROCES cim bi PRVA partija na svezoj bazi dosla do kraja.
  // Provera mora da vazi za OBE grane (svezа i postojeca baza), zato je
  // sad IZVAN if/else-a iznad.
  const matchLogTable = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='match_log'"
  );
  if (matchLogTable.length === 0) {
    const migrationPath = path.join(process.cwd(), 'src', 'migrations', '002_match_log.sql');
    db.run(fs.readFileSync(migrationPath, 'utf-8'));
  }

  // Trajno cuvanje AKTIVNIH (nezavrsenih) soba (korisnikov zahtev
  // 2026-09-18: "da se moze nastaviti u drugom terminu") — dosad su sobe
  // zivele SAMO u memoriji (RoomManager.ts roomsByCode Map), pa je SVAKI
  // restart servera (a deploy-ujemo cesto) potpuno brisao partije u toku,
  // bez ikakvog traga. Van if/else-a iznad iz istog razloga kao match_log
  // gore (mora da vazi i za svezu i za postojecu bazu).
  const activeRoomsTable = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='active_rooms'"
  );
  if (activeRoomsTable.length === 0) {
    db.run(`CREATE TABLE active_rooms (
      code TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  }

  persist();
}

let persistTimer: NodeJS.Timeout | null = null;

export function persist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    persistTimer = null;
  }, 2000);
}

// Writes immediately, bypassing the debounce — call this on shutdown so a
// pm2 restart/redeploy can't land inside the up-to-2s window where a write
// has happened but not yet hit disk.
export function flushPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

export function run(sql: string, params: (string | number | null)[] = []): void {
  db.run(sql, params);
  persist();
}

export function get<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): T | undefined {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? (stmt.getAsObject() as T) : undefined;
  stmt.free();
  return row;
}

export function all<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

// Ranking sistem (korisnikov zahtev 2026-09-10) — citanje/pisanje trajnog
// ELO-stil rejtinga po korisniku.
export function getUserRating(userId: number): number {
  const row = get<{ rating: number }>('SELECT rating FROM users WHERE id = ?', [userId]);
  return row?.rating ?? 1000;
}

export function getUsersRatings(userIds: number[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const id of userIds) result.set(id, getUserRating(id));
  return result;
}

export function updateUserRating(userId: number, newRating: number): void {
  run('UPDATE users SET rating = ? WHERE id = ?', [newRating, userId]);
}

// Istorija partija (korisnikov zahtev 2026-09-11) — JSON serijalizovani
// nizovi (bulas/scores/deltas/newRatings) cuvaju sve podatke o rundi bez
// dodatnih join tabela. Za 50 korisnika × 3 partije/dan = ~750 KB/dan,
// zanemarivo opterecenje baze.
export interface MatchLogEntry {
  room_code: string;
  match_end_reason: 'natural' | 'agreed' | 'leave';
  rounds_played: number;
  player0_user_id: number | null;
  player1_user_id: number | null;
  player2_user_id: number | null;
  player0_name: string | null;
  player1_name: string | null;
  player2_name: string | null;
  final_bulas: [number, number, number];
  final_scores: [number, number, number];
  rating_deltas: [number, number, number];
  new_ratings: [number, number, number];
  hands_json: string;
}

export function saveMatchLog(entry: MatchLogEntry): void {
  run(
    `INSERT INTO match_log (
      room_code, match_end_reason, rounds_played,
      player0_user_id, player1_user_id, player2_user_id,
      player0_name, player1_name, player2_name,
      final_bulas, final_scores, rating_deltas, new_ratings,
      hands_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.room_code,
      entry.match_end_reason,
      entry.rounds_played,
      entry.player0_user_id,
      entry.player1_user_id,
      entry.player2_user_id,
      entry.player0_name,
      entry.player1_name,
      entry.player2_name,
      JSON.stringify(entry.final_bulas),
      JSON.stringify(entry.final_scores),
      JSON.stringify(entry.rating_deltas),
      JSON.stringify(entry.new_ratings),
      entry.hands_json,
    ]
  );
}

export function getMatchById(id: number): MatchLogRow | undefined {
  return get<MatchLogRow>('SELECT * FROM match_log WHERE id = ?', [id]);
}

export interface MatchLogRow {
  id: number;
  room_code: string;
  ended_at: string;
  match_end_reason: string;
  rounds_played: number;
  player0_user_id: number | null;
  player1_user_id: number | null;
  player2_user_id: number | null;
  player0_name: string | null;
  player1_name: string | null;
  player2_name: string | null;
  final_bulas: string;
  final_scores: string;
  rating_deltas: string;
  new_ratings: string;
}

export function getAllMatches(limit = 100): MatchLogRow[] {
  return all<MatchLogRow>(
    'SELECT * FROM match_log ORDER BY ended_at DESC LIMIT ?',
    [limit]
  );
}

export function getMatchesForUser(userId: number, limit = 100): MatchLogRow[] {
  return all<MatchLogRow>(
    `SELECT * FROM match_log
     WHERE player0_user_id = ? OR player1_user_id = ? OR player2_user_id = ?
     ORDER BY ended_at DESC LIMIT ?`,
    [userId, userId, userId, limit]
  );
}

// === Trajno cuvanje aktivnih (nezavrsenih) soba ===
// Korisnikov zahtev (2026-09-18): partija u toku treba da prezivi restart
// servera (cest dogadjaj — svaki deploy). RoomManager.ts poziva ove
// funkcije: saveActiveRoom() na svaku broadcastRoomState() (upsert, jeftino
// — stvarni disk-upis je vec debounced preko postojeceg persist()),
// deleteActiveRoom() cim se soba stvarno zatvori (removeRoom()),
// getAllActiveRooms() JEDNOM pri startu servera da se sve nezavrsene sobe
// vrate u memoriju pre nego sto httpServer pocne da prima konekcije.

export function saveActiveRoom(code: string, stateJson: string): void {
  run(
    `INSERT INTO active_rooms (code, state_json, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(code) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
    [code, stateJson]
  );
}

export function deleteActiveRoom(code: string): void {
  run('DELETE FROM active_rooms WHERE code = ?', [code]);
}

export function getAllActiveRooms(): { code: string; state_json: string }[] {
  return all<{ code: string; state_json: string }>('SELECT code, state_json FROM active_rooms');
}
