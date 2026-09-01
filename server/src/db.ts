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
    // DB from before the `name` column existed (already-registered accounts
    // in production) — add it in place instead of wiping/re-creating.
    // Nullable here (SQLite can't ADD COLUMN NOT NULL without a default on a
    // non-empty table); application code falls back to email for the rows
    // that predate this column.
    const columns = db.exec('PRAGMA table_info(users)');
    const hasName = columns[0]?.values.some((row) => row[1] === 'name') ?? false;
    if (!hasName) {
      db.run('ALTER TABLE users ADD COLUMN name TEXT');
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
