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
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  await page.goto(URL);
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginEmail', `solo-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });

  await page.click('text=Napravi novu sobu');
  await page.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await page.inputValue('#roomCodeInput');
  check('room code shown before refresh', code.length === 5);

  console.log('--- refreshing page while alone in room (WAITING phase) ---');
  await page.reload();
  await page.waitForTimeout(1500);

  const roomScreenActive = await page.evaluate(() => document.getElementById('roomScreen').classList.contains('active'));
  check('after refresh, still on room screen (NOT dumped into empty table)', roomScreenActive);
  const codeAfterReload = await page.inputValue('#roomCodeInput');
  check('room code still visible/restored after refresh', codeAfterReload === code);
  const statusText = await page.textContent('#roomStatus');
  check('room status still shows the code / waiting message', statusText.includes(code));

  check('no uncaught JS errors', consoleErrors.length === 0);
  if (consoleErrors.length) console.log(consoleErrors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
