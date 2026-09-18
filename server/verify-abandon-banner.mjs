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
  const errors = [];
  [A, B, C].forEach((p, i) => {
    p.on('pageerror', (e) => errors.push(`page${i}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`page${i}: ${m.text()}`); });
  });

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'abA', stamp);
  await registerAs(B, 'abB', stamp);
  await registerAs(C, 'abC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  console.log('--- A leaves the match ---');
  await A.click('#matchMenuBtn');
  await A.click('text=🏳️ Napusti svakako');
  await A.waitForSelector('#leaveConfirmBtn', { timeout: 3000 });
  await A.click('#leaveConfirmBtn');
  await A.waitForSelector('#homeScreen.active', { timeout: 5000 });

  await B.waitForTimeout(700);
  console.log('--- checking B sees the new abandon banner ---');
  const bannerText = await B.textContent('.abandon-notice-banner').catch(() => null);
  console.log('B banner text:', bannerText);
  check('B sees the abandon-notice banner', !!bannerText);
  check('banner mentions the leaver name', (bannerText ?? '').includes('Test-abA'));
  check('banner asks the end-or-continue question', (bannerText ?? '').includes('Zavrsiti') || (bannerText ?? '').includes('nastaviti'));

  const cBannerText = await C.textContent('.abandon-notice-banner').catch(() => null);
  check('C also sees the abandon-notice banner', !!cBannerText);

  const endBtnCount = await B.locator('.abandon-notice-banner button:has-text("Završi partiju")').count();
  const continueBtnCount = await B.locator('.abandon-notice-banner button:has-text("Nastavi sa AI")').count();
  check('B\'s banner has a "Završi partiju" button', endBtnCount > 0);
  check('B\'s banner has a "Nastavi sa AI" button', continueBtnCount > 0);

  console.log('--- C dismisses with "Nastavi sa AI" (should just close, match continues) ---');
  await C.click('.abandon-notice-banner button:has-text("Nastavi sa AI")');
  await C.waitForTimeout(300);
  const cBannerGone = await C.locator('.abandon-notice-banner').count();
  check('C\'s banner is gone after dismissing', cBannerGone === 0);
  const phaseStillGoing = await C.evaluate(() => window.game?.state?.phase);
  console.log('Phase after C dismissed:', phaseStillGoing);
  check('match is still in progress after dismissing (not ended)', phaseStillGoing !== 'MATCH_OVER');

  console.log('--- B clicks "Zavrsi partiju" (should trigger a real end-match proposal) ---');
  await B.click('.abandon-notice-banner button:has-text("Završi partiju")');
  await B.waitForTimeout(700);
  const proposalSeenOnC = await C.evaluate(() =>
    [...document.querySelectorAll('#endMatchBanners *')].some((el) => el.textContent?.includes('predlaže'))
  );
  console.log('C sees a real end-match proposal after B clicked "Zavrsi partiju":', proposalSeenOnC);
  check('clicking "Zavrsi partiju" actually sent a real game:proposeEndMatch (C sees the vote banner)', proposalSeenOnC);

  check('no uncaught JS errors across the whole flow', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
