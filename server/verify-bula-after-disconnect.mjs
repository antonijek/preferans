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
  const ctxs = await Promise.all([1, 2, 3].map(() => browser.newContext()));
  const [A, B, C] = await Promise.all(ctxs.map((c) => c.newPage()));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'bdA', stamp);
  await registerAs(B, 'bdB', stamp);
  await registerAs(C, 'bdC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  // Play to GAME_OVER so bulas genuinely differ from the starting 100/100/100.
  for (let i = 0; i < 300; i++) {
    const phase = await A.evaluate(() => window.game?.state?.phase ?? null);
    if (phase === 'GAME_OVER') break;
    for (const p of [A, B, C]) await tryAct(p).catch(() => {});
    await A.waitForTimeout(100);
  }
  await A.waitForTimeout(300);

  const bulasBefore = await A.evaluate(() => window.game?.state?.bulas);
  console.log('Bulas after 1st hand (before disconnect):', bulasBefore);
  check('bulas actually differ from the starting 100/100/100 (test is meaningful)',
    bulasBefore.some((b) => b !== 100));

  // Read the seat-box display values (not game.state — the actual rendered DOM text).
  const seatBoxTextBefore = await A.evaluate(() =>
    ['bule-south', 'bule-east', 'bule-west'].map((id) => document.getElementById(id)?.textContent)
  );
  console.log('Seat-box DOM text on A BEFORE B disconnects:', seatBoxTextBefore);

  console.log('--- B disconnects (context close) ---');
  await ctxs[1].close();
  await A.waitForTimeout(1000); // let room:playerDisconnected land and renderSeats() fire

  const seatBoxTextAfter = await A.evaluate(() =>
    ['bule-south', 'bule-east', 'bule-west'].map((id) => document.getElementById(id)?.textContent)
  );
  console.log('Seat-box DOM text on A AFTER B disconnects:', seatBoxTextAfter);
  check('seat-box bula text on A is UNCHANGED after B\'s disconnect (not reset to fake 100s)',
    JSON.stringify(seatBoxTextBefore) === JSON.stringify(seatBoxTextAfter));
  check('seat-box values are NOT all "100" after the disconnect (the bug\'s exact symptom)',
    !seatBoxTextAfter.every((t) => t === '100'));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
