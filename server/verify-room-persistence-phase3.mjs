import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

const { stamp } = JSON.parse(fs.readFileSync('./persistence-test-snapshot.json', 'utf-8'));

async function loginAs(page, letter) {
  await page.click('text=🌐 Igraj online');
  await page.fill('#loginEmail', `${letter}-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen >> text=Uloguj se');
  await page.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 8000 });
}

async function main() {
  const browser = await chromium.launch();
  const [A, B, C] = await Promise.all([1, 2, 3].map(() => browser.newContext().then((c) => c.newPage())));
  await Promise.all([A, B, C].map((p) => p.goto(URL)));
  await Promise.all([loginAs(A, 'prA'), loginAs(B, 'prB'), loginAs(C, 'prC')]);
  await A.waitForTimeout(500);

  console.log('All 3 reconnected. Phase:', await A.evaluate(() => window.game?.state?.phase));
  const tricksBefore = await A.evaluate(() => window.game?.state?.tricks?.length ?? 0);

  // Play until at least one more trick completes (proves the restored
  // room's Game instance is genuinely live/functional, not just a frozen
  // display).
  let progressed = false;
  for (let i = 0; i < 60; i++) {
    for (const p of [A, B, C]) {
      const card = p.locator('#handArea .card.playable').first();
      if ((await card.count()) > 0) await card.click().catch(() => {});
    }
    await A.waitForTimeout(150);
    const tricksNow = await A.evaluate(() => window.game?.state?.tricks?.length ?? 0);
    if (tricksNow > tricksBefore) { progressed = true; break; }
  }
  console.log('Tricks before:', tricksBefore, 'after driving further play:', await A.evaluate(() => window.game?.state?.tricks?.length ?? 0));
  check('restored room genuinely continues (at least one more trick completed after reconnect)', progressed);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
