import { chromium } from 'playwright';

// Exercises server/src/socket/roomAdmin.ts (adminKickSeat/adminCloseRoom)
// end-to-end through the real admin.html UI + 3 real player tabs — the
// part of the file-splitting refactor's Stage 2 that verify-admin-panel.mjs
// (credits/users/rejection) does NOT cover.

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

const adminEmail = process.argv[2];

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

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([1, 2, 3].map(() => browser.newContext().then((c) => c.newPage())));

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'kcA', stamp);
  await registerAs(B, 'kcB', stamp);
  await registerAs(C, 'kcC', stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomJoinBtn');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomJoinBtn');

  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });
  console.log(`Room ${code} created with 3 players, hand in progress.`);

  // Admin tab
  const adminPage = await (await browser.newContext()).newPage();
  await adminPage.goto(URL + 'admin.html');
  await adminPage.fill('#email', adminEmail);
  await adminPage.fill('#password', 'test1234');
  await adminPage.click('text=Uloguj se');
  await adminPage.waitForSelector('#adminBox', { state: 'visible', timeout: 5000 });
  await adminPage.click('button[data-tab="sobe"]');
  await adminPage.waitForSelector('#roomsBody tr', { state: 'visible', timeout: 5000 });

  const roomsText = await adminPage.textContent('#roomsBody');
  check(`admin room list shows room ${code}`, roomsText.includes(code));

  // Kick player B, identified by their registered display name (mySeat is
  // module-scoped in app.js, not on window — the admin room list's own
  // per-seat name text is the reliable cross-page identifier here).
  const bSeat = await A.evaluate(() =>
    window.game.state.players.findIndex((p) => p.name === 'Test-kcB')
  );
  console.log('Player B is seated at (from A\'s view of game.state):', bSeat);
  check('found player B\'s seat in game.state.players', bSeat >= 0);

  const row = adminPage.locator('#roomsBody tr', { hasText: code });
  const kickBtn = row.locator('td', { hasText: 'Test-kcB' }).locator('button:has-text("Izbaci")');
  adminPage.once('dialog', (d) => d.accept());
  await kickBtn.click();
  await adminPage.waitForTimeout(500);

  const bKicked = await B.evaluate(() => document.getElementById('homeScreen').classList.contains('active'));
  const bToast = await B.textContent('#appToast');
  console.log('Player B toast after kick:', bToast);
  check('kicked player (B) sent back to home screen', bKicked);
  check('kicked player (B) sees the admin-kick toast', bToast.includes('Izbačen') || bToast.includes('administratora'));

  const abandonedSeat = await A.evaluate(() => window.game?.state?.abandonedSeat);
  check('remaining players see abandonedSeat set to the kicked seat', abandonedSeat === bSeat);

  // Confirm the hand keeps progressing for A/C (AI now drives B's seat) —
  // exercises roomBroadcast.ts's maybeDriveAiTurn cross-file call from
  // roomAdmin.ts's adminKickSeat.
  await A.waitForTimeout(2000);
  const stillAlive = await A.evaluate(() => window.game?.state?.phase);
  console.log('Phase 2s after kick (A/C should keep playing, AI covering B):', stillAlive);
  check('game did not crash/freeze after the kick (phase still readable)', !!stillAlive);

  // Now close the whole room.
  await adminPage.click('button[data-tab="sobe"]');
  await adminPage.waitForTimeout(300);
  const row2 = adminPage.locator('#roomsBody tr', { hasText: code });
  adminPage.once('dialog', (d) => d.accept());
  await row2.locator('button:has-text("Zatvori sobu")').click();
  await adminPage.waitForTimeout(500);

  const aClosed = await A.evaluate(() => document.getElementById('homeScreen').classList.contains('active'));
  const cClosed = await C.evaluate(() => document.getElementById('homeScreen').classList.contains('active'));
  const aToast = await A.textContent('#appToast');
  console.log('Player A toast after close:', aToast);
  check('player A got room:closed (mySeat null)', aClosed);
  check('player C got room:closed (mySeat null)', cClosed);
  check('player A sees the room-closed toast', aToast.includes('zatvorio') || aToast.includes('Administrator'));

  const consoleErrors = [];
  [A, B, C, adminPage].forEach((p) => p.on('pageerror', (e) => consoleErrors.push(e.message)));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
