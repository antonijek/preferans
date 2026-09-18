import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

const { code, snapshot, stamp } = JSON.parse(fs.readFileSync('./persistence-test-snapshot.json', 'utf-8'));
console.log('Reconnecting to room', code, 'from stamp', stamp);

async function loginAs(page, letter) {
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginEmail', `${letter}-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Uloguj se');
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newContext().then((c) => c.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  await loginAs(page, 'prA');

  // Server-side M6 reconnect should put A straight back at the table —
  // no manual "join room" needed, just logging back in.
  await page.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);

  const restored = await page.evaluate(() => ({
    phase: window.game?.state?.phase,
    trickCount: window.game?.state?.trickCount,
    currentTrickLen: window.game?.state?.currentTrick?.length,
    bulas: window.game?.state?.bulas,
    declaredGame: window.game?.state?.declaredGame,
    handLengths: window.game?.state?.players?.map((p) => p.hand.length),
    tricksLen: window.game?.state?.tricks?.length,
  }));
  console.log('RESTORED (after server restart, A logs back in):', JSON.stringify(restored));
  console.log('ORIGINAL SNAPSHOT (before restart):             ', JSON.stringify(snapshot));

  check('A landed directly on the table, not the room/home screen', restored.phase != null);
  check('phase matches (PLAYING)', restored.phase === snapshot.phase);
  check('declaredGame matches', restored.declaredGame === snapshot.declaredGame);
  check('bulas match', JSON.stringify(restored.bulas) === JSON.stringify(snapshot.bulas));
  check('currentTrick length matches (mid-trick state preserved)', restored.currentTrickLen === snapshot.currentTrickLen);
  check('A\'s own hand length matches (cards not reshuffled/lost)', restored.handLengths[0] === snapshot.handLengths[0]);
  check('no uncaught JS errors on reconnect', errors.length === 0);
  if (errors.length) console.log(errors);

  const screenActive = await page.evaluate(() => [...document.querySelectorAll('.screen.active')].map((e) => e.id));
  console.log('Active screens after reconnect:', screenActive);
  check('the actual table UI is showing (not room/home/login)', screenActive.includes('preferans') || !screenActive.some((s) => ['loginScreen', 'homeScreen', 'roomScreen', 'setupScreen'].includes(s)));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED — room persistence across server restart WORKS');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
