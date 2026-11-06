import { createHash, randomBytes } from 'node:crypto';

// "Zaboravili ste lozinku?" (korisnikov zahtev 2026-10-22: igraci su pravili nove naloge jer nisu
// mogli da vrate stari) — ciste funkcije, bez baze i mreze. Ruta je u passwordReset.ts.

export const RESET_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD = 4;

// Adresa u linku nikad ne dolazi od klijenta — samo ovi sajtovi.
export const RESET_APPS = {
  lora: { name: 'Lora', url: 'https://lora.igrajmo.online/' },
  preferans: { name: 'Preferans online', url: 'https://preferans.igrajmo.online/' },
  jamb: { name: 'Jamb', url: 'https://jamb.igrajmo.online/' },
} as const;
export type ResetApp = keyof typeof RESET_APPS;

export function isResetApp(value: unknown): value is ResetApp {
  return typeof value === 'string' && Object.hasOwn(RESET_APPS, value);
}

// U bazi je samo hash, pa ni kopija baze ne daje upotrebljiv link.
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newResetToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashResetToken(token) };
}

export function resetLink(app: ResetApp, token: string): string {
  return `${RESET_APPS[app].url}?reset=${encodeURIComponent(token)}`;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

// Programi za poštu ne znaju CSS promenljive sajta, pa su boje dugmeta (iste kao na sajtovima) ovde.
const MAIL_COLORS = { button: '#f2c14e', buttonInk: '#2b2100', ink: '#1d2b23', muted: '#555555', link: '#1a5fb4' };

const SPAM_HINT = 'Ako je poruka stigla u Spam (Neželjeno), označite je sa „Nije spam“ — tada link proradi.';

// Korisnik (2026-11-06): u mejlu je bio samo tekst, pa je link morao da kopira u pregledač.
// Sada mejl ima i HTML deo sa dugmetom; tekst ostaje za programe koji HTML ne prikazuju.
export function resetMail(
  app: ResetApp,
  name: string,
  link: string
): { subject: string; text: string; html: string } {
  const site = RESET_APPS[app].name;
  const c = MAIL_COLORS;
  const safeName = escapeHtml(name);
  const safeSite = escapeHtml(site);
  const safeLink = escapeHtml(link);
  const small = `font-size:14px;color:${c.muted}`;
  const button =
    `display:inline-block;padding:14px 26px;background:${c.button};color:${c.buttonInk};` +
    'font-weight:bold;text-decoration:none;border-radius:10px';
  return {
    subject: `Nova lozinka za ${site}`,
    text: [
      `Zdravo, ${name}!`,
      '',
      `Zatražena je nova lozinka za vaš nalog na sajtu ${site}.`,
      'Otvorite ovaj link i upišite novu lozinku:',
      '',
      link,
      '',
      'Link važi sat vremena i može da se iskoristi samo jednom.',
      'Ako niste vi tražili novu lozinku, zanemarite ovu poruku — stara lozinka ostaje.',
      SPAM_HINT,
      '',
      site,
    ].join('\n'),
    html: [
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${c.ink};max-width:480px">`,
      `<p>Zdravo, ${safeName}!</p>`,
      `<p>Zatražena je nova lozinka za vaš nalog na sajtu ${safeSite}.</p>`,
      `<p style="margin:28px 0"><a href="${safeLink}" style="${button}">Postavi novu lozinku</a></p>`,
      `<p style="${small}">Ako dugme ne radi, otvorite ovaj link:<br>` +
        `<a href="${safeLink}" style="color:${c.link};word-break:break-all">${safeLink}</a></p>`,
      `<p style="${small}">Link važi sat vremena i može da se iskoristi samo jednom.<br>` +
        'Ako niste vi tražili novu lozinku, zanemarite ovu poruku — stara lozinka ostaje.<br>' +
        `${escapeHtml(SPAM_HINT)}</p>`,
      `<p>${safeSite}</p>`,
      '</div>',
    ].join('\n'),
  };
}

export interface ResetRow {
  id: number;
  user_id: number;
  expires_at: number;
  used_at: number | null;
}

export function isResetUsable(row: ResetRow | undefined, now: number): row is ResetRow {
  return !!row && row.used_at === null && row.expires_at > now;
}
