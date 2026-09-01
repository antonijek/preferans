import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function registerAs(page, email, stamp) {
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Registruj se');
  await page.waitForSelector('#roomScreen.active', { timeout: 5000 });
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));
  const consoleErrors = [];
  let xssFired = false;
  [A, B, C].forEach((p) => {
    p.on('pageerror', (e) => consoleErrors.push(e.message));
    p.exposeFunction('__reportXss', () => { xssFired = true; });
  });

  await Promise.all([A, B, C].map((p) => p.goto(URL)));

  // C registers with a malicious "email" (registration has no format
  // validation today) to prove the name-rendering paths are XSS-safe.
  const xssPayload = `<img src=x onerror="window.__reportXss && window.__reportXss()">-${stamp}@test.com`;
  await registerAs(A, `namesA-${stamp}@test.com`, stamp);
  await registerAs(B, `namesB-${stamp}@test.com`, stamp);
  await registerAs(C, xssPayload, stamp);

  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  console.log('--- real names on seats ---');
  const namesOnA = await A.evaluate(() => [
    document.getElementById('name-south').textContent,
    document.getElementById('name-east').textContent,
    document.getElementById('name-west').textContent,
  ]);
  console.log('Seat labels seen by A:', namesOnA);
  check('seat labels are NOT the generic Istok/Zapad placeholders', !namesOnA.includes('Istok') && !namesOnA.includes('Zapad'));
  check('at least one seat shows a real registered email', namesOnA.some((n) => n.includes('@test.com')));

  console.log('--- one bid click, check bid log uses real name ---');
  let acted = false;
  for (const p of [A, B, C]) {
    const btn = p.locator('#bidControls button.bid-btn').first();
    if ((await btn.count()) > 0) { await btn.click(); acted = true; break; }
  }
  check('performed a bid click', acted);
  await A.waitForTimeout(300);
  const bidLogText = await A.textContent('#bidLog');
  check('bid log does not show generic Istok/Zapad either', !bidLogText.includes('Istok') && !bidLogText.includes('Zapad'));

  console.log('--- XSS check: malicious "email" never executes, even after rendering in bid log / seat name ---');
  await A.waitForTimeout(500);
  check('XSS payload did NOT execute (window.__reportXss never called)', !xssFired);
  const rawHtmlHasImgTag = await A.evaluate(() => document.getElementById('bidLog').innerHTML.includes('<img'));
  check('the malicious name is NOT present as a live <img> tag in the DOM (properly escaped)', !rawHtmlHasImgTag);

  console.log('--- chat stays visible over the table, doesn\'t hide it ---');
  await A.click('#chatToggleBtn');
  await A.waitForTimeout(200);
  const tableStillVisible = await A.evaluate(() => {
    const seat = document.getElementById('seat-south');
    return seat && seat.offsetParent !== null; // still rendered/visible, not hidden by an overlay taking over layout
  });
  check('table (seat-south) still visible/rendered while chat panel is open', tableStillVisible);
  const chatPanelIsFixedOverlay = await A.evaluate(() => getComputedStyle(document.getElementById('chatScreen')).position === 'fixed');
  check('chat panel uses fixed positioning (floats over table, not a full-screen replace)', chatPanelIsFixedOverlay);

  console.log('no console errors:', consoleErrors.length === 0 ? 'true' : consoleErrors);
  check('no uncaught JS errors', consoleErrors.length === 0);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
