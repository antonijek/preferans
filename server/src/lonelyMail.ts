// Mejl igraču koji je došao i otišao jer nije imao s kim da igra (korisnik 2026-11-04: „treba slati poruke ljudima
// koji dođu pa odu jer nije bilo nikoga“, uz poruku da sajt tek kreće). Šalje se jednom po igraču, 15 minuta posle
// odlaska; ako se u međuvremenu vrati, čeka se novi odlazak. Admin se ne računa kao društvo dok ne sedne za isti sto
// (često je na sajtu i igra sa računarom, kao kad je Goran došao), a njemu se mejl i ne šalje.
// Ko čeka mejl pamti se u bazi (tabela lonely_mail), pa restart servera ne gubi poruku.

import type { Position } from '../../engine/dist/types.js';
import { all, run } from './db.js';
import { sendMail } from './mail.js';
import { forEachRoom } from './rooms/RoomManager.js';

const DELAY_MINUTES = 15;
const SITE_URL = 'https://preferans.igrajmo.online';

/** Igrači (bez admina) koji su sada na sajtu: broj veza i da li su za ovu posetu imali s kim da igraju. */
const present = new Map<number, { sockets: number; company: boolean }>();

export function lonelyArrived(userId: number, isAdmin: boolean): void {
  if (isAdmin) return;
  const visit = present.get(userId) ?? { sockets: 0, company: false };
  visit.sockets += 1;
  present.set(userId, visit);
  if (present.size > 1) for (const v of present.values()) v.company = true;
  run('UPDATE lonely_mail SET due_at = NULL WHERE user_id = ? AND sent_at IS NULL', [userId]);
}

export function lonelyLeft(userId: number): void {
  const visit = present.get(userId);
  if (!visit) return;
  visit.sockets -= 1;
  if (visit.sockets > 0) return;
  noteTablesWithPeople();
  present.delete(userId);
  if (visit.company) return;
  run(
    `INSERT INTO lonely_mail (user_id, due_at) VALUES (?, datetime('now', '+${DELAY_MINUTES} minutes'))
     ON CONFLICT(user_id) DO UPDATE SET due_at = excluded.due_at WHERE sent_at IS NULL`,
    [userId]
  );
}

/** Ko sedi za stolom sa još nekim čovekom (i sa adminom) nije bio sam. */
function noteTablesWithPeople(): void {
  forEachRoom((room) => {
    const people = ([0, 1, 2] as Position[])
      .filter((p) => p !== room.abandonedSeat && !room.botSeats.has(p))
      .map((p) => room.seatUserIds[p])
      .filter((id): id is number => id !== null && id !== undefined);
    if (people.length < 2) return;
    for (const id of people) {
      const visit = present.get(id);
      if (visit) visit.company = true;
    }
  });
}

export function lonelyMailText(name: string | null, withReply: boolean): { subject: string; text: string } {
  const lines = [
    name ? `Zdravo ${name},` : 'Zdravo,',
    '',
    'hvala na poseti sajtu Preferans online. Žao nam je što ovog puta nije bilo drugih igrača za stolom.',
    '',
    'Sajt tek kreće i igrači tek dolaze. Kako se bude čulo za njega, biće sve više igrača i sve lakše ćeš naći partiju.',
    '',
    'Do tada možeš da igraš protiv računara.' +
      (withReply ? ' Ako želiš da se dogovorimo za partiju, samo odgovori na ovaj mejl.' : ''),
    '',
    'Vidimo se za stolom!',
    'Preferans online',
    SITE_URL,
  ];
  return { subject: 'Hvala na poseti Preferansu online', text: lines.join('\n') };
}

async function sendDueLonelyMails(): Promise<void> {
  noteTablesWithPeople();
  const due = all<{ user_id: number; email: string; name: string | null }>(
    `SELECT l.user_id, u.email, u.name FROM lonely_mail l JOIN users u ON u.id = l.user_id
     WHERE l.sent_at IS NULL AND l.due_at <= datetime('now') AND u.banned = 0 AND u.is_admin = 0`
  );
  const replyTo = process.env.MAIL_REPLY_TO || undefined;
  for (const row of due) {
    // upisano pre slanja, da sledeći krug ne pošalje isti mejl dok ovaj još putuje
    run("UPDATE lonely_mail SET sent_at = datetime('now') WHERE user_id = ?", [row.user_id]);
    const { subject, text } = lonelyMailText(row.name, replyTo !== undefined);
    try {
      await sendMail(row.email, subject, text, undefined, replyTo);
    } catch (err) {
      run('UPDATE lonely_mail SET error = ? WHERE user_id = ?', [String(err), row.user_id]);
    }
  }
}

export function startLonelyMail(): void {
  run(`CREATE TABLE IF NOT EXISTS lonely_mail (
    user_id INTEGER PRIMARY KEY,
    due_at TEXT,
    sent_at TEXT,
    error TEXT
  )`);
  setInterval(() => {
    sendDueLonelyMails().catch((err) => console.error('[lonely-mail] greška:', err));
  }, 60 * 1000).unref();
}
