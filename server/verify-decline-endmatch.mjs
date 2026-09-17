import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function registerAs(page, letter, stamp) {
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', `Test-${letter}`);
  await page.fill('#loginEmail', `${letter}-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
  await page.click('text=🎮 Sobe — napravi ili se pridruži');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([1, 2, 3].map(() => browser.newContext().then((c) => c.newPage())));
  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'dA', stamp);
  await registerAs(B, 'dB', stamp);
  await registerAs(C, 'dC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  console.log('--- A proposes early end, B declines ---');
  await A.click('#matchMenuBtn');
  await A.click('text=🤝 Predloži prekid partije');
  await A.click('#endMatchBanners button:has-text("Predloži")');
  await A.waitForTimeout(500);

  const declineBtn = B.locator('#endMatchBanners button:has-text("Odbij")');
  check('B sees a Decline button for the proposal', (await declineBtn.count()) > 0);
  await declineBtn.click();
  await A.waitForTimeout(500);

  const phaseAfterDecline = await A.evaluate(() => window.game?.state?.phase);
  console.log('Phase after decline:', phaseAfterDecline);
  check('match did NOT end after a decline (still mid-hand phase, not MATCH_OVER)', phaseAfterDecline !== 'MATCH_OVER');

  const aToast = await A.textContent('#appToast');
  console.log('A toast after decline:', aToast);
  check('proposer (A) sees the decline notice', aToast.includes('odbijen'));

  const bannerGoneOnA = await A.evaluate(() => document.getElementById('endMatchBanners').children.length === 0);
  check('the end-match banner cleared on A after the decline', bannerGoneOnA);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
