// Posete sajtu (korisnikov zahtev 2026-11-03: "kako da to pratim"): sajt pri otvaranju javi odakle je
// posetilac dosao i sa kog uredjaja, a kasnije i da li je poceo igru. Bez IP adrese — posetilac je
// nasumican broj koji sajt cuva u pregledacu, da se vidi kad se neko vrati. Admin gleda spisak na "Pregled".

import { Router } from 'express';
import type { Request } from 'express';
import { all, get, run } from './db.js';
import { requireAdmin, verifyToken } from './auth/middleware.js';
import { rateLimit } from './rateLimit.js';

// ponovno otvaranje u ovom roku je ista poseta (osvezavanje, prelazak na "Vodic" i nazad)
const SAME_VISIT = '-30 minutes';
const VISITOR_RE = /^[\w-]{8,64}$/;
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit/i;

export function isBot(userAgent: string): boolean {
  return userAgent === '' || BOT_RE.test(userAgent);
}

export function visitDevice(userAgent: string): string {
  if (/iPad|Tablet/i.test(userAgent)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(userAgent)) return 'telefon';
  return 'računar';
}

/** Odakle je posetilac dosao: Facebook, Google, Bing, direktno ili ime drugog sajta (prelaz unutar sajta klijent ne salje). */
export function visitSource(referrer: string, fromFacebookLink: boolean): string {
  if (fromFacebookLink) return 'Facebook';
  let host: string;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return 'direktno'; // prazan ili neispravan referrer: uneta adresa, sacuvan link, instalirana aplikacija
  }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'Facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram';
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'Google';
  if (/(^|\.)bing\.com$/.test(host)) return 'Bing';
  return host.slice(0, 60);
}

function userIdFrom(req: Request): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return verifyToken(header.slice('Bearer '.length)).userId;
  } catch {
    return null; // istekao token: poseta se belezi kao od gosta
  }
}

function visitorFrom(body: unknown): string | null {
  const visitor = (body as Record<string, unknown> | undefined)?.visitor;
  return typeof visitor === 'string' && VISITOR_RE.test(visitor) ? visitor : null;
}

export const visitRouter = Router();
const visitLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, keyPrefix: 'visit', message: 'Previše zahteva.' });

visitRouter.post('/', visitLimit, (req, res) => {
  const visitor = visitorFrom(req.body);
  const userAgent = req.headers['user-agent'] ?? '';
  if (!visitor || isBot(userAgent)) {
    res.json({ ok: true });
    return;
  }
  const userId = userIdFrom(req);
  const recent = get<{ id: number }>(
    `SELECT id FROM visits WHERE visitor = ? AND last_at >= datetime('now', '${SAME_VISIT}') ORDER BY id DESC LIMIT 1`,
    [visitor],
  );
  if (recent) {
    run("UPDATE visits SET last_at = datetime('now'), user_id = COALESCE(?, user_id) WHERE id = ?", [userId, recent.id]);
  } else {
    const ref = typeof req.body.ref === 'string' ? req.body.ref : '';
    const source = visitSource(ref, req.body.fb === true);
    run('INSERT INTO visits (visitor, source, device, installed, user_id) VALUES (?, ?, ?, ?, ?)',
      [visitor, source, visitDevice(userAgent), req.body.app === true ? 1 : 0, userId]);
  }
  res.json({ ok: true });
});

// poceo igru: protiv racunara (bez servera) ili online
visitRouter.post('/played', visitLimit, (req, res) => {
  const visitor = visitorFrom(req.body);
  const column = req.body?.kind === 'online' ? 'played_online' : req.body?.kind === 'local' ? 'played_local' : null;
  if (visitor && column) {
    run(`UPDATE visits SET ${column} = 1, last_at = datetime('now') WHERE id =
      (SELECT id FROM visits WHERE visitor = ? AND last_at >= datetime('now', '-12 hours') ORDER BY id DESC LIMIT 1)`,
    [visitor]);
  }
  res.json({ ok: true });
});

export const visitsAdminRouter = Router();
visitsAdminRouter.use(requireAdmin);

visitsAdminRouter.get('/', (_req, res) => {
  // server radi po srpskom vremenu (CET), pa je 'localtime' nas dan
  const today = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM visits WHERE date(created_at, 'localtime') = date('now', 'localtime')",
  )?.c ?? 0;
  const visits = all(
    `SELECT v.id, v.source, v.device, v.installed, v.played_local, v.played_online, v.created_at, v.last_at,
       u.name AS user_name,
       (SELECT COUNT(*) FROM visits p WHERE p.visitor = v.visitor AND p.id < v.id) AS earlier
     FROM visits v LEFT JOIN users u ON u.id = v.user_id ORDER BY v.id DESC LIMIT 100`,
  );
  res.json({ today, visits });
});
