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
