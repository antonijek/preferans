import { chromium } from 'playwright';

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

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const A = await (await browser.newContext()).newPage();
  const B = await (await browser.newContext()).newPage();
  const C = await (await browser.newContext()).newPage();

  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await registerAs(A, 'RoA', `roa-${stamp}@test.com`);
  await registerAs(B, 'RoB', `rob-${stamp}@test.com`);
  await registerAs(C, 'RoC', `roc-${stamp}@test.com`);

  console.log('--- custom bula=250, refe=4 ---');
  await A.fill('#roomStartBula', '250');
  await A.fill('#roomRefeCount', '4');
  await A.click('text=Napravi novu sobu');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  await B.fill('#roomCodeInput', code);
  await B.click('#roomScreen >> text=Pridruži se');
  await C.fill('#roomCodeInput', code);
  await C.click('#roomScreen >> text=Pridruži se');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });

  const bulas = await A.evaluate(() => window.game.state.bulas);
  const refePending = await A.evaluate(() => window.game.state.refePending);
  console.log('bulas:', bulas, 'refePending (budget hint):', refePending);
  check('all 3 players start at custom bula 250', bulas.every((b) => b === 250));

  console.log('--- out-of-range values get clamped server-side (bula=99999, refe=-5) ---');
  const D = await (await browser.newContext()).newPage();
  const E = await (await browser.newContext()).newPage();
  const F = await (await browser.newContext()).newPage();
  await Promise.all([D, E, F].map((p) => p.goto(URL)));
  await registerAs(D, 'RoD', `rod-${stamp}@test.com`);
  await registerAs(E, 'RoE', `roe-${stamp}@test.com`);
  await registerAs(F, 'RoF', `rof-${stamp}@test.com`);

  // .fill() sets the input's value directly, bypassing the HTML min/max
  // constraint (which only affects native form-submit validation) — same
  // as a malicious/buggy client sending an out-of-range value straight
  // over the socket. Server must clamp regardless.
  await D.fill('#roomStartBula', '99999');
  await D.fill('#roomRefeCount', '-5');
  await D.click('text=Napravi novu sobu');
  await D.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code2 = await D.inputValue('#roomCodeInput');
  await E.fill('#roomCodeInput', code2);
  await E.click('#roomScreen >> text=Pridruži se');
  await F.fill('#roomCodeInput', code2);
  await F.click('#roomScreen >> text=Pridruži se');
  await D.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 5000 });
  const bulas2 = await D.evaluate(() => window.game.state.bulas);
  console.log('bulas with out-of-range input:', bulas2);
  check('server clamped bula to max 300 (not 99999)', bulas2.every((b) => b === 300));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
