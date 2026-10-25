import { Router } from 'express';
import { get, run } from '../db.js';
import { hashPassword } from './password.js';
import { signToken } from './middleware.js';
import { rateLimit } from '../rateLimit.js';
import { sendMail } from '../mail.js';
import {
  hashResetToken,
  isResetApp,
  isResetUsable,
  MIN_PASSWORD,
  newResetToken,
  RESET_APPS,
  RESET_TTL_MS,
  resetLink,
  resetMail,
} from './resetToken.js';
import type { ResetRow } from './resetToken.js';

// Najvise toliko linkova po nalogu u satu — da niko ne moze da zatrpa tudje sanduce.
const MAX_LINKS_PER_HOUR = 3;
const INVALID_LINK = 'Link je istekao ili je već iskorišćen. Zatražite novi.';

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'forgot',
  message: 'Previše zahteva. Pokušajte ponovo za sat vremena.',
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'reset',
  message: 'Previše pokušaja. Pokušajte ponovo za 15 minuta.',
});

export function initPasswordResets(): void {
  run(`CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
}

const findReset = (where: 'token_hash' | 'id', value: string | number) =>
  get<ResetRow>(`SELECT id, user_id, expires_at, used_at FROM password_resets WHERE ${where} = ?`, [value]);

export const passwordResetRouter = Router();

passwordResetRouter.post('/password/forgot', forgotLimiter, (req, res) => {
  const { email, app } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || !isResetApp(app)) {
    res.status(400).json({ error: 'Unesite email.' });
    return;
  }
  // Isti odgovor, i odmah, bez obzira da li nalog postoji — da se ne moze proveravati cija je adresa.
  res.json({ ok: true });

  const user = get<{ id: number; email: string; name: string | null; banned: number }>(
    'SELECT id, email, name, banned FROM users WHERE lower(email) = lower(?) ORDER BY id LIMIT 1',
    [email.trim()]
  );
  if (!user || user.banned) return;
  const now = Date.now();
  const recent = get<{ n: number }>('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?', [
    user.id,
    now - RESET_TTL_MS,
  ]);
  if ((recent?.n ?? 0) >= MAX_LINKS_PER_HOUR) return;

  const { token, hash } = newResetToken();
  run('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)', [
    user.id,
    hash,
    now + RESET_TTL_MS,
    now,
  ]);
  const mail = resetMail(app, user.name || user.email, resetLink(app, token));
  sendMail(user.email, mail.subject, mail.text, RESET_APPS[app].name).catch((err) =>
    console.error(`[reset] link za nalog ${user.id} nije poslat:`, err)
  );
});

passwordResetRouter.post('/password/reset', resetLimiter, async (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: INVALID_LINK });
    return;
  }
  if (password.length < MIN_PASSWORD) {
    res.status(400).json({ error: `Lozinka mora imati bar ${MIN_PASSWORD} znaka.` });
    return;
  }
  const row = findReset('token_hash', hashResetToken(token));
  if (!isResetUsable(row, Date.now())) {
    res.status(400).json({ error: INVALID_LINK });
    return;
  }
  const user = get<{ banned: number }>('SELECT banned FROM users WHERE id = ?', [row.user_id]);
  if (!user) {
    res.status(400).json({ error: INVALID_LINK });
    return;
  }
  if (user.banned) {
    res.status(403).json({ error: 'Nalog je suspendovan.' });
    return;
  }

  const passwordHash = await hashPassword(password);
  // ponovo posle await-a: dva istovremena klika na isti link
  if (!isResetUsable(findReset('id', row.id), Date.now())) {
    res.status(400).json({ error: INVALID_LINK });
    return;
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, row.user_id]);
  // iskorisceni link i svi ostali otvoreni linkovi tog naloga prestaju da vaze
  run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [Date.now(), row.user_id]);
  res.json({ token: signToken(row.user_id) });
});
