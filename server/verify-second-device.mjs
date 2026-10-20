import { chromium } from 'playwright';

// "Igraš na drugom uređaju" (session-replaced.js + socket/index.ts): isti
// nalog na dva uredjaja — stariji dobija prozor i staje, "Igraj ovde" ga
// vraca, a tad staje onaj drugi. Igrac koji je seo u sobu ostaje u njoj.

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

const dialogTitle = (p) => p.evaluate(() => (document.getElementById('appDialog')?.open
  ? document.getElementById('appDialogTitle').textContent : null));

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const email = `dev-${stamp}@test.com`;
  const [A, B] = await Promise.all([1, 2].map(() => browser.newContext().then((c) => c.newPage())));
  const errors = [];
  [A, B].forEach((p, i) => p.on('pageerror', (e) => errors.push(`page${'AB'[i]}: ${e.message}`)));

  await A.goto(URL);
  await A.click('[onclick="goOnline()"]');
  await A.fill('#loginName', 'Dva Uredjaja');
  await A.fill('#loginEmail', email);
  await A.fill('#loginPassword', 'test1234');
  await A.click('#loginScreen [onclick="doRegister()"]');
  await A.waitForSelector('#homeScreen.active', { timeout: 5000 });
  await A.click('[onclick="goToRoomScreen()"]');
  await A.click('[onclick="createRoomOnline()"]');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');

  await B.goto(URL);
  await B.click('[onclick="goOnline()"]');
  await B.fill('#loginEmail', email);
  await B.fill('#loginPassword', 'test1234');
  await B.click('#loginScreen [onclick="doLogin()"]');
  await B.waitForSelector('#roomScreen.active', { timeout: 8000 });
  check('drugi uredjaj ulazi u istu sobu', (await B.inputValue('#roomCodeInput')) === code);

  await A.waitForSelector('#appDialog[open]', { timeout: 5000 });
  check('stariji uredjaj: "Igraš na drugom uređaju"', (await dialogTitle(A)) === 'Igraš na drugom uređaju');
  await A.keyboard.press('Escape');
  await A.waitForTimeout(300);
  check('Esc ne zatvara prozor', (await dialogTitle(A)) !== null);

  await A.click('#appDialogOk');
  await B.waitForSelector('#appDialog[open]', { timeout: 5000 });
  check('posle "Igraj ovde" staje drugi uredjaj', (await dialogTitle(B)) === 'Igraš na drugom uređaju');
  await A.waitForSelector('#roomScreen.active', { timeout: 8000 });
  check('"Igraj ovde" vraca u istu sobu', (await A.inputValue('#roomCodeInput')) === code && (await dialogTitle(A)) === null);

  check('nema JS gresaka', errors.length === 0);
  if (errors.length) console.log(errors);
  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
