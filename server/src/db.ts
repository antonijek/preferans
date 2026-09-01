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
    if (!existingCols.has('credits')) db.run('ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0');

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

  persist();
}

export function persist(): void {
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
