import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

// baza u privremenom fajlu: db.ts čita DB_PATH pri učitavanju, zato dinamički import posle podešavanja
process.env.DB_PATH = join(tmpdir(), `lonely-mail-test-${process.pid}.db`);
const db = await import('./db.js');
await db.initDb();
const { lonelyArrived, lonelyLeft, lonelyMailText, startLonelyMail } = await import('./lonelyMail.js');
startLonelyMail();
after(() => {
  db.flushPersist();
  rmSync(process.env.DB_PATH!, { force: true });
});

const pending = (userId: number) =>
  db.get<{ due_at: string | null }>('SELECT due_at FROM lonely_mail WHERE user_id = ?', [userId])?.due_at ?? null;

test('igrač koji je bio sam dobija mejl posle odlaska, a povratak ga otkazuje', () => {
  lonelyArrived(101, false);
  lonelyLeft(101);
  assert.notEqual(pending(101), null);
  lonelyArrived(101, false);
  assert.equal(pending(101), null, 'vratio se pre slanja');
  lonelyLeft(101);
});

test('dva igrača u isto vreme nisu bila sama, a admin se ne računa', () => {
  lonelyArrived(201, false);
  lonelyArrived(202, false);
  lonelyLeft(202);
  lonelyLeft(201);
  assert.equal(pending(201), null);
  assert.equal(pending(202), null);
  lonelyArrived(203, false);
  lonelyArrived(6, true);
  lonelyLeft(6);
  lonelyLeft(203);
  assert.notEqual(pending(203), null, 'admin na sajtu nije društvo');
  assert.equal(pending(6), null, 'admin ne dobija mejl');
});

test('prelazak na drugi uređaj nije odlazak', () => {
  lonelyArrived(301, false);
  lonelyArrived(301, false);
  lonelyLeft(301);
  assert.equal(pending(301), null);
});

test('tekst mejla: sajt tek kreće, odgovor samo kad postoji adresa za odgovor', () => {
  const withReply = lonelyMailText('Goran', true);
  assert.match(withReply.text, /^Zdravo Goran,/);
  assert.match(withReply.text, /Sajt tek kreće/);
  assert.match(withReply.text, /odgovori na ovaj mejl/);
  assert.doesNotMatch(lonelyMailText(null, false).text, /odgovori/);
});
