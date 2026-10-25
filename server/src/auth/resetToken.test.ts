import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashResetToken,
  isResetApp,
  isResetUsable,
  newResetToken,
  resetLink,
  resetMail,
  RESET_APPS,
} from './resetToken.js';

test('token: svaki put nov, a hash uvek isti za isti token', () => {
  const a = newResetToken();
  const b = newResetToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashResetToken(a.token));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.ok(a.token.length >= 40);
});

test('sajt za link: samo poznati, ne bilo sta od klijenta', () => {
  assert.equal(isResetApp('lora'), true);
  assert.equal(isResetApp('preferans'), true);
  for (const bad of ['https://zlo.com', '__proto__', 'toString', '', null, 7]) assert.equal(isResetApp(bad), false);
});

test('link vodi na sajt igre i nosi token', () => {
  const link = resetLink('lora', 'ab-c_d');
  assert.equal(link, `${RESET_APPS.lora.url}?reset=ab-c_d`);
});

test('poruka: ime igraca, link i ime sajta', () => {
  const mail = resetMail('lora', 'Ana', 'https://lora.igrajmo.online/?reset=x');
  assert.equal(mail.subject, 'Nova lozinka za Lora');
  assert.match(mail.text, /^Zdravo, Ana!/);
  assert.ok(mail.text.includes('https://lora.igrajmo.online/?reset=x'));
  assert.match(mail.text, /sat vremena/);
});

test('link vazi samo dok nije iskoriscen i dok nije istekao', () => {
  const now = 1_000_000;
  const row = { id: 1, user_id: 5, expires_at: now + 1, used_at: null };
  assert.equal(isResetUsable(row, now), true);
  assert.equal(isResetUsable(undefined, now), false);
  assert.equal(isResetUsable({ ...row, used_at: now - 5 }, now), false);
  assert.equal(isResetUsable({ ...row, expires_at: now }, now), false);
});
