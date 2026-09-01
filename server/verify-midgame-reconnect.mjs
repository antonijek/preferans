import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function registerAs(page, letter, stamp) {
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', 'Test Igrac');
  await page.fill('#loginEmail', `${letter}-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));
  const consoleErrors = [];
  [A, B, C].forEach((p, i) => p.on('pageerror', (e) => consoleErrors.push(`page${i}: ${e.message}`)));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'mga', stamp);
  await registerAs(B, 'mgb', stamp);
  await registerAs(C, 'mgc', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  // Get to PLAYING by clicking through bidding/discard/declare/follow/kontra
  // on whichever page has the actionable turn (same driver logic as the
  // full-hand test, trimmed to just "get to PLAYING").
  async function tryAct(page) {
    const phase = await page.evaluate(() => window.game?.state?.phase ?? null);
    if (phase === 'BIDDING') {
      const passBtn = page.locator('#bidControls button:has-text("Dalje")');
      const raiseBtn = page.locator('#bidControls button.bid-btn.primary');
      const alreadyBid = await page.evaluate(() => window.__bid === true);
      if (!alreadyBid && (await raiseBtn.count()) > 0) { await raiseBtn.first().click(); await page.evaluate(() => { window.__bid = true; }); return true; }
      if ((await passBtn.count()) > 0) { await passBtn.click(); return true; }
    } else if (phase === 'DISCARDING') {
      const cards = page.locator('#handArea .card');
      if ((await cards.count()) >= 2) { await cards.nth(0).click(); await cards.nth(1).click(); await page.locator('#bidControls button:has-text("Baci")').click(); return true; }
    } else if (phase === 'DECLARING') {
      const btn = page.locator('#bidControls button.bid-btn').first();
      if ((await btn.count()) > 0) { await btn.click(); return true; }
    } else if (phase === 'FOLLOW_DECLARING') {
      const dodjem = page.locator('#bidControls button').filter({ hasText: /^Dodjem$/ });
      const solo = page.locator('#bidControls button:has-text("Igram sam")');
      if ((await dodjem.count()) > 0) { await dodjem.click(); return true; }
      if ((await solo.count()) > 0) { await solo.click(); return true; }
    } else if (phase === 'KONTRA_DECLARING') {
      const moze = page.locator('#bidControls button:has-text("Moze")');
      if ((await moze.count()) > 0) { await moze.click(); return true; }
    }
    return false;
  }

  let iterations = 0;
  while (iterations++ < 100) {
    const phase = await A.evaluate(() => window.game?.state?.phase);
    if (phase === 'PLAYING') break;
    for (const p of [A, B, C]) { await tryAct(p); await p.waitForTimeout(100); }
  }
  const reachedPlaying = await A.evaluate(() => window.game.state.phase === 'PLAYING');
  check('reached PLAYING phase (setup for the actual test below)', reachedPlaying);

  // Play one real trick's worth of cards so hands are non-trivially reduced,
  // then capture B's exact hand+seat, refresh B, and confirm it comes back
  // identical (not reshuffled, not stuck on setup/room screen).
  for (let i = 0; i < 3; i++) {
    for (const p of [A, B, C]) { await tryAct(p) || await (async () => {
      const card = p.locator('#handArea .card.playable').first();
      if (await card.count() > 0) await card.click();
    })(); await p.waitForTimeout(100); }
  }

  const beforeReload = await B.evaluate(() => ({
    hand: (window.game.state.players.find((p) => p.hand.length > 0)?.hand ?? []).map((c) => c.id).sort(),
    trickCount: window.game.state.trickCount,
  }));
  check('B has some cards left before reload', beforeReload.hand.length > 0);

  console.log('--- reloading B mid-PLAYING ---');
  await B.reload();
  await B.waitForFunction(() => window.game?.state?.phase === 'PLAYING', { timeout: 8000 }).catch(() => {});

  const tableVisible = await B.evaluate(() => document.body.classList.contains('online-in-game'));
  check('B lands directly back at the table (not setup/login/room screen)', tableVisible);
  const afterReload = await B.evaluate(() => ({
    hand: (window.game.state.players.find((p) => p.hand.length > 0)?.hand ?? []).map((c) => c.id).sort(),
  }));
  check('B\'s hand after reload is IDENTICAL to before (not reshuffled/lost)', JSON.stringify(afterReload.hand) === JSON.stringify(beforeReload.hand));

  check('no uncaught JS errors', consoleErrors.length === 0);
  if (consoleErrors.length) console.log(consoleErrors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
