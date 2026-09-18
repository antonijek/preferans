// Phase 1 of the room-persistence test: creates a room, plays into the
// PLAYING phase (mid-hand, real cards in real hands), captures the exact
// state for comparison, and DELIBERATELY LEAVES THE BROWSER CONTEXTS OPEN
// (doesn't close them) so phase 2 can restart the server and check that
// M6 reconnect + the restored room produce the identical game state.
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'http://localhost:3001/';

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
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([1, 2, 3].map(() => browser.newContext().then((c) => c.newPage())));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'prA', stamp);
  await registerAs(B, 'prB', stamp);
  await registerAs(C, 'prC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  // Drive to PLAYING and play a couple of real cards so there's genuine
  // mid-hand state (tricks, currentTrick, reduced hands) to verify later.
  for (let i = 0; i < 100; i++) {
    const phase = await A.evaluate(() => window.game?.state?.phase ?? null);
    if (phase === 'PLAYING') break;
    for (const p of [A, B, C]) await tryAct(p).catch(() => {});
    await A.waitForTimeout(120);
  }
  // Play exactly 2 real cards in PLAYING so currentTrick/tricks have content.
  let cardsPlayed = 0;
  for (let i = 0; i < 50 && cardsPlayed < 2; i++) {
    const phase = await A.evaluate(() => window.game?.state?.phase ?? null);
    if (phase !== 'PLAYING') break;
    for (const p of [A, B, C]) {
      const card = p.locator('#handArea .card.playable').first();
      if ((await card.count()) > 0) {
        await card.click();
        cardsPlayed++;
        await A.waitForTimeout(200);
        break;
      }
    }
  }

  const snapshot = await A.evaluate(() => ({
    phase: window.game?.state?.phase,
    trickCount: window.game?.state?.trickCount,
    currentTrickLen: window.game?.state?.currentTrick?.length,
    bulas: window.game?.state?.bulas,
    declaredGame: window.game?.state?.declaredGame,
    handLengths: window.game?.state?.players?.map((p) => p.hand.length),
    tricksLen: window.game?.state?.tricks?.length,
  }));
  console.log('SNAPSHOT (before restart):', JSON.stringify(snapshot));
  fs.writeFileSync('./persistence-test-snapshot.json', JSON.stringify({ code, snapshot, stamp }));
  console.log('Room code:', code);

  await browser.close(); // close browser (simulates players' tabs closing / going away)
  console.log('Phase 1 done.');
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
