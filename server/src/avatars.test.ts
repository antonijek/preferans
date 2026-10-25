import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAvatar, MAX_AVATAR_BYTES } from './avatars.js';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(100)]);

test('prava slika prolazi, sa ekstenzijom po tipu', () => {
  assert.deepEqual(checkAvatar('image/png', png), { ext: 'png' });
  assert.deepEqual(checkAvatar('image/jpeg', jpeg), { ext: 'jpg' });
  assert.deepEqual(checkAvatar('image/webp; charset=binary', webp), { ext: 'webp' });
});

test('lažna, prazna, nepoznata ili prevelika slika se odbija', () => {
  assert.deepEqual(checkAvatar('image/png', jpeg), { error: 'To nije slika.' }); // tip ne odgovara sadrzaju
  assert.deepEqual(checkAvatar('image/png', Buffer.from('<svg onload=alert(1)>')), { error: 'To nije slika.' });
  assert.deepEqual(checkAvatar('image/svg+xml', png), { error: 'To nije slika.' });
  assert.deepEqual(checkAvatar('image/png', Buffer.alloc(0)), { error: 'To nije slika.' });
  assert.deepEqual(checkAvatar('image/png', undefined), { error: 'To nije slika.' });
  const big = Buffer.concat([png, Buffer.alloc(MAX_AVATAR_BYTES)]);
  assert.deepEqual(checkAvatar('image/png', big), { error: 'Slika je prevelika.' });
});
