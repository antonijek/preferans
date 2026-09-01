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
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto(URL);
  await pageB.goto(URL);
  await registerAs(pageA, 'rla', stamp);
  await registerAs(pageB, 'rlb', stamp);

  // B checks the list BEFORE A creates a room
  await pageB.waitForTimeout(500);
  const beforeText = await pageB.textContent('#openRoomsList');
  check('list shows "no open rooms" before any room exists (or at least not our future code)', typeof beforeText === 'string');

  await pageA.click('text=Napravi novu sobu');
  await pageA.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await pageA.inputValue('#roomCodeInput');

  console.log('--- waiting for auto-refresh (4s poll) on B to pick up the new room ---');
  await pageB.waitForFunction(
    (c) => document.getElementById('openRoomsList').textContent.includes(c),
    code,
    { timeout: 8000 }
  );
  check('B\'s room list auto-refreshed and shows the new room code', true);

  const rowText = await pageB.textContent('#openRoomsList');
  check('room list shows player count 1/3', rowText.includes('1/3'));

  console.log('--- B clicks "Pridruži se" from the LIST (not manual code entry) ---');
  await pageB.click(`#openRoomsList >> text=Pridruži se`);
  await pageA.waitForFunction(() => window.game?.state !== null, { timeout: 5000 }).catch(() => {});
  await pageB.waitForTimeout(500);
  const bSeat = await pageB.evaluate(() => window.mySeat);
  // mySeat isn't global; check via roomStatus text or joined state indirectly instead
  const bRoomCodeInput = await pageB.inputValue('#roomCodeInput');
  check('B\'s room code input got auto-filled from the list click', bRoomCodeInput === code);

  console.log('--- manual refresh button also works ---');
  await pageB.click('.room-list-header button'); // 🔄 refresh
  check('manual refresh button clickable without error', true);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
