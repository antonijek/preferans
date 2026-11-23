// Baza ruku iz igre protiv racunara (korisnikov zahtev 2026-11-23). Poseban fajl uz pravu bazu (node:sqlite), a ne u
// glavnoj bazi koja zivi u memoriji i prepisuje se cela posle svake izmene: ovi podaci stalno rastu (oko 2 KB po ruci).
// Bez imena i IP adrese: samo nasumican broj posetioca (visit.js) i broj partije koji spaja ruke jedne partije.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { LocalHand } from './localHands.js';

const KEEP_DAYS = 400;

export interface LocalHandRow {
  readonly id: number;
  readonly created_at: string;
  readonly visitor: string;
  readonly match_id: string;
  readonly round: number;
  readonly final: number;
  readonly device: string;
  readonly hand_json: string;
}

export interface LocalHandsDb {
  readonly save: (visitor: string, device: string, hand: LocalHand) => void;
  readonly all: () => LocalHandRow[];
}

export function openLocalHandsDb(file: string): LocalHandsDb {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS local_hands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    visitor TEXT NOT NULL,
    match_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    final INTEGER NOT NULL DEFAULT 0,
    device TEXT NOT NULL,
    hand_json TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_local_hands_match ON local_hands(match_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_local_hands_created ON local_hands(created_at)');
  const insert = db.prepare(
    'INSERT INTO local_hands (visitor, match_id, round, final, device, hand_json) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const prune = db.prepare("DELETE FROM local_hands WHERE created_at < datetime('now', ?)");
  const select = db.prepare('SELECT * FROM local_hands ORDER BY id');
  return {
    save(visitor, device, hand) {
      insert.run(visitor, hand.matchId, hand.round, hand.final ? 1 : 0, device, hand.json);
      prune.run(`-${String(KEEP_DAYS)} days`);
    },
    all: () => select.all() as unknown as LocalHandRow[],
  };
}

let shared: LocalHandsDb | null = null;

/** Zajednicka baza ruku, pravi se pri prvom upisu (pored glavne baze, fajl local-hands.db). */
export function localHandsDb(): LocalHandsDb {
  shared ??= openLocalHandsDb(
    process.env.LOCAL_HANDS_DB ?? path.join(path.dirname(path.resolve(process.env.DB_PATH ?? './data.db')), 'local-hands.db'),
  );
  return shared;
}
