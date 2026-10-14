// Obaveštenja adminu na telefon (Web Push): kad je neko online sam (nema
// s kim da igra) — da admin udje i odigra s njim, pa igrač ne ode odmah.
// Korisnikov zahtev (2026-10-12), isti obrazac kao Lora (D:\lora\server\src\push.ts).
// Pretplaćuje se samo admin, iz admin panela. VAPID ključevi se prave sami
// pri prvom pokretanju i čuvaju u data.db (nikad u git ni .env).

import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { all, get, run } from './db.js';

/** Testovi: ništa se ne šalje, obaveštenja se samo pamte (GET /api/admin/push/sent). */
const DRY_RUN = !!process.env.PUSH_DRY_RUN;
export const dryRunLog: { title: string; body: string }[] = [];

/** "Neko je sam online" najviše jednom u ovom periodu (osvežavanja i prekidi veze se ne broje). */
const ALONE_COOLDOWN_MS = Number(process.env.ALONE_COOLDOWN_MS ?? 30 * 60 * 1000);
let lastAloneAt = 0;

let publicKey = '';

export function initPush(): void {
  const row = get<{ v: string }>("SELECT v FROM settings WHERE k = 'vapid'");
  const keys = row ? JSON.parse(row.v) as { publicKey: string; privateKey: string } : webpush.generateVAPIDKeys();
  if (!row) run("INSERT INTO settings (k, v) VALUES ('vapid', ?)", [JSON.stringify(keys)]);
  webpush.setVapidDetails('https://preferans.igrajmo.online', keys.publicKey, keys.privateKey);
  publicKey = keys.publicKey;
}

export const pushPublicKey = () => publicKey;

export function pushCount(userId: number): number {
  return get<{ c: number }>('SELECT COUNT(*) AS c FROM push_subs WHERE user_id = ?', [userId])?.c ?? 0;
}

/** Sačuvaj pretplatu pregledača. Neispravna (bez https adrese i ključeva) → false. */
export function savePushSub(userId: number, sub: unknown): boolean {
  const s = sub as PushSubscription | null;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000
    || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return false;
  const clean = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } };
  run(`INSERT INTO push_subs (endpoint, user_id, sub_json) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, sub_json = excluded.sub_json`,
    [clean.endpoint, userId, JSON.stringify(clean)]);
  // najviše 5 uređaja po nalogu — najstariji ispada
  run(`DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN
       (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5)`, [userId, userId]);
  return true;
}

export function removePushSub(userId: number, endpoint: unknown): void {
  if (typeof endpoint === 'string') run('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', [endpoint, userId]);
}

type SubRow = { endpoint: string; sub_json: string };

/** Pošalji datim pretplatama. Vraća koliko je poslato; ugašene pretplate (404/410) briše. */
async function sendToSubs(subs: SubRow[], payload: string, ttl: number): Promise<number> {
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(JSON.parse(s.sub_json), payload, { TTL: ttl, urgency: 'high' });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) run('DELETE FROM push_subs WHERE endpoint = ?', [s.endpoint]);
      else console.error('[PUSH] slanje nije uspelo:', code ?? err);
    }
  }));
  return sent;
}

/** Pošalji adminu (svim uređajima admin naloga). */
export async function notifyOwner(title: string, body: string, url = '/'): Promise<number> {
  if (DRY_RUN) { dryRunLog.push({ title, body }); return 1; }
  // od 2026-10-14 se pretplacuju i igraci — adminu idu samo admin uredjaji
  const subs = all<SubRow>(
    'SELECT p.endpoint, p.sub_json FROM push_subs p JOIN users u ON u.id = p.user_id WHERE u.is_admin = 1'
  );
  // 10 min: "neko čeka partiju" posle toga više ne važi
  return sendToSubs(subs, JSON.stringify({ title, body, url }), 600);
}

// === Obavestenja igracima (korisnikov zahtev 2026-10-14) ===
// "Tvoj potez", "neko je seo za tvoj sto", "revans" — salje se SAMO kad
// igrac nije na stranici (ugasen ekran, druga aplikacija); pozivalac to
// proverava. Ista vrsta obavestenja najvise jednom u USER_COOLDOWN_MS.
const USER_COOLDOWN_MS = 60 * 1000;
const lastUserNotice = new Map<string, number>();

export function notifyUser(userId: number, kind: string, title: string, body: string, url = '/'): void {
  const key = `${userId}:${kind}`;
  const now = Date.now();
  if (now - (lastUserNotice.get(key) ?? 0) < USER_COOLDOWN_MS) return;
  lastUserNotice.set(key, now);
  if (DRY_RUN) { dryRunLog.push({ title, body }); return; }
  const subs = all<SubRow>('SELECT endpoint, sub_json FROM push_subs WHERE user_id = ?', [userId]);
  if (subs.length === 0) return;
  // 2 min: posle toga je potez ionako odigran (vreme za potez)
  sendToSubs(subs, JSON.stringify({ title, body, url, tag: `preferans-${kind}` }), 120)
    .catch(err => console.error('[PUSH]', err));
}

/**
 * Igrač (ne admin) se povezao. Adminu javi SAMO ako je trenutno sam (niko
 * drugi online) — cooldown sprečava ponovno javljanje za isti "sam" period
 * (reconnect/refresh se ne broji).
 */
export function playerArrived(name: string, othersOnline: number): void {
  if (othersOnline > 0) return;
  const now = Date.now();
  const aloneAgain = now - lastAloneAt < ALONE_COOLDOWN_MS;
  lastAloneAt = now;
  if (aloneAgain) return;
  notifyOwner('Neko čeka partiju', `${name} je online, a nema drugih igrača. Uđi da odigrate!`)
    .catch(err => console.error('[PUSH]', err));
}
