// Izvestaj o igri protiv racunara (korisnikov zahtev 2026-11-23: "da analiziramo njihovu igru").
// Cita local-hands.db (server/src/localHandsDb.ts), samo citanje. Mesto 0 je covek, mesta 1 i 2 su racunar.
//
//   na serveru:  node tools/local-hands-report.mjs /var/www/preferans/server/local-hands.db
//   lokalno:     node tools/local-hands-report.mjs putanja/do/local-hands.db [--od 2026-11-24]

import { DatabaseSync } from 'node:sqlite';
import { reportBidding } from './local-hands-bidding.mjs';
import { reportPlay } from './local-hands-play.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Upotreba: node tools/local-hands-report.mjs <local-hands.db> [--od YYYY-MM-DD]');
  process.exit(1);
}
const fromIndex = process.argv.indexOf('--od');
const from = fromIndex > 0 ? process.argv[fromIndex + 1] : '0000-00-00';

const db = new DatabaseSync(file, { readOnly: true });
const rows = db
  .prepare('SELECT created_at, visitor, match_id, round, final, device, hand_json FROM local_hands WHERE created_at >= ? ORDER BY id')
  .all(from)
  .map((row) => ({ ...row, hand: JSON.parse(row.hand_json) }));

const pct = (part, total) => (total === 0 ? '-' : `${Math.round((100 * part) / total)}%`);
const count = (items, key) => items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map());
const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
};
const title = (text) => console.log(`\n== ${text}`);

if (rows.length === 0) {
  console.log('Nema zapisanih ruku' + (from === '0000-00-00' ? '.' : ` od ${from}.`));
  process.exit(0);
}

// ---- pregled
const matches = new Map();
for (const row of rows) {
  const match = matches.get(row.match_id) ?? { visitor: row.visitor, day: row.created_at.slice(0, 10), hands: 0, final: false, device: row.device };
  match.hands += 1;
  match.final ||= row.final === 1;
  matches.set(row.match_id, match);
}
const visitors = new Set(rows.map((row) => row.visitor));
title('Pregled');
console.log(`ruke: ${rows.length}, partije: ${matches.size}, uredjaji (posetioci): ${visitors.size}`);
console.log(`period: ${rows[0].created_at.slice(0, 10)} do ${rows.at(-1).created_at.slice(0, 10)}`);
for (const [device, n] of count([...matches.values()], (m) => m.device)) console.log(`  partije na uredjaju ${device}: ${n}`);

// ---- zavrsavanje partija
const list = [...matches.values()];
const finished = list.filter((m) => m.final);
title('Da li partije stignu do kraja');
console.log(`zavrseno do kraja: ${finished.length} od ${list.length} (${pct(finished.length, list.length)})`);
console.log(`ruku po partiji (sredina): ${median(list.map((m) => m.hands))}, zavrsenih: ${median(finished.map((m) => m.hands))}`);
const byLength = count(list.filter((m) => !m.final), (m) => (m.hands <= 2 ? '1-2 ruke' : m.hands <= 6 ? '3-6 ruku' : m.hands <= 15 ? '7-15 ruku' : '16+ ruku'));
console.log('nezavrsene partije, posle koliko ruku su ostavljene:', Object.fromEntries(byLength));

// ---- povratak
title('Vracaju li se');
const daysByVisitor = new Map();
for (const row of rows) daysByVisitor.set(row.visitor, new Set([...(daysByVisitor.get(row.visitor) ?? []), row.created_at.slice(0, 10)]));
const returning = [...daysByVisitor.values()].filter((days) => days.size > 1).length;
console.log(`igrali na vise razlicitih dana: ${returning} od ${visitors.size} (${pct(returning, visitors.size)})`);
const gamesPerVisitor = [...count(list, (m) => m.visitor).values()];
console.log(`partija po uredjaju (sredina): ${median(gamesPerVisitor)}, najvise: ${Math.max(...gamesPerVisitor)}`);

// ---- igre i uspeh (mesto 0 = covek)
title('Igre koje se igraju (nosilac je covek ili racunar)');
const played = rows.filter((row) => row.hand.declaredGame !== '');
const everyonePassed = rows.length - played.length;
console.log(`ruke bez igre (svi dalje): ${everyonePassed} od ${rows.length} (${pct(everyonePassed, rows.length)})`);
const human = played.filter((row) => row.hand.declarer === 0);
const computer = played.filter((row) => row.hand.declarer !== 0);
const passed = (items) => items.filter((row) => row.hand.passed).length;
console.log(`covek nosilac: ${human.length} ruku, prosao ${pct(passed(human), human.length)}`);
console.log(`racunar nosilac: ${computer.length} ruku, prosao ${pct(passed(computer), computer.length)}`);
const gameNames = [...new Set(played.map((row) => row.hand.declaredGame))].sort();
console.log('\nigra                 ruku   covek: br/prosao    racunar: br/prosao');
for (const name of gameNames) {
  const all = played.filter((row) => row.hand.declaredGame === name);
  const h = all.filter((row) => row.hand.declarer === 0);
  const c = all.filter((row) => row.hand.declarer !== 0);
  console.log(
    `${name.padEnd(20)} ${String(all.length).padStart(4)}   ${String(h.length).padStart(5)} / ${pct(passed(h), h.length).padEnd(5)}      ${String(c.length).padStart(5)} / ${pct(passed(c), c.length)}`,
  );
}

// ---- pratnja, kontra, neodigrane
title('Pratnja i kontra');
const withPlay = played.filter((row) => row.hand.tricks.length > 0);
console.log(`ruke koje su odigrane do kraja: ${withPlay.length} od ${played.length} (ostale: niko nije dosao ili je prekinuto)`);
const humanFollowed = played.filter((row) => row.hand.declarer !== 0 && row.hand.followChoices[0] === 'DODJEM').length;
const humanCouldFollow = played.filter((row) => row.hand.declarer !== 0 && row.hand.followChoices[0] !== null).length;
console.log(`covek je dosao kad je igrao racunar: ${humanFollowed} od ${humanCouldFollow} (${pct(humanFollowed, humanCouldFollow)})`);
const kontra = played.filter((row) => row.hand.kontraLevel);
console.log(`ruke sa kontrom: ${kontra.length} (${pct(kontra.length, played.length)}); kontru dao covek: ${kontra.filter((r) => r.hand.kontraPlayer === 0).length}`);
const claimed = played.filter((row) => row.hand.claimedBy !== null && row.hand.claimedBy !== undefined).length;
console.log(`ruke zavrsene sa "nosim sve": ${claimed}`);

// Pravi rezultat partije (ko je pobedio) se ovde ne racuna: za to treba obracun supe iz engine-a, a zapis ruke
// cuva samo bule posle svake ruke. Ako zatreba, dodati dugove (debtMatrix) u zapis.

// ---- licitacija i nacin igranja (glavni deo: iz toga se uci)
reportBidding(rows);
reportPlay(rows);

// ---- dani
title('Ruke po danu');
for (const [day, n] of [...count(rows, (row) => row.created_at.slice(0, 10))].sort()) console.log(`  ${day}: ${n}`);
