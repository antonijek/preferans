// Partija protiv računara preživi osvežavanje stranice (local-save.js): igra se do sredine ruke, stranica se
// osveži, „Nastavi partiju“ vraća isto stanje (iste karte, isti štih), a „Glavni meni“ i dalje nudi nastavak.
// Pokretanje: node tools/local-save-test.mjs

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8000;
const URL = `http://localhost:${PORT}/preferans.html?smoketest=1`;
const server = spawn(process.execPath, ['tools/serve.js'], { stdio: 'pipe' });
const fail = (msg) => { throw new Error(msg); };

async function waitFor(page, fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return;
    await page.waitForTimeout(150);
  }
  fail(`nije se desilo za ${ms} ms: ${what}`);
}

const snapshot = () => {
  const s = window.game.state;
  return JSON.stringify({
    round: s.round, phase: s.phase, trickCount: s.trickCount, currentPlayer: s.currentPlayer,
    currentTrick: s.currentTrick.map((c) => c.card?.id ?? c.id ?? JSON.stringify(c)),
    hands: s.players.map((p) => p.hand.map((c) => c.id).sort().join(' ')), bulas: s.bulas,
  });
};

const errors = [];
let browser;
try {
  await new Promise((r) => setTimeout(r, 800));
  browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 390, height: 844 } }).then((c) => c.newPage());
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  // lokalni test server nema /api (beleženje poseta); svaki drugi 404 je greška
  page.on('response', (r) => { if (r.status() === 404 && !new globalThis.URL(r.url()).pathname.startsWith('/api/')) errors.push(`404: ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`CONSOLE: ${m.text()}`); });
  await page.goto(URL, { waitUntil: 'load' });
  if (await page.isVisible('#resumeLocalBtn')) fail('dugme za nastavak vidljivo bez sačuvane partije');

  // računari igraju za sva tri mesta dok ne krene igranje, onda čovek preuzima mesto 0 i čeka se njegov red
  let ready = false;
  for (let attempt = 0; attempt < 6 && !ready; attempt++) {
    await page.evaluate(() => { setGameMode('3ai'); startGame(); });
    try {
      await waitFor(page, () => window.game.state.phase === 'PLAYING' && window.game.state.trickCount >= 2, 30000, 'igranje, 2 štiha');
      await page.evaluate(() => setGameMode('1v2'));
      await waitFor(page, () => window.game.state.phase === 'PLAYING' && window.game.state.currentPlayer === 0, 8000, 'red na čoveka');
      ready = true;
    } catch (e) {
      console.log(`pokušaj ${attempt + 1}: ${e.message}, delim ponovo`);
    }
  }
  if (!ready) fail('nije uspelo da se dođe do sredine ruke sa čovekom na potezu');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.render());
  const before = await page.evaluate(snapshot);
  console.log('pre osvežavanja:', before);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#resumeLocalBtn', { state: 'visible', timeout: 5000 });
  const label = await page.textContent('#resumeLocalBtn');
  if (!/krug \d+/.test(label)) fail(`tekst dugmeta: ${label}`);
  await page.click('#resumeLocalBtn');
  await waitFor(page, () => !document.getElementById('setupScreen').classList.contains('active'), 3000, 'sto posle nastavka');
  const after = await page.evaluate(snapshot);
  if (after !== before) fail(`stanje posle nastavka se razlikuje:\n${after}`);
  const legal = await page.evaluate(() => window.game.getLegalCards(0).length);
  if (legal === 0) fail('čovek nema legalnu kartu posle nastavka');
  console.log('posle nastavka isto stanje, legalnih karata:', legal);

  // čovek odigra kartu, računari nastavljaju: igra ide dalje posle nastavka
  await page.evaluate(() => { const c = window.game.getLegalCards(0)[0]; window.game.playCard(0, c.id); window.render(); });
  await waitFor(page, () => window.game.state.currentPlayer === 0 || window.game.state.phase !== 'PLAYING', 10000, 'računari odigrali posle čoveka');
  console.log('računari igraju posle nastavka');

  await page.evaluate(() => backToSetup());
  if (!(await page.isVisible('#resumeLocalBtn'))) fail('posle „Glavni meni“ nema dugmeta za nastavak');
  console.log('glavni meni nudi nastavak');
} finally {
  await browser?.close();
  server.kill();
}
if (errors.length) { console.error('GREŠKE:\n' + errors.join('\n')); process.exit(1); }
console.log('OK — partija protiv računara se nastavlja posle osvežavanja');
