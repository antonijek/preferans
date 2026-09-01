import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const page = await (await browser.newContext()).newPage();

  await page.goto(URL);
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', 'Home Test');
  await page.fill('#loginEmail', `home-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');

  console.log('--- lands on homeScreen FIRST, not roomScreen ---');
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
  check('homeScreen is active right after login', true);
  const roomActive = await page.evaluate(() => document.getElementById('roomScreen').classList.contains('active'));
  check('roomScreen is NOT active yet', !roomActive);

  await page.waitForFunction(() => document.getElementById('homeGreeting').textContent.includes('Home Test'), { timeout: 3000 });
  check('greeting shows the chosen name', true);
  await page.waitForFunction(() => document.getElementById('homeOnlineCount').textContent.includes('online'), { timeout: 3000 });
  check('online count populated', true);

  console.log('--- click through to room screen ---');
  await page.click('text=🎮 Sobe — napravi ili se pridruži');
  await page.waitForSelector('#roomScreen.active', { timeout: 3000 });
  check('clicking through reaches roomScreen', true);

  console.log('--- back button returns to home, not setup/local mode ---');
  await page.click('#roomScreen >> text=← Nazad');
  await page.waitForSelector('#homeScreen.active', { timeout: 3000 });
  check('back button from room returns to homeScreen (not setup)', true);

  console.log('--- reload while idle (no room) still lands on home, not room ---');
  await page.reload();
  await page.waitForTimeout(1500);
  const onHomeAfterReload = await page.evaluate(() => document.getElementById('homeScreen').classList.contains('active'));
  check('reload with no active room lands back on homeScreen', onHomeAfterReload);

  console.log('--- create a room: should redirect to roomScreen with the code ---');
  await page.click('text=🎮 Sobe — napravi ili se pridruži');
  await page.click('text=Napravi novu sobu');
  await page.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  check('room created, code visible on roomScreen', true);

  console.log('--- reload while WAITING for players redirects straight to roomScreen (not home) ---');
  await page.reload();
  await page.waitForTimeout(1500);
  const onRoomAfterReload = await page.evaluate(() => document.getElementById('roomScreen').classList.contains('active'));
  check('reload while in a WAITING room lands on roomScreen (room:info redirect)', onRoomAfterReload);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
