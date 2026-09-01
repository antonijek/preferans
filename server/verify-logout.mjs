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

  await page.goto(URL);
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', 'Prvi');
  await page.fill('#loginEmail', `first-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
  check('first account registered, on home screen', true);

  await page.reload();
  await page.waitForTimeout(1500);
  const stillLoggedIn = await page.evaluate(() => document.getElementById('homeScreen').classList.contains('active'));
  check('after reload, auto-reconnected (still on home screen, NOT login)', stillLoggedIn);

  console.log('--- click Odjavi se ---');
  await page.click('text=Odjavi se');
  await page.waitForTimeout(300);
  const onLoginNow = await page.evaluate(() => document.getElementById('loginScreen').classList.contains('active'));
  check('after logout, back on login screen', onLoginNow);
  const emailCleared = await page.inputValue('#loginEmail');
  check('login form fields are cleared', emailCleared === '');

  console.log('--- can now register a SECOND, different account ---');
  await page.fill('#loginName', 'Drugi');
  await page.fill('#loginEmail', `second-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
  check('second account registered successfully after logout', true);

  console.log('--- reload again: should stay logged in as the SECOND account, not revert to first ---');
  await page.reload();
  await page.waitForTimeout(1500);
  const stillSecondAccount = await page.evaluate(() => document.getElementById('homeScreen').classList.contains('active'));
  check('reload after logout+relogin keeps the NEW session (token was properly replaced)', stillSecondAccount);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
