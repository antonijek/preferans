// Slike igraca (umesto slova u kruzicu, po uzoru na Loru, korisnik 2026-10-25). Pregledac sam
// isece sliku u kvadrat 256x256 i salje je kao fajl (ne JSON — express.json ima granicu 100 KB);
// ovde se proveri da je stvarno slika i da je mala, pa ide u fajl pored baze (AVATAR_DIR), ne u
// bazu — sql.js upisuje celu bazu na disk posle svake promene. Adresa nosi verziju (?v=), pa
// pregledac sme da je cuva zauvek.

import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { get, run } from './db.js';
import { requireAuth } from './auth/middleware.js';
import type { AuthedRequest } from './auth/middleware.js';
import { rateLimit } from './rateLimit.js';
import { notifyOwner } from './push.js';

const AVATAR_DIR = path.resolve(
  process.env.AVATAR_DIR || path.join(path.dirname(path.resolve(process.env.DB_PATH || './data.db')), 'avatars')
);
export const MAX_AVATAR_BYTES = 80 * 1024;

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/webp': {
    ext: 'webp',
    magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
};
const MIME_BY_EXT: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

/** Ekstenzija ako je telo zahteva stvarno slika najavljenog tipa i nije prevelika, inace greska za korisnika. */
export function checkAvatar(contentType: string, body: unknown): { ext: string } | { error: string } {
  const type = TYPES[contentType.split(';')[0]!.trim().toLowerCase()];
  if (!type || !Buffer.isBuffer(body) || body.length === 0) return { error: 'To nije slika.' };
  if (body.length > MAX_AVATAR_BYTES) return { error: 'Slika je prevelika.' };
  return type.magic(body) ? { ext: type.ext } : { error: 'To nije slika.' };
}

function fileOf(userId: number): string | null {
  for (const ext of Object.keys(MIME_BY_EXT)) {
    const f = path.join(AVATAR_DIR, `${userId}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function removeFiles(userId: number): void {
  for (const ext of Object.keys(MIME_BY_EXT)) fs.rmSync(path.join(AVATAR_DIR, `${userId}.${ext}`), { force: true });
}

/** Adresa slike igraca ili null ako je nema. */
export function avatarUrl(userId: number | null): string | null {
  if (userId === null) return null;
  const v = get<{ avatar_v: number | null }>('SELECT avatar_v FROM users WHERE id = ?', [userId])?.avatar_v;
  return v ? `/api/avatar/${userId}?v=${v}` : null;
}

/** Ukloni sliku (igrac sam, admin iz panela ili brisanje naloga). */
export function removeAvatar(userId: number): void {
  removeFiles(userId);
  run('UPDATE users SET avatar_v = NULL WHERE id = ?', [userId]);
}

export const avatarRouter = Router();

avatarRouter.post(
  '/',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyPrefix: 'avatar', message: 'Previše slika za sat vremena.' }),
  requireAuth,
  // malo vise od MAX_AVATAR_BYTES, da preveliku sliku odbije checkAvatar sa porukom na srpskom
  express.raw({ type: Object.keys(TYPES), limit: MAX_AVATAR_BYTES * 2 }),
  (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const checked = checkAvatar(String(req.headers['content-type'] ?? ''), req.body);
    if ('error' in checked) {
      res.status(400).json({ error: checked.error });
      return;
    }
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    removeFiles(userId);
    fs.writeFileSync(path.join(AVATAR_DIR, `${userId}.${checked.ext}`), req.body as Buffer);
    run('UPDATE users SET avatar_v = ? WHERE id = ?', [Date.now(), userId]);
    const user = get<{ name: string | null; email: string; is_admin: number }>(
      'SELECT name, email, is_admin FROM users WHERE id = ?',
      [userId]
    );
    // admin odmah vidi novu sliku i moze da je ukloni (admin panel → Korisnici)
    if (user && !user.is_admin) {
      notifyOwner('Nova slika igrača', `${user.name || user.email} — pogledaj u admin panelu (Korisnici).`, '/admin.html')
        .catch((err) => console.error('[PUSH]', err));
    }
    res.json({ ok: true, url: avatarUrl(userId) });
  }
);

avatarRouter.delete('/', requireAuth, (req: AuthedRequest, res) => {
  removeAvatar(req.userId!);
  res.json({ ok: true });
});

avatarRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const f = Number.isInteger(id) && id > 0 ? fileOf(id) : null;
  if (!f) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // adresa nosi verziju
  res.type(MIME_BY_EXT[path.extname(f).slice(1)]!).sendFile(f);
});
