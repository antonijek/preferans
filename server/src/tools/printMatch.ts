// Ispis partije ruku po ruku iz baze (samo citanje):
//   node dist/tools/printMatch.js            → spisak poslednjih partija
//   node dist/tools/printMatch.js <id>       → cela partija
// Baza: DB_PATH ili ./data.db (cita se kopija u memoriji, fajl se ne dira).

import fs from 'node:fs';
import initSqlJs from 'sql.js';
import { matchToText } from '../matchText.js';

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(process.env.DB_PATH || './data.db'));
const id = process.argv[2] ? Number(process.argv[2]) : null;

if (id === null) {
  const r = db.exec(
    `SELECT id, room_code, ended_at, match_end_reason, rounds_played, player0_name, player1_name, player2_name
     FROM match_log ORDER BY id DESC LIMIT 15`
  );
  for (const row of r[0]?.values ?? []) console.log(row.join('  '));
} else {
  const stmt = db.prepare(
    `SELECT id, room_code, ended_at, match_end_reason, rounds_played, player0_name, player1_name, player2_name,
       final_scores, hands_json FROM match_log WHERE id = ?`
  );
  stmt.bind([id]);
  if (!stmt.step()) {
    console.error(`Nema partije #${id}`);
    process.exit(1);
  }
  const m = stmt.getAsObject();
  console.log(matchToText({
    id: Number(m.id),
    room_code: String(m.room_code),
    ended_at: String(m.ended_at),
    match_end_reason: String(m.match_end_reason),
    rounds_played: Number(m.rounds_played),
    names: [String(m.player0_name ?? '?'), String(m.player1_name ?? '?'), String(m.player2_name ?? '?')],
    final_scores: JSON.parse(String(m.final_scores)),
    hands: JSON.parse(String(m.hands_json || '[]')),
  }));
}
