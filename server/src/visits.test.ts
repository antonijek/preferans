import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBot, visitDevice, visitSource } from './visits.js';

const FB_PHONE = 'Mozilla/5.0 (Linux; Android 15; 25028RN03Y) AppleWebKit/537.36 Chrome/156.0 Mobile Safari/537.36 [FB_IAB/FB4A]';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/605.1.15 Version/12.0.2 Safari/605.1.15';

test('posete: odakle je posetilac dosao', () => {
  assert.equal(visitSource('https://lm.facebook.com/', false), 'Facebook');
  assert.equal(visitSource('', true), 'Facebook');
  assert.equal(visitSource('https://www.google.rs/', false), 'Google');
  assert.equal(visitSource('https://www.bing.com/search?q=preferans', false), 'Bing');
  assert.equal(visitSource('https://l.instagram.com/', false), 'Instagram');
  assert.equal(visitSource('https://www.lora.igrajmo.online/', false), 'lora.igrajmo.online');
  assert.equal(visitSource('', false), 'direktno');
  assert.equal(visitSource('nije adresa', false), 'direktno');
  assert.equal(visitSource('https://notfacebook.com/', false), 'notfacebook.com');
});

test('posete: uredjaj i roboti', () => {
  assert.equal(visitDevice(FB_PHONE), 'telefon');
  assert.equal(visitDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148'), 'telefon');
  assert.equal(visitDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(visitDevice(MAC), 'računar');
  assert.equal(isBot(FB_PHONE), false);
  assert.equal(isBot(MAC), false);
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(isBot('facebookexternalhit/1.1'), true);
  assert.equal(isBot('Mozilla/5.0 HeadlessChrome/120.0'), true);
  assert.equal(isBot(''), true);
});
