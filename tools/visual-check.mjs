// Snima screenshotove kljucnih trenutaka u igri za vizuelnu proveru UI-ja.
// Pokretanje: npm run visual:check
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tools', 'shots');
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:8000/preferans.html?visual=1';

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
  try {
    await waitForServer(URL, 10000);
    const browser = await chromium.launch();
    const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

    await page.goto(URL, { waitUntil: 'load' });
    await page.click('#mode1v2');
    await page.click('text=🎮 Kreni!');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, '01-hand-sorted.png') });

    // Odigraj do PLAYING/GAME_OVER da se popuni istorija, klikajuci sta stigne
    for (let i = 0; i < 60; i++) {
      const phase = await page.evaluate(() => window.game?.state?.phase).catch(() => null);
      if (phase === 'PLAYING') break;
      // ako je covekov red, samo pasiraj / prvi legalni potez da napredujemo
      const passBtn = page.locator('#bidControls button:has-text("Dalje")');
      if (await passBtn.count() > 0 && await passBtn.first().isVisible().catch(() => false)) {
        await passBtn.first().click().catch(() => {});
      }
      const moveBtn = page.locator('#bidControls button:has-text("Moze")');
      if (await moveBtn.count() > 0) await moveBtn.first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: join(OUT, '02-playing-status-bar.png') });

    // Klikni score dugme
    await page.click('.icon-btn:has-text("📊")').catch(() => {});
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, '03-score-modal.png') });
    await page.click('text=Zatvori').catch(() => {});

    // Odigraj 3AI partiju do kraja da tabela ima stvarne podatke
    await page.goto(URL, { waitUntil: 'load' });
    await page.click('#mode3ai');
    await page.click('text=🎮 Kreni!');
    const start2 = Date.now();
    let hands = 0, lastPhase2 = null;
    while (Date.now() - start2 < 40000 && hands < 2) {
      const phase = await page.evaluate(() => window.game?.state?.phase).catch(() => null);
      if (phase !== lastPhase2) { lastPhase2 = phase; if (phase === 'GAME_OVER') hands++; }
      const nextBtn = page.locator('#nextRoundBtn');
      if (await nextBtn.count() > 0 && await nextBtn.first().isVisible().catch(() => false)) {
        await nextBtn.first().click().catch(() => {});
      }
      await page.waitForTimeout(200);
    }
    await page.click('.icon-btn:has-text("📊")').catch(() => {});
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, '04-score-modal-with-data.png'), fullPage: true });

    console.log('Screenshots saved to', OUT);
    console.log('Console/page errors:', errors.length);
    if (errors.length) console.log(errors.slice(0, 10));
    await browser.close();
  } finally {
    server.kill();
  }
}

main();
