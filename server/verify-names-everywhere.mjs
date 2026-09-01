import { chromium } from 'playwright';

// Regression target: user reported "posle ruke i dalje pise Zapad je igrao
// Sans" — POS_LABELS was used raw (not through seatDisplayName) in 30+
// places (contract banner, result screen, score table...). Fixed by making
// POS_LABELS itself a Proxy that resolves to the real name in online mode.
// This checks the two spots the user actually saw: the live contract
// banner (right after a game is declared) and the end-of-hand result text.

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function registerAs(page, name, email) {
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', name);
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
  await page.click('text=🎮 Sobe — napravi ili se pridruži');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
}

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
  } else if (phase === 'PLAYING') {
    const card = page.locator('#handArea .card.playable').first();
    if ((await card.count()) > 0) { await card.click(); return true; }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'Nada', `nea-${stamp}@test.com`);
  await registerAs(B, 'Boban', `neb-${stamp}@test.com`);
  await registerAs(C, 'Ceda', `nec-${stamp}@test.com`);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  let iterations = 0;
  let sawDeclared = false;
  while (iterations++ < 60) {
    const phase = await A.evaluate(() => window.game?.state?.phase);
    if (phase === 'DECLARING' || phase === 'PLAYING' || phase === 'GAME_OVER' || phase === 'REFE' || phase === 'MATCH_OVER') {
      const declared = await A.evaluate(() => window.game.state.declaredGame);
      if (declared) { sawDeclared = true; }
    }
    if (['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(phase)) break;
    for (const p of [A, B, C]) { await tryAct(p); await p.waitForTimeout(100); }
  }

  console.log('--- contract banner (live, during the hand) ---');
  const contractText = await A.textContent('#contractBanner').catch(() => '');
  console.log('contractBanner text:', contractText);
  check('contract banner reached a declared-game state at some point', sawDeclared);
  check('contract banner does NOT show generic Istok/Zapad', !contractText.includes('Istok') && !contractText.includes('Zapad'));
  check('contract banner shows a chosen display name', /Nada|Boban|Ceda/.test(contractText));

  console.log('--- result screen (after the hand ends) ---');
  await A.waitForFunction(() => ['GAME_OVER', 'REFE', 'MATCH_OVER'].includes(window.game?.state?.phase), { timeout: 15000 });
  await A.waitForTimeout(1000); // renderResult() is scheduled 800ms after phase change
  const resultText = await A.textContent('#resultMsg').catch(() => '');
  console.log('resultMsg text (first 300 chars):', resultText.slice(0, 300));
  check('result screen does NOT show generic Istok/Zapad', !resultText.includes('Istok') && !resultText.includes('Zapad'));
  check('result screen shows at least one chosen display name', /Nada|Boban|Ceda/.test(resultText));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
