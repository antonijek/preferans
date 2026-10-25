import { createHash, randomBytes } from 'node:crypto';

// "Zaboravili ste lozinku?" (korisnikov zahtev 2026-10-22: igraci su pravili nove naloge jer nisu
// mogli da vrate stari) — ciste funkcije, bez baze i mreze. Ruta je u passwordReset.ts.

export const RESET_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD = 4;

// Adresa u linku nikad ne dolazi od klijenta — samo ovi sajtovi.
export const RESET_APPS = {
  lora: { name: 'Lora', url: 'https://lora.igrajmo.online/' },
  preferans: { name: 'Preferans online', url: 'https://preferans.igrajmo.online/' },
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

export function resetMail(app: ResetApp, name: string, link: string): { subject: string; text: string } {
  const site = RESET_APPS[app].name;
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
      '',
      site,
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
