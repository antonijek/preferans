import { chromium } from 'playwright';

// Plays ONE COMPLETE hand (bidding -> discard -> declare -> follow ->
// kontra -> all tricks -> scoring) across 3 real browser tabs, clicking
// real buttons/cards exactly as a person would — the deepest end-to-end
// proof that the online-mode wiring (game proxy, isHuman/mySeat guards,
// per-phase render waiting-banners) holds up through an ENTIRE hand, not
// just the first bid (which is all the earlier verify-online-ui.mjs covers).

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

async function tryAct(page) {
  // Returns true if it found and performed SOME action on this page.
  const phase = await page.evaluate(() => window.game?.state?.phase ?? null);
  if (!phase) return false;

  if (phase === 'BIDDING') {
    const passBtn = page.locator('#bidControls button:has-text("Dalje")');
    const igraBtn = page.locator('#bidControls button:has-text("Igra")');
    const raiseBtn = page.locator('#bidControls button.bid-btn.primary');
    // First-ever bid on this page: raise once so SOMEONE actually wins the
    // auction; every subsequent turn on any page: pass, so it resolves fast.
    const alreadyBid = await page.evaluate(() => window.__verifyAlreadyBid === true);
    if (!alreadyBid && (await raiseBtn.count()) > 0) {
      await raiseBtn.first().click();
      await page.evaluate(() => { window.__verifyAlreadyBid = true; });
      return true;
    }
    if ((await passBtn.count()) > 0) { await passBtn.click(); return true; }
    if ((await igraBtn.count()) > 0) return false; // don't complicate with Igra path
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

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const ctxs = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [A, B, C] = await Promise.all(ctxs.map((c) => c.newPage()));
  const pages = [A, B, C];
  const consoleErrors = [];
  pages.forEach((p, i) => p.on('pageerror', (e) => consoleErrors.push(`page${i}: ${e.message}`)));

  await Promise.all(pages.map((p) => p.goto(URL)));
  await registerAs(A, 'fha', stamp);
  await registerAs(B, 'fhb', stamp);
  await registerAs(C, 'fhc', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');

  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });
  console.log('Hand started, driving it through real clicks until scoring...');

  const seenPhases = new Set();
  let iterations = 0;
  const MAX_ITERATIONS = 200;
  let progressed = true;

  while (iterations < MAX_ITERATIONS && progressed) {
    iterations++;
    progressed = false;
    for (const p of pages) {
      const phase = await p.evaluate(() => window.game?.state?.phase ?? null);
      if (phase) seenPhases.add(phase);
      if (phase === 'SCORING' || phase === 'GAME_OVER' || phase === 'REFE' || phase === 'TRICK_RESULT' || phase === 'MATCH_OVER') {
        progressed = true; // terminal-ish states still count as "done", stop the outer loop below
        continue;
      }
      const acted = await tryAct(p);
      if (acted) { progressed = true; await p.waitForTimeout(120); }
    }
    const anyDone = await Promise.all(pages.map((p) => p.evaluate(() =>
      ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(window.game?.state?.phase)
    )));
    if (anyDone.some(Boolean)) break;
  }

  const finalPhase = await A.evaluate(() => window.game.state.phase);
  console.log('Phases observed during the hand:', [...seenPhases].join(', '));
  console.log('Final phase:', finalPhase, `(after ${iterations} loop iterations)`);

  check('hand reached a real end state (GAME_OVER/REFE/MATCH_OVER), not stuck', ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(finalPhase));
  check('bidding actually happened', seenPhases.has('BIDDING'));
  check('discarding phase was reached', seenPhases.has('DISCARDING'));
  check('declaring phase was reached', seenPhases.has('DECLARING'));
  check('playing phase was reached (real tricks played via real clicks)', seenPhases.has('PLAYING'));

  const tricksCompleted = await A.evaluate(() => window.game.state.tricks?.length ?? 0);
  check('at least several real tricks were completed via clicks', tricksCompleted >= 5);

  check('no uncaught JS errors across the whole hand', consoleErrors.length === 0);
  if (consoleErrors.length) console.log('Console errors:', consoleErrors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
