// Browser smoke test — pokreće dev server, otvara preferans.html u headless
// Chromium-u (Playwright), pušta "3 AI" demo mod da odigra nekoliko celih
// ruku i provjerava da partija stvarno napreduje kroz sve faze do kraja,
// bez grešaka u konzoli. Ovo pokriva app.js/UI sloj koji npm test (engine)
// ne dodiruje — engine testovi provjeravaju samo pravila, ne i da AI
// petlja u browseru zapravo odigra partiju do kraja.
//
// Pokretanje: npm run test:ui  (traži playwright — npm install prvo)

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000;
const URL = `http://localhost:${PORT}/preferans.html?smoketest=1`;
const HANDS_TO_PLAY = 2;
const TIMEOUT_MS = 90000;
const STUCK_MS = 10000; // AI delays su 400-600ms; 10s bez IKAKVE promene = stvaran zastoj

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

async function main() {
  const server = spawn(process.execPath, ['tools/serve.js'], { cwd: ROOT, stdio: 'pipe' });
  server.on('error', (e) => { throw e; });

  try {
    await waitForServer(URL, 10000);

    const browser = await chromium.launch();
    const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`); });

    await page.goto(URL, { waitUntil: 'load' });
    await page.click('#mode3ai');
    await page.click('text=🎮 Kreni!');

    let handsCompleted = 0;
    let lastSignature = null;
    let stuckSince = Date.now();
    let lastPhase = null;
    const start = Date.now();

    // Napredak = bilo koja promena u fazi, potezu, broju stihova, licitaciji,
    // pracenju ili kontri — ne samo top-level faza (PLAYING legitimno traje
    // 10+ sekundi dok se odigra 10 stihova, to NIJE zastoj).
    while (Date.now() - start < TIMEOUT_MS && handsCompleted < HANDS_TO_PLAY) {
      const s = await page.evaluate(() => {
        const st = window.game?.state;
        if (!st) return null;
        return {
          phase: st.phase,
          currentPlayer: st.currentPlayer,
          currentBidder: st.currentBidder,
          trickCount: st.trickCount,
          currentTrickLen: st.currentTrick.length,
          bidsLen: st.bids.length,
          followChoices: st.followChoices.join(','),
          kontraLevel: st.kontraLevel,
          mozeCount: st.mozeCount,
          round: st.round,
        };
      });
      if (s) {
        if (s.phase !== lastPhase) {
          lastPhase = s.phase;
          if (s.phase === 'GAME_OVER') handsCompleted++;
        }
        const signature = JSON.stringify(s);
        if (signature !== lastSignature) {
          lastSignature = signature;
          stuckSince = Date.now();
        } else if (Date.now() - stuckSince > STUCK_MS) {
          throw new Error(`Partija je zaglavljena (stanje nepromenjeno ${STUCK_MS}ms) u fazi "${s.phase}" — AI petlja se ne pomera.`);
        }
      }
      const nextBtn = page.locator('#nextRoundBtn');
      if (await nextBtn.count() > 0 && await nextBtn.first().isVisible().catch(() => false)) {
        await nextBtn.first().click().catch(() => {});
      }
      await page.waitForTimeout(200);
    }

    await browser.close();

    if (handsCompleted < HANDS_TO_PLAY) {
      throw new Error(`Samo ${handsCompleted}/${HANDS_TO_PLAY} ruke odigrane u ${TIMEOUT_MS}ms — partija se ne zavrsava.`);
    }
    if (errors.length > 0) {
      throw new Error(`Console/page greske tokom partije:\n${errors.join('\n')}`);
    }

    console.log(`OK — ${handsCompleted} ruke odigrane do kraja, 0 gresaka u konzoli.`);
  } finally {
    server.kill();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
