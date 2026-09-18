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
    if ((await raise.count()) > 0) { await raise.first().click(); return true; }
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
  await registerAs(A, 'rtA', stamp);
  await registerAs(B, 'rtB', stamp);
  await registerAs(C, 'rtC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  // Play to GAME_OVER, check the seat name boxes and result modal for
  // stray "(1000)" rating text — should be GONE everywhere except the
  // tabela (score screen).
  for (let i = 0; i < 300; i++) {
    const phase = await A.evaluate(() => window.game?.state?.phase ?? null);
    if (phase === 'GAME_OVER') break;
    for (const p of [A, B, C]) await tryAct(p).catch(() => {});
    await A.waitForTimeout(100);
  }
  await A.waitForTimeout(1000);

  const seatNameSouth = await A.evaluate(() => document.getElementById('name-south')?.textContent);
  console.log('Seat name (south) after a hand:', seatNameSouth);
  check('seat-box name has NO "(rating)" suffix', !/\(\d+\)/.test(seatNameSouth));

  const resultHtml = await A.evaluate(() => document.getElementById('resultMsg')?.innerHTML ?? '');
  const hasRatingInResult = /\(\d{3,4}\)/.test(resultHtml.replace(/×\d+/g, ''));
  console.log('Result modal contains something rating-shaped "(NNNN)":', hasRatingInResult);
  check('end-of-hand result modal has NO rating numbers', !hasRatingInResult);

  console.log('--- opening the tabela (score screen) ---');
  await A.click('button[onclick="toggleScore()"]');
  await A.waitForTimeout(500);
  const focalNameHtml = await A.evaluate(() => document.querySelector('.score-focal-name')?.innerHTML ?? '');
  console.log('Tabela focal name HTML:', focalNameHtml);
  check('tabela focal card DOES show a rating number', /\(\d+\)/.test(focalNameHtml));

  // Now drive to MATCH_OVER via agreed end, check total-tricks text appears.
  await A.click('#scoreScreen', { position: { x: 5, y: 5 } }); // click the backdrop (own onclick handler) to close
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

  const matchOverHtml = await A.evaluate(() => document.getElementById('resultMsg')?.innerHTML ?? '');
  const hasTricksText = /ukupno \d+ štihova/.test(matchOverHtml);
  console.log('MATCH_OVER modal contains "ukupno N štihova":', hasTricksText);
  check('MATCH_OVER screen now shows total tricks per player (was completely missing)', hasTricksText);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
