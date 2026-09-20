// Slanje email-ova (korisnikov zahtev 2026-09-20 — admin panel treba da
// moze da posalje email jednom ili svim registrovanim korisnicima, npr.
// da obavesti novog posetioca da je sajt jos u izradi). SMTP kredencijali
// dolaze iz server/.env (isti Gmail nalog vec koriscen za Quench projekat,
// vidi feedback_email_setup memoriju za kontekst) — NIKAD ne hardkodovati
// ovde, .env je gitignored.

import nodemailer from 'nodemailer';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export function isMailConfigured(): boolean {
  return getTransporter() !== null;
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const t = getTransporter();
  if (!t) throw new Error('SMTP nije podesen (SMTP_HOST/SMTP_USER/SMTP_PASS u .env)');
  const fromName = process.env.SMTP_FROM_NAME ?? 'Preferans online';
  await t.sendMail({
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
}
