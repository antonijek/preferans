import { chromium } from 'playwright';
import { URL, makeChecker, registerFromHome, phaseOf, roundOf, TERMINAL, driveUntil, agreeEndMatch } from './verify-helpers.mjs';

// Pregled partije i licna statistika (replay.html/js, stats-view.js,
// server/src/replay.ts + stats.ts): tri igraca odigraju 2 ruke i dogovore
// kraj; A u "Moje partije" vidi statistiku i otvara pregled — sve tri ruke
// od po 10 karata, licitacija, koraci do kraja ruke, link nosi mesto. D (nije
// igrao) ne sme da vidi tu partiju.

const { check, state } = makeChecker();
const SHOT = process.env.SHOT_DIR;

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C, D] = await Promise.all([1, 2, 3, 4].map(() => browser.newContext().then((c) => c.newPage())));
  const errors = [];
  [A, B, C, D].forEach((p, i) => p.on('pageerror', (e) => errors.push(`page${'ABCD'[i]}: ${e.message}`)));
  for (const [p, l] of [[A, 'a'], [B, 'b'], [C, 'c'], [D, 'd']]) await registerFromHome(p, `Rp-${l}`, `rp${l}-${stamp}@test.com`);

  await A.click('[onclick="goToRoomScreen()"]');
  await A.click('[onclick="createRoomOnline()"]');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  for (const p of [B, C]) {
    await p.click('[onclick="goToRoomScreen()"]');
    await p.fill('#roomCodeInput', code);
    await p.click('#roomJoinBtn');
  }
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 8000 });

  const twoHands = async () => (await roundOf(A)) >= 3 || ((await roundOf(A)) >= 2 && TERMINAL.includes(await phaseOf(A)));
  check('odigrane 2 ruke', await driveUntil([A, B, C], twoHands, { dealNext: true, maxIters: 3000 }));
  if ((await phaseOf(A)) !== 'MATCH_OVER') await agreeEndMatch(A, [B, C]);

  // --- Moje partije: statistika i link na pregled ---
  await A.goto(`${URL}matches.html`);
  await A.waitForSelector('#statsBox:not([hidden]) .stat-tile', { timeout: 8000 });
  check('statistika: 1 partija', (await A.textContent('#statsBox .stat-tile .stat-value')) === '1');
  if (SHOT) await A.screenshot({ path: `${SHOT}/stats.png`, fullPage: true });
  await A.click('#matchesBody .replay-link');
  await A.waitForSelector('#rpBody:not([hidden])', { timeout: 8000 });
  const options = await A.$$eval('#rpHandSelect option', (o) => o.length);
  check(`pregled: ${options} ruke u izboru (bar 2)`, options >= 2);
  const counts = await A.evaluate(() => ['rpSeatA', 'rpSeatB', 'rpSeatMe'].map((id) => document.querySelectorAll(`#${id} .rp-hand .rp-card`).length));
  check(`deljenje: sve tri ruke po 10 karata (${counts})`, counts.every((n) => n === 10));
  check('licitacija prikazana', (await A.textContent('#rpInfo')).includes('Licitacija'));
  if (SHOT) await A.screenshot({ path: `${SHOT}/replay-start.png`, fullPage: true });

  await A.click('#rpNext');
  await A.click('#rpNext');
  check('link nosi ruku i korak', /ruka=1&korak=3/.test(A.url()));
  await A.click('#rpLast');
  check('kraj ruke', (await A.textContent('#rpStepText')).includes('kraj ruke'));
  if (SHOT) await A.screenshot({ path: `${SHOT}/replay-end.png`, fullPage: true });

  // otvaranje linka do mesta vraca isto mesto
  const placeUrl = `${URL}replay.html?id=${new globalThis.URL(A.url()).searchParams.get('id')}&ruka=2&korak=4`;
  await A.goto(placeUrl);
  await A.waitForSelector('#rpBody:not([hidden])', { timeout: 8000 });
  check('link do mesta: ruka 2, korak 4', (await A.inputValue('#rpHandSelect')) === '1' && (await A.textContent('#rpStepText')).includes('korak 4/'));
  await A.setViewportSize({ width: 390, height: 844 });
  if (SHOT) await A.screenshot({ path: `${SHOT}/replay-phone.png`, fullPage: true });
  check('telefon: bez vodoravnog skrola', await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // --- tudja partija ---
  await D.goto(placeUrl);
  await D.waitForFunction(() => document.getElementById('rpError').textContent.length > 0, { timeout: 8000 });
  check('igrac koji nije igrao ne vidi partiju', (await D.textContent('#rpError')).includes('samo njeni igrači'));

  check('nema JS gresaka', errors.length === 0);
  if (errors.length) console.log(errors);
  await browser.close();
  console.log(state.failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(state.failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
