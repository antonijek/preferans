import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function registerAs(page, name, email) {
  const onLoginAlready = await page.evaluate(() => document.getElementById('loginScreen').classList.contains('active'));
  if (!onLoginAlready) await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', name);
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const A = await (await browser.newContext()).newPage();
  const B = await (await browser.newContext()).newPage();

  await Promise.all([A, B].map((p) => p.goto(URL)));

  console.log('--- visual: room screen no longer a dark modal overlay ---');
  await A.click('text=🌐 Igraj online');
  const loginBg = await A.evaluate(() => getComputedStyle(document.getElementById('loginScreen')).backgroundColor);
  console.log('loginScreen background:', loginBg);
  check('login screen background is NOT the old semi-transparent black overlay', loginBg !== 'rgba(0, 0, 0, 0.85)');

  await registerAs(A, 'Presence A', `pa-${stamp}@test.com`);
  const roomBg = await A.evaluate(() => getComputedStyle(document.getElementById('roomScreen')).backgroundColor);
  check('room screen background is also NOT the old dark overlay', roomBg !== 'rgba(0, 0, 0, 0.85)');

  console.log('--- presence: B sees A online before B even registers ---');
  await B.click('text=🌐 Igraj online');
  await B.fill('#loginName', 'Presence B');
  await B.fill('#loginEmail', `pb-${stamp}@test.com`);
  await B.fill('#loginPassword', 'test1234');
  await B.click('#loginScreen >> text=Registruj se');
  await B.waitForSelector('#roomScreen.active', { timeout: 5000 });
  await B.waitForFunction(() => document.getElementById('onlineUsersList').textContent.includes('Presence A'), { timeout: 5000 });
  check('B sees "Presence A" in the online-now list', true);

  const aSeesB = await A.evaluate(() => document.getElementById('onlineUsersList').textContent);
  console.log('what A sees (before next poll):', aSeesB.slice(0, 100));
  await A.waitForFunction(() => document.getElementById('onlineUsersList').textContent.includes('Presence B'), { timeout: 6000 });
  check('A also sees "Presence B" after the next 4s poll', true);

  console.log('--- disconnect: B leaves, presence list should drop them ---');
  await B.close();
  await A.waitForFunction(() => !document.getElementById('onlineUsersList').textContent.includes('Presence B'), { timeout: 8000 });
  check('after B disconnects, A stops seeing "Presence B"', true);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
