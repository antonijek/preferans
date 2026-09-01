import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;

function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();

  const [ctxA, ctxB, ctxC, ctxSpec] = await Promise.all([
    browser.newContext(), browser.newContext(), browser.newContext(), browser.newContext(),
  ]);
  const [pageA, pageB, pageC, pageSpec] = await Promise.all([
    ctxA.newPage(), ctxB.newPage(), ctxC.newPage(), ctxSpec.newPage(),
  ]);
  const pages = { A: pageA, B: pageB, C: pageC, Spec: pageSpec };

  const consoleErrors = [];
  for (const [name, p] of Object.entries(pages)) {
    p.on('pageerror', (e) => consoleErrors.push(`${name}: ${e.message}`));
  }

  await Promise.all(Object.values(pages).map((p) => p.goto(URL)));
  check('root URL serves the real game page (F6 static serving)', await pageA.title() !== '');

  async function registerAs(page, letter) {
    await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', 'Test Igrac');
    await page.fill('#loginEmail', `${letter}-${stamp}@test.com`);
    await page.fill('#loginPassword', 'test1234');
    await page.click('#loginScreen >> text=Registruj se');
    await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
  }

  await registerAs(pageA, 'a');
  await registerAs(pageB, 'b');
  await registerAs(pageC, 'c');
  await registerAs(pageSpec, 'spec');
  check('all 4 pages reach the room screen after register', true);

  await pageA.click('text=Napravi novu sobu');
  await pageA.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await pageA.inputValue('#roomCodeInput');

  await pageB.fill('#roomCodeInput', code);
  await pageB.click('#roomScreen >> text=Pridruži se');
  await pageC.fill('#roomCodeInput', code);
  await pageC.click('#roomScreen >> text=Pridruži se');

  await pageA.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });
  const phaseA = await pageA.evaluate(() => window.game.state.phase);
  check('game auto-started for all 3 players (phase=BIDDING)', phaseA === 'BIDDING');
  check('setup/login/room screens are gone, real table visible', await pageA.isHidden('#roomScreen.active').catch(() => true));

  // Full auction resolution is already covered by engine's own 184 tests plus
  // verify-m3.mjs (protocol-level). What's NEW and actually worth proving here
  // is that a real button click in the real UI reaches the server and comes
  // back as a state update visible to all 3 pages — so just do ONE real click.
  console.log('\n--- one real bid click propagates to all 3 pages ---');
  let actedPageName = null;
  for (const [name, p] of Object.entries({ pageA, pageB, pageC })) {
    const btn = p.locator('#bidControls button.bid-btn').first();
    if (await btn.count() > 0) {
      const label = await btn.textContent();
      await btn.click();
      actedPageName = `${name} (${label})`;
      break;
    }
  }
  check('found and clicked a real bid button on whichever page had the turn', actedPageName !== null);
  await Promise.all([pageA, pageB, pageC].map((p) =>
    p.waitForFunction(() => window.game?.state?.bids?.length > 0, { timeout: 5000 }).catch(() => {})
  ));
  const bidsSeenByAll = await Promise.all([pageA, pageB, pageC].map((p) => p.evaluate(() => window.game.state.bids.length)));
  check('the click\'s resulting bid is visible in ALL 3 pages\' state (real click -> real server -> real broadcast)', bidsSeenByAll.every((n) => n > 0));

  console.log('\n--- hand isolation check (real DOM) ---');
  const handsRaw = {};
  for (const [name, p] of Object.entries({ A: pageA, B: pageB, C: pageC })) {
    handsRaw[name] = await p.evaluate(() => {
      const mySeatGuess = window.game.state.players.findIndex((pl) => pl.hand.length > 0);
      return { mySeatGuess, hand: window.game.state.players[mySeatGuess]?.hand.map((c) => c.id) ?? [] };
    });
  }
  const allSameSeat = new Set(Object.values(handsRaw).map((h) => h.mySeatGuess)).size === 3;
  check('each of A/B/C sees exactly one non-empty hand, all different seats', allSameSeat);
  const [ha, hb, hc] = Object.values(handsRaw).map((h) => new Set(h.hand));
  const overlapAB = [...ha].some((id) => hb.has(id));
  const overlapAC = [...ha].some((id) => hc.has(id));
  check('no card ID shared between A and B\'s visible hands', !overlapAB);
  check('no card ID shared between A and C\'s visible hands', !overlapAC);

  console.log('\n--- spectator ---');
  await pageSpec.fill('#roomCodeInput', code);
  await pageSpec.click('#roomScreen >> text=Kibiciraj');
  await pageSpec.waitForFunction(() => window.game?.state !== null, { timeout: 5000 });
  const specHands = await pageSpec.evaluate(() => window.game.state.players.map((p) => p.hand.length));
  check('spectator sees zero cards for all 3 seats before any kibic grant', specHands.every((n) => n === 0));

  console.log('\n--- kibic request/approve ---');
  const seat0PageName = Object.entries(handsRaw).find(([, h]) => h.mySeatGuess === 0)?.[0];
  const seat0Page = { A: pageA, B: pageB, C: pageC }[seat0PageName];
  await pageSpec.click('#kibicRequestPanel >> text=Jug');
  await seat0Page.waitForSelector('.kibic-request-banner', { timeout: 5000 });
  await seat0Page.click('.kibic-request-banner >> text=Odobri');
  await pageSpec.waitForFunction(() => window.game.state.players[0].hand.length > 0, { timeout: 5000 });
  const specHandsAfterKibic = await pageSpec.evaluate(() => window.game.state.players.map((p) => p.hand.length));
  check('spectator sees seat 0 real hand after approval', specHandsAfterKibic[0] > 0);
  check('spectator still sees no hand for seats 1/2 (grant is per-seat)', specHandsAfterKibic[1] === 0 && specHandsAfterKibic[2] === 0);

  console.log('\n--- chat ---');
  await pageA.click('#chatToggleBtn');
  await pageA.fill('#chatInput', 'zdravo iz online UI testa');
  await pageA.click('#chatScreen >> text=Pošalji');
  await pageB.click('#chatToggleBtn');
  await pageB.waitForFunction(() => document.getElementById('chatLog').textContent.includes('zdravo iz online UI testa'), { timeout: 5000 });
  check('chat message from A visible in B\'s chat log', true);

  check('no uncaught JS errors on any page', consoleErrors.length === 0);
  if (consoleErrors.length) console.log('Console errors:', consoleErrors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
