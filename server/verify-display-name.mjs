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
  const [A, B, C] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));

  console.log('--- registration WITHOUT a name should be rejected ---');
  await A.click('text=🌐 Igraj online');
  await A.fill('#loginEmail', `noname-${stamp}@test.com`);
  await A.fill('#loginPassword', 'test1234');
  await A.click('#loginScreen >> text=Registruj se');
  await A.waitForTimeout(300);
  const errorText = await A.textContent('#loginError');
  check('missing-name registration shows an error, does not proceed', errorText.trim().length > 0);
  const stillOnLogin = await A.evaluate(() => document.getElementById('loginScreen').classList.contains('active'));
  check('still on login screen after rejected registration', stillOnLogin);

  console.log('--- now register properly with real names ---');
  await registerAs(A, 'Petar', `namea-${stamp}@test.com`);
  await registerAs(B, 'Milica', `nameb-${stamp}@test.com`);
  await registerAs(C, 'Nikola', `namec-${stamp}@test.com`);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  const seatNames = await A.evaluate(() => [
    document.getElementById('name-south').textContent,
    document.getElementById('name-east').textContent,
    document.getElementById('name-west').textContent,
  ]);
  console.log('seat names:', seatNames);
  check('seats show the chosen NAMES (Petar/Milica/Nikola), not emails', seatNames.some((n) => ['Petar', 'Milica', 'Nikola'].includes(n)));
  check('seats do NOT show raw email addresses', !seatNames.some((n) => n.includes('@test.com')));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
