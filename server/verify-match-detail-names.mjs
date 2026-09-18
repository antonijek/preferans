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

async function tryAct(page) {
  const phase = await page.evaluate(() => window.game?.state?.phase ?? null);
  if (!phase) return false;
  if (phase === 'BIDDING') {
    const pass = page.locator('#bidControls button:has-text("Dalje")');
    const raise = page.locator('#bidControls button.bid-btn.primary');
    const already = await page.evaluate(() => window.__alreadyBid === true);
    if (!already && (await raise.count()) > 0) {
      await raise.first().click();
      await page.evaluate(() => { window.__alreadyBid = true; });
      return true;
    }
    if ((await pass.count()) > 0) { await pass.click(); return true; }
    return false;
  }
  if (phase === 'DISCARDING') {
    const cards = page.locator('#handArea .card');
    if ((await cards.count()) < 2) return false;
    await cards.nth(0).click();
    await cards.nth(1).click();
    const confirm = page.locator('#bidControls button:has-text("Baci")');
    if ((await confirm.count()) > 0) { await confirm.click(); return true; }
    return false;
  }
  if (['DECLARING', 'FOLLOW_DECLARING', 'KONTRA_DECLARING'].includes(phase)) {
    const btn = page.locator('#bidControls button').first();
    if ((await btn.count()) > 0) { await btn.click(); return true; }
    return false;
  }
  if (phase === 'PLAYING') {
    const card = page.locator('#handArea .card.playable').first();
    if ((await card.count()) > 0) { await card.click(); return true; }
    return false;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([1, 2, 3].map(() => browser.newContext().then((c) => c.newPage())));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'dnA', stamp);
  await registerAs(B, 'dnB', stamp);
  await registerAs(C, 'dnC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  // Drive to GAME_OVER (need real tricks played so hands_json.tricks is non-empty).
  for (let i = 0; i < 200; i++) {
    const phase = await A.evaluate(() => window.game?.state?.phase ?? null);
    if (['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(phase)) break;
    for (const p of [A, B, C]) await tryAct(p).catch(() => {});
    await A.waitForTimeout(120);
  }
  console.log('Phase after hand:', await A.evaluate(() => window.game?.state?.phase));

  // End the match now (agreed) so it's queryable from matches.html.
  await A.click('#matchMenuBtn');
  await A.click('text=🤝 Predloži prekid partije');
  await A.click('#endMatchBanners button:has-text("Predloži")');
  await A.waitForTimeout(500);
  for (const p of [B, C]) {
    const acceptBtn = p.locator('#endMatchBanners button:has-text("Prihvati")');
    if ((await acceptBtn.count()) > 0) await acceptBtn.click();
  }
  await A.waitForFunction(() => window.game?.state?.phase === 'MATCH_OVER', { timeout: 8000 }).catch(() => {});
  await A.waitForTimeout(500);

  const matchesPage = await (await A.context()).newPage();
  await matchesPage.goto(URL + 'matches.html');
  await matchesPage.waitForTimeout(1500);
  await matchesPage.click('span.clickable');
  await matchesPage.waitForTimeout(500);

  const detailHtml = await matchesPage.innerHTML('#matchDetail');
  const trickRows = await matchesPage.locator('.trick-row').count();
  console.log('Trick rows found:', trickRows);
  check('at least one trick-row rendered', trickRows > 0);

  const seatLabelTexts = await matchesPage.locator('.trick-row .seat-label').allTextContents();
  console.log('Seat labels in trick rows (first 6):', seatLabelTexts.slice(0, 6));
  const bareLabels = seatLabelTexts.filter((t) => /^(Jug|Istok|Zapad):$/.test(t.trim()));
  check('trick-row seat labels include the real player name, not bare Jug/Istok/Zapad', bareLabels.length === 0);
  check('trick-row seat labels contain "Test-dn" (the registered name prefix)', seatLabelTexts.some((t) => t.includes('Test-dn')));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
