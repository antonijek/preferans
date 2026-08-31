// Pokrece N nezavisnih "3 AI" partija u headless Chromium-u da uhvati retke
// AI-zastoje koji zavise od konkretne podele karata (seed). Sam pokrece i
// gasi dev server. Pokretanje: npm run test:ui:multi [N]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'http://localhost:8000/preferans.html?multismoke=1';
const HANDS_PER_RUN = 6;
const TIMEOUT_MS = 90000;
const STUCK_MS = 10000;

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, rejectPromise) => {
    const tryOnce = () => {
      fetch(url).then(() => resolvePromise()).catch(() => {
        if (Date.now() > deadline) rejectPromise(new Error('Server nije startovao na vreme'));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newContext().then(c => c.newPage());
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#mode3ai');
  await page.click('text=🎮 Kreni!');

  let handsCompleted = 0;
  let lastPhase = null;
  let lastSignature = null;
  let stuckSince = Date.now();
  const start = Date.now();
  let failure = null;

  while (Date.now() - start < TIMEOUT_MS && handsCompleted < HANDS_PER_RUN) {
    const s = await page.evaluate(() => {
      const st = window.game?.state;
      if (!st) return null;
      return {
        phase: st.phase, currentPlayer: st.currentPlayer, currentBidder: st.currentBidder,
        trickCount: st.trickCount, currentTrickLen: st.currentTrick.length, bidsLen: st.bids.length,
        followChoices: st.followChoices.join(','), kontraLevel: st.kontraLevel, mozeCount: st.mozeCount,
      };
    }).catch(() => null);
    if (s) {
      if (s.phase !== lastPhase) { lastPhase = s.phase; if (s.phase === 'GAME_OVER') handsCompleted++; }
      const sig = JSON.stringify(s);
      if (sig !== lastSignature) { lastSignature = sig; stuckSince = Date.now(); }
      else if (Date.now() - stuckSince > STUCK_MS) { failure = `stuck in ${s.phase} (sig unchanged ${STUCK_MS}ms)`; break; }
    }
    const nextBtn = page.locator('#nextRoundBtn');
    if (await nextBtn.count() > 0 && await nextBtn.first().isVisible().catch(() => false)) {
      await nextBtn.first().click().catch(() => {});
    }
    await page.waitForTimeout(150);
  }
  await browser.close();
  return { handsCompleted, failure, errors };
}

async function main() {
  const server = spawn(process.execPath, ['tools/serve.js'], { cwd: ROOT, stdio: 'pipe' });
  server.on('error', (e) => { throw e; });
  try {
    await waitForServer(URL, 10000);
    const N = Number(process.argv[2] || 10);
    let totalFail = 0;
    for (let i = 0; i < N; i++) {
      const r = await run();
      const status = r.failure ? `FAIL(${r.failure})` : (r.errors.length ? 'ERR' : 'OK');
      console.log(`Run ${i}: ${status} hands=${r.handsCompleted} errors=${r.errors.length}`);
      if (r.errors.length) console.log(r.errors.slice(0, 5));
      if (r.failure || r.errors.length) totalFail++;
    }
    console.log('Total failing runs:', totalFail, '/', N);
    if (totalFail > 0) process.exitCode = 1;
  } finally {
    server.kill();
  }
}

main();
