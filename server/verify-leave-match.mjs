import { chromium } from 'playwright';

// "Napusti partiju" (leave match with consequences): one seated player
// leaves mid-hand, freezes at their current bula, and the server-side AI
// (server/src/ai/aiSeat.ts) takes over their seat so the remaining two real
// humans can finish the hand via real clicks — same drive-loop pattern as
// verify-online-full-hand.mjs, minus the leaving player after they leave.

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
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
  await page.click('text=🎮 Sobe — napravi ili se pridruži');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
}

async function tryAct(page) {
  const phase = await page.evaluate(() => window.game?.state?.phase ?? null);
  if (!phase) return false;

  if (phase === 'BIDDING') {
    const passBtn = page.locator('#bidControls button:has-text("Dalje")');
    const raiseBtn = page.locator('#bidControls button.bid-btn.primary');
    const alreadyBid = await page.evaluate(() => window.__verifyAlreadyBid === true);
    if (!alreadyBid && (await raiseBtn.count()) > 0) {
      await raiseBtn.first().click();
      await page.evaluate(() => { window.__verifyAlreadyBid = true; });
      return true;
    }
    if ((await passBtn.count()) > 0) { await passBtn.click(); return true; }
    return false;
  }
  if (phase === 'DISCARDING') {
    const cards = page.locator('#handArea .card');
    const n = await cards.count();
    if (n < 2) return false;
    await cards.nth(0).click();
    await cards.nth(1).click();
    const confirmBtn = page.locator('#bidControls button:has-text("Baci")');
    if ((await confirmBtn.count()) > 0) { await confirmBtn.click(); return true; }
    return false;
  }
  if (phase === 'DECLARING') {
    const btn = page.locator('#bidControls button.bid-btn').first();
    if ((await btn.count()) > 0) { await btn.click(); return true; }
    return false;
  }
  if (phase === 'FOLLOW_DECLARING') {
    const dodjem = page.locator('#bidControls button').filter({ hasText: /^Dodjem$/ });
    const solo = page.locator('#bidControls button:has-text("Igram sam")');
    if ((await dodjem.count()) > 0) { await dodjem.click(); return true; }
    if ((await solo.count()) > 0) { await solo.click(); return true; }
    return false;
  }
  if (phase === 'KONTRA_DECLARING') {
    const moze = page.locator('#bidControls button:has-text("Moze")');
    if ((await moze.count()) > 0) { await moze.click(); return true; }
    return false;
  }
  if (phase === 'PLAYING') {
    const card = page.locator('#handArea .card.playable').first();
    if ((await card.count()) > 0) { await card.click(); return true; }
    return false;
  }
  return false;
}

// Unlike a plain drive loop, this must keep polling even when NEITHER page
// has a human action available right now — that's the normal state while
// the server AI's ~600ms-delayed move for the abandoned seat is in flight.
async function driveUntil(pages, predicate, maxIterations = 400) {
  let iterations = 0;
  while (iterations < maxIterations) {
    iterations++;
    if (await predicate()) return iterations;
    let progressed = false;
    for (const p of pages) {
      if (await predicate()) return iterations;
      const acted = await tryAct(p);
      if (acted) { progressed = true; await p.waitForTimeout(120); }
    }
    if (!progressed) await pages[0].waitForTimeout(250);
  }
  return iterations;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const ctxs = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [A, B, C] = await Promise.all(ctxs.map((c) => c.newPage()));
  const allPages = [A, B, C];
  const consoleErrors = [];
  allPages.forEach((p, i) => p.on('pageerror', (e) => consoleErrors.push(`page${i}: ${e.message}`)));

  await Promise.all(allPages.map((p) => p.goto(URL)));
  await registerAs(A, 'lma', stamp);
  await registerAs(B, 'lmb', stamp);
  await registerAs(C, 'lmc', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');

  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });
  console.log('Hand started, driving to PLAYING phase before A leaves...');

  await driveUntil(allPages, async () => {
    const phase = await A.evaluate(() => window.game?.state?.phase ?? null);
    return phase === 'PLAYING' || ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(phase);
  });

  const phaseBeforeLeave = await A.evaluate(() => window.game.state.phase);
  console.log('Phase before leave:', phaseBeforeLeave);
  check('reached PLAYING before leaving (not stuck earlier)', phaseBeforeLeave === 'PLAYING');

  console.log('--- A clicks Napusti partiju ---');
  await A.click('#leaveMatchBtn');
  await A.waitForSelector('#leaveConfirmBtn', { timeout: 3000 });
  await A.click('#leaveConfirmBtn');

  await A.waitForSelector('#homeScreen.active', { timeout: 5000 });
  check('A landed back on home screen after leaving', true);

  const toastText = await A.evaluate(() => document.getElementById('appToast').textContent);
  check(
    `A's toast shows the frozen bula: "${toastText}"`,
    /Napustio si partiju na buli \d+/.test(toastText)
  );

  console.log('--- B/C should see the seat marked as left + AI finishing the hand ---');
  await B.waitForTimeout(800); // let the leave broadcast + first AI tick land
  const bSeatNames = await B.evaluate(() => window.game.state.players.map((p) => p.name));
  check(
    `remaining players see a "(napustio)" marker on the seat that left: ${JSON.stringify(bSeatNames)}`,
    bSeatNames.some((n) => n.includes('napustio'))
  );

  const chatHasSystemMsg = await B.evaluate(() =>
    [...document.querySelectorAll('#chatLog *')].some((el) => el.textContent?.includes('napustio partiju'))
  );
  check('remaining players see the system chat message about the departure', chatHasSystemMsg);

  console.log('--- driving B and C to finish the hand (AI plays the abandoned seat automatically) ---');
  await driveUntil([B, C], async () =>
    ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(await B.evaluate(() => window.game?.state?.phase ?? null))
  , 300);

  const finalPhase = await B.evaluate(() => window.game.state.phase);
  console.log('Final phase (B):', finalPhase);
  check(
    'hand mechanically completed to a real end state without A (AI drove the abandoned seat)',
    ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(finalPhase)
  );

  console.log('--- A should be free to create/join a DIFFERENT room now ---');
  await A.click('text=🎮 Sobe — napravi ili se pridruži');
  await A.waitForSelector('#roomScreen.active', { timeout: 5000 });
  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const newCode = await A.inputValue('#roomCodeInput');
  check('A (freed via clearUserLocation) can create a brand new, different room', !!newCode && newCode !== code);

  check('no uncaught JS errors across the whole flow', consoleErrors.length === 0);
  if (consoleErrors.length) console.log('Console errors:', consoleErrors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
