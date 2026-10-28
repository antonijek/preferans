// Primedbe, predlozi i pohvale igraca (korisnikov zahtev 2026-10-28): salju svi, i gosti koji igraju
// protiv racunara bez naloga. Adminu stize obavestenje na telefon, poruke cita u admin panelu
// (kartica "Utisci"). Uz poruku iz partije ide i trenutna ruka, da se greska moze ponovo odigrati.

import { Router } from 'express';
import type { Request } from 'express';
import { all, get, run } from './db.js';
import { requireAdmin, verifyToken } from './auth/middleware.js';
import { rateLimit } from './rateLimit.js';
import { notifyOwner } from './push.js';

export const FEEDBACK_KINDS = ['bug', 'idea', 'praise'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Greška', idea: 'Predlog', praise: 'Pohvala' };
export const MAX_MESSAGE = 1000;
const MAX_CONTACT = 100;
const MAX_CONTEXT = 20_000;

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  contact: string | null;
  context: string | null;
}

/** Proveri poruku sa sajta: vraca ociscen unos ili gresku za prikaz igracu. */
export function parseFeedback(body: unknown): FeedbackInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = FEEDBACK_KINDS.find((k) => k === b.kind);
  if (!kind) return { error: 'Izaberi vrstu poruke.' };
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (message.length < 3) return { error: 'Napiši bar par reči.' };
  if (message.length > MAX_MESSAGE) return { error: `Poruka može imati najviše ${MAX_MESSAGE} znakova.` };
  const contact = typeof b.contact === 'string' && b.contact.trim() ? b.contact.trim().slice(0, MAX_CONTACT) : null;
  // ruka iz partije je samo pomoc pri trazenju greske — prevelika se ne cuva, poruka ide svejedno
  const json = b.context && typeof b.context === 'object' ? JSON.stringify(b.context) : null;
  return { kind, message, contact, context: json && json.length <= MAX_CONTEXT ? json : null };
}

/** Prijavljen igrac (ako je poslao vazeci token), inace gost. */
function senderId(req: Request): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return verifyToken(header.slice('Bearer '.length)).userId;
  } catch {
    return null; // istekao ili neispravan token: poruka stize kao od gosta
  }
}

export const feedbackRouter = Router();

feedbackRouter.post(
  '/',
  rateLimit({
    windowMs: 60 * 60 * 1000, max: 5, keyPrefix: 'feedback',
    message: 'Poslao si više poruka za kratko vreme. Pokušaj ponovo za sat vremena.',
  }),
  (req, res) => {
    // skriveno polje koje popunjavaju samo automatski programi
    if (typeof req.body?.website === 'string' && req.body.website !== '') {
      res.json({ ok: true });
      return;
    }
    const input = parseFeedback(req.body);
    if ('error' in input) {
      res.status(400).json({ error: input.error });
      return;
    }
    const userId = senderId(req);
    const user = userId === null ? undefined : get<{ name: string; banned: number }>(
      'SELECT name, banned FROM users WHERE id = ?', [userId],
    );
    if (user?.banned) {
      res.status(403).json({ error: 'Nalog je suspendovan.' });
      return;
    }
    run('INSERT INTO feedback (kind, message, contact, context_json, user_id) VALUES (?, ?, ?, ?, ?)',
      [input.kind, input.message, input.contact, input.context, user ? userId : null]);
    const who = user?.name ?? input.contact ?? 'gost';
    notifyOwner(`${KIND_LABEL[input.kind]} — ${who}`, input.message.slice(0, 120), '/admin.html#utisci')
      .catch((err) => console.error('[PUSH]', err));
    res.json({ ok: true });
  },
);

export const feedbackAdminRouter = Router();
feedbackAdminRouter.use(requireAdmin);

feedbackAdminRouter.get('/', (_req, res) => {
  const feedback = all(
    `SELECT f.id, f.kind, f.message, f.contact, f.context_json, f.is_read, f.created_at, u.name AS user_name
     FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 200`,
  );
  const unread = get<{ c: number }>('SELECT COUNT(*) AS c FROM feedback WHERE is_read = 0')?.c ?? 0;
  res.json({ feedback, unread });
});

feedbackAdminRouter.post('/:id/read', (req, res) => {
  run('UPDATE feedback SET is_read = ? WHERE id = ?', [req.body?.read === false ? 0 : 1, Number(req.params.id)]);
  res.json({ ok: true });
});

feedbackAdminRouter.delete('/:id', (req, res) => {
  run('DELETE FROM feedback WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});
