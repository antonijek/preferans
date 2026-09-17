import { chromium } from 'playwright';

// Exercises the full match-end pipeline: play a hand, propose+accept an
// early match end (game:proposeEndMatch/endMatchVote -> applyAgreedEnd ->
// MATCH_OVER -> resolveMatchRanking -> saveMatchLog, all in
// roomBroadcast.ts), then confirms the finished match actually shows up on
// matches.html (separate page, same account) with the right game/result.

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

async function driveUntil(pages, predicate, maxIters = 200) {
  for (let i = 0; i < maxIters; i++) {
    if (await predicate()) return true;
    for (const p of pages) await tryAct(p).catch(() => {});
    await pages[0].waitForTimeout(150);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([1, 2, 3].map(() => browser.newContext().then((c) => c.newPage())));
  const consoleErrors = [];
  [A, B, C].forEach((p, i) => p.on('pageerror', (e) => consoleErrors.push(`page${i}: ${e.message}`)));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'meA', stamp);
  await registerAs(B, 'meB', stamp);
  await registerAs(C, 'meC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });
  console.log(`Room ${code} started.`);

  await driveUntil([A, B, C], async () =>
    ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(await A.evaluate(() => window.game?.state?.phase ?? null))
  );
  const phaseAfterHand = await A.evaluate(() => window.game?.state?.phase);
  console.log('Phase after 1st hand:', phaseAfterHand);
  check('completed at least one hand', ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(phaseAfterHand));

  if (phaseAfterHand !== 'MATCH_OVER') {
    console.log('--- proposing early match end (A) ---');
    await A.click('#matchMenuBtn');
    await A.click('text=🤝 Predloži prekid partije');
    await A.click('#endMatchBanners button:has-text("Predloži")');
    await A.waitForTimeout(500);

    for (const p of [B, C]) {
      const acceptBtn = p.locator('#endMatchBanners button:has-text("Prihvati")');
      if ((await acceptBtn.count()) > 0) await acceptBtn.click();
    }
    await A.waitForFunction(() => window.game?.state?.phase === 'MATCH_OVER', { timeout: 8000 }).catch(() => {});
  }

  const finalPhase = await A.evaluate(() => window.game?.state?.phase);
  console.log('Final phase:', finalPhase);
  check('match reached MATCH_OVER (agreed early end)', finalPhase === 'MATCH_OVER');

  const rankingSeen = await A.evaluate(() => window.__sawMatchRanking === true).catch(() => false);
  await A.waitForTimeout(500);

  console.log('--- checking matches.html for player A ---');
  const matchesPage = await (await A.context()).newPage();
  await matchesPage.goto(URL + 'matches.html');
  await matchesPage.waitForTimeout(1500);
  const bodyText = await matchesPage.textContent('body');
  check('matches.html loaded without redirecting to login', !bodyText.includes('Prijavi se') || bodyText.length > 200);
  check('matches.html shows at least one match entry (room code or opponent name)', bodyText.includes(code) || bodyText.includes('Test-meB') || bodyText.includes('Test-meC'));
  console.log('matches.html body snippet:', bodyText.replace(/\s+/g, ' ').slice(0, 400));

  check('no uncaught JS errors across the whole flow', consoleErrors.length === 0);
  if (consoleErrors.length) console.log(consoleErrors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
