import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function registerAs(page, email) {
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginName', 'Test Igrac');
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
  await page.click('text=🎮 Sobe — napravi ili se pridruži');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const C = await ctxC.newPage();

  await Promise.all([A.goto(URL), B.goto(URL), C.goto(URL)]);
  await registerAs(A, `cpa-${stamp}@test.com`);
  await registerAs(B, `cpb-${stamp}@test.com`);
  await registerAs(C, `cpc-${stamp}@test.com`);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');
  // chatToggleBtn only becomes visible once the game actually starts (3 players).
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  await A.click('#chatToggleBtn');
  await A.waitForTimeout(200);

  const posBefore = await A.evaluate(() => {
    const r = document.getElementById('chatScreen').getBoundingClientRect();
    return { left: r.left, right: r.right, height: r.height, viewportWidth: window.innerWidth };
  });
  check('chat panel is positioned on the LEFT (left offset small, not near right edge)', posBefore.left < 40);
  check('chat panel does NOT span near the right edge of the viewport', posBefore.right < posBefore.viewportWidth - 40);

  console.log('--- sending 25 messages to force overflow ---');
  for (let i = 0; i < 25; i++) {
    await A.fill('#chatInput', `poruka broj ${i} - dovoljno teksta da testira prelivanje sadrzaja u malom panelu`);
    await A.click('#chatScreen >> text=Pošalji');
  }
  await A.waitForTimeout(400);

  const panelBox = await A.evaluate(() => {
    const el = document.getElementById('chatScreen');
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { height: r.height, maxHeight: cs.maxHeight, scrollHeightLog: document.getElementById('chatLog').scrollHeight, clientHeightLog: document.getElementById('chatLog').clientHeight };
  });
  console.log('panel box after 25 messages:', panelBox);

  check('chat panel height stayed bounded (<= ~380px, did not grow unbounded)', panelBox.height <= 380);
  check('chat log itself scrolls internally (scrollHeight > clientHeight, i.e. overflow is contained)', panelBox.scrollHeightLog > panelBox.clientHeightLog);

  const seatVisible = await A.evaluate(() => {
    const seat = document.getElementById('seat-south');
    return seat && seat.getBoundingClientRect().height > 0;
  });
  check('table (seat-south) still visible after chat overflow', seatVisible);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
