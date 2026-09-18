import { chromium } from 'playwright';

// Verifies the 2026-09-18 fix: when a player leaves and the remaining two
// later agree to end the match early, the leaver's final bula must equal
// what it was AT THE MOMENT they left (frozenBula), NOT whatever it drifted
// to afterward while AI played more hands in their seat.

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
  await registerAs(A, 'frA', stamp);
  await registerAs(B, 'frB', stamp);
  await registerAs(C, 'frC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  // Play to PLAYING phase so leaveMatch's bula-at-leave-time isn't just the starting 100.
  for (let i = 0; i < 100; i++) {
    const phase = await A.evaluate(() => window.game?.state?.phase ?? null);
    if (phase === 'PLAYING') break;
    for (const p of [A, B, C]) await tryAct(p).catch(() => {});
    await A.waitForTimeout(120);
  }

  const aSeat = await A.evaluate(() => window.game?.state?.players?.findIndex((p) => p.name === 'Test-frA'));
  console.log('A is seat', aSeat, 'bula at leave time (about to capture):',
    await A.evaluate((s) => window.game?.state?.bulas?.[s], aSeat));

  console.log('--- A leaves the match ---');
  await A.click('#matchMenuBtn');
  await A.click('text=🏳️ Napusti svakako');
  await A.waitForSelector('#leaveConfirmBtn', { timeout: 3000 });
  await A.click('#leaveConfirmBtn');
  await A.waitForTimeout(500); // doLeaveMatch's toast fires inside the socket ack callback
  const leaveToast = await A.textContent('#appToast');
  console.log('A leave toast (has frozen bula):', leaveToast);
  const frozenBulaMatch = leaveToast.match(/buli (-?\d+)/);
  const frozenBula = frozenBulaMatch ? Number(frozenBulaMatch[1]) : null;
  check('captured the frozen bula from the leave toast', frozenBula !== null);
  console.log('Frozen bula at leave time:', frozenBula);

  // IMPORTANT (discovered while writing this test): once a seat is
  // abandoned, the server deliberately refuses to deal any FURTHER hand
  // (maybeAutoAdvanceHand and game:dealNext both check `abandonedSeat` and
  // bail — "kad neko pobegne... igraci... mogu da zavrse na prekid
  // partije", not silently keep playing new hands). So the ONLY hand that
  // can still move the leaver's bula is the ONE that was already in
  // progress the moment they left (finished by AI) — there's no "several
  // more hands" to wait for. Just let that one in-flight hand resolve.
  console.log('--- letting the one hand that was in-flight when A left finish (AI covers A) ---');
  for (let i = 0; i < 300; i++) {
    const phase = await B.evaluate(() => window.game?.state?.phase ?? null);
    if (phase === 'GAME_OVER' || phase === 'MATCH_OVER') break;
    for (const p of [B, C]) await tryAct(p).catch(() => {});
    await B.waitForTimeout(120);
  }

  const bulaAfterInFlightHand = await B.evaluate((s) => window.game?.state?.bulas?.[s], aSeat);
  console.log('A\'s (AI-driven) bula after the in-flight hand resolved:', bulaAfterInFlightHand,
    bulaAfterInFlightHand === frozenBula
      ? '(unchanged — A simply was not the declarer of this particular hand, so it never touched their bula; still a valid run)'
      : '(drifted — good, this run genuinely exercises the fix)');

  console.log('--- B proposes early end, C accepts ---');
  await B.click('#matchMenuBtn');
  await B.click('text=🤝 Predloži prekid partije');
  await B.click('#endMatchBanners button:has-text("Predloži")');
  await B.waitForTimeout(500);
  const acceptBtn = C.locator('#endMatchBanners button:has-text("Prihvati")');
  if ((await acceptBtn.count()) > 0) await acceptBtn.click();
  await B.waitForFunction(() => window.game?.state?.phase === 'MATCH_OVER', { timeout: 8000 }).catch(() => {});

  const finalBulaA = await B.evaluate((s) => window.game?.state?.bulas?.[s], aSeat);
  console.log('A\'s FINAL bula after match ended:', finalBulaA, '  (frozen-at-leave was:', frozenBula, ')');
  check('final phase is MATCH_OVER', (await B.evaluate(() => window.game?.state?.phase)) === 'MATCH_OVER');
  check('leaver\'s final bula equals the LEAVE-TIME frozen value, not the AI-drifted one', finalBulaA === frozenBula);

  const sumFinal = await B.evaluate(() => window.game.state.bulas[0] + window.game.state.bulas[1] + window.game.state.bulas[2]);
  check('all three final bulas sum to 0 (write-off invariant)', sumFinal === 0);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
